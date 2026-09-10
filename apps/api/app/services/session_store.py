"""
Session Store — Redis-backed session persistence for Mock Q&A.

Phase 3: Session persistence with Redis.
"""

import logging
import json
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    redis = None
    REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)


class SessionStore:
    """
    Redis-backed session store for Mock Q&A sessions.
    
    Provides:
    - Async save/load session state
    - TTL-based expiration
    - Automatic cleanup of stale sessions
    """
    
    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/1",
        default_ttl: int = 3600,  # 1 hour
        cleanup_interval: int = 300,  # 5 minutes
    ):
        self.redis_url = redis_url
        self.default_ttl = default_ttl
        self.cleanup_interval = cleanup_interval
        self._client = None
        self._cleanup_task = None
    
    async def initialize(self):
        """Initialize Redis connection and start cleanup task."""
        if not REDIS_AVAILABLE:
            logger.warning("redis-py not available, session persistence disabled")
            return
        
        try:
            self._client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            # Test connection
            await self._client.ping()
            logger.info("Redis session store connected")
            
            # Start periodic cleanup
            self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
            
        except Exception as exc:
            logger.warning(f"Redis connection failed: {exc}, session persistence disabled")
            self._client = None
    
    async def close(self):
        """Close connections and stop cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        if self._client:
            await self._client.close()
    
    def _session_key(self, meeting_id: int) -> str:
        """Generate Redis key for session."""
        return f"mock_qa:{meeting_id}"
    
    async def save(self, meeting_id: int, session_data: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """Save session to Redis."""
        if not self._client:
            return False
        
        try:
            key = self._session_key(meeting_id)
            ttl = ttl or self.default_ttl
            
            data = json.dumps(session_data, ensure_ascii=False, default=str)
            await self._client.setex(key, ttl, data)
            logger.debug(f"Saved session for meeting {meeting_id}")
            return True
        except Exception as exc:
            logger.warning(f"Failed to save session {meeting_id}: {exc}")
            return False
    
    async def load(self, meeting_id: int) -> Optional[Dict[str, Any]]:
        """Load session from Redis."""
        if not self._client:
            return None
        
        try:
            key = self._session_key(meeting_id)
            data = await self._client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as exc:
            logger.warning(f"Failed to load session {meeting_id}: {exc}")
            return None
    
    async def delete(self, meeting_id: int) -> bool:
        """Delete session from Redis."""
        if not self._client:
            return False
        
        try:
            key = self._session_key(meeting_id)
            result = await self._client.delete(key)
            return result > 0
        except Exception as exc:
            logger.warning(f"Failed to delete session {meeting_id}: {exc}")
            return False
    
    async def extend_ttl(self, meeting_id: int, ttl: Optional[int] = None) -> bool:
        """Extend session TTL."""
        if not self._client:
            return False
        
        try:
            key = self._session_key(meeting_id)
            ttl = ttl or self.default_ttl
            await self._client.expire(key, ttl)
            return True
        except Exception as exc:
            logger.warning(f"Failed to extend TTL for {meeting_id}: {exc}")
            return False
    
    async def _periodic_cleanup(self):
        """Periodic cleanup of expired sessions."""
        while True:
            try:
                await asyncio.sleep(self.cleanup_interval)
                # Redis handles TTL expiration automatically
                # This is just for logging/monitoring
                logger.debug("Session store periodic cleanup tick")
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning(f"Cleanup error: {exc}")
    
    async def get_active_sessions_count(self) -> int:
        """Get count of active sessions."""
        if not self._client:
            return 0
        
        try:
            keys = await self._client.keys("mock_qa:*")
            return len(keys)
        except Exception:
            return 0


# Global instance
_session_store: Optional["SessionStore"] = None


async def get_session_store() -> "SessionStore":
    """Get global session store instance."""
    global _session_store
    if _session_store is None:
        _session_store = SessionStore()
        await _session_store.initialize()
    return _session_store


async def close_session_store():
    """Close global session store."""
    global _session_store
    if _session_store:
        await _session_store.close()
        _session_store = None
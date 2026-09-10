"""
Circuit Breaker pattern for AI gateway.

Prevents cascading failures when the AI provider is down.
Transitions: CLOSED → OPEN → HALF_OPEN → CLOSED

Usage:
    from app.services.circuit_breaker import CircuitBreaker, CircuitOpenError

    breaker = CircuitBreaker(failure_threshold=5, timeout_seconds=60)

    try:
        result = await breaker.call(ai_gateway.generate, prompt="...")
    except CircuitOpenError:
        # AI is down, use fallback
        result = await fallback_generate(prompt="...")
"""
import logging
import time
from enum import Enum
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"       # Bình thường, gọi AI bình thường
    OPEN = "open"           # AI lỗi quá nhiều → tạm ngừng gọi
    HALF_OPEN = "half-open" # Đã hết timeout, thử gọi lại 1 lần


class CircuitOpenError(Exception):
    """Raised when the circuit breaker is open (AI provider temporarily unavailable)."""
    pass


class CircuitBreaker:
    """
    Circuit breaker for AI provider calls.

    - CLOSED: calls pass through normally
    - OPEN: all calls raise CircuitOpenError immediately
    - HALF_OPEN: one probe call allowed; success → CLOSED, failure → OPEN
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        timeout_seconds: int = 60,
        name: str = "default",
    ):
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.name = name
        self.failures = 0
        self.last_failure: float | None = None
        self.state = CircuitState.CLOSED

    def _check_timeout(self) -> bool:
        """Return True if timeout has elapsed since last failure."""
        if self.last_failure is None:
            return False
        return time.time() - self.last_failure >= self.timeout_seconds

    async def call(
        self,
        func: Callable[..., Coroutine[Any, Any, Any]],
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """
        Call func through the circuit breaker.

        Raises CircuitOpenError when the breaker is open.
        """
        if self.state == CircuitState.OPEN:
            if self._check_timeout():
                logger.info(
                    "[CircuitBreaker:%s] Timeout elapsed, transitioning OPEN → HALF_OPEN",
                    self.name,
                )
                self.state = CircuitState.HALF_OPEN
            else:
                raise CircuitOpenError(
                    f"[CircuitBreaker:{self.name}] AI provider is temporarily unavailable "
                    f"(failures={self.failures}, retry in {self.timeout_seconds}s)"
                )

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except CircuitOpenError:
            raise
        except Exception as exc:
            self._on_failure()
            raise

    def _on_success(self) -> None:
        self.failures = 0
        if self.state == CircuitState.HALF_OPEN:
            logger.info("[CircuitBreaker:%s] Probe call succeeded → CLOSED", self.name)
        self.state = CircuitState.CLOSED

    def _on_failure(self) -> None:
        self.failures += 1
        self.last_failure = time.time()
        if self.state == CircuitState.HALF_OPEN:
            logger.warning(
                "[CircuitBreaker:%s] Probe call failed → OPEN (failures=%d)",
                self.name,
                self.failures,
            )
            self.state = CircuitState.OPEN
        elif self.failures >= self.failure_threshold:
            logger.error(
                "[CircuitBreaker:%s] Failure threshold reached (%d/%d) → OPEN",
                self.name,
                self.failures,
                self.failure_threshold,
            )
            self.state = CircuitState.OPEN

    def get_status(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "failures": self.failures,
            "threshold": self.failure_threshold,
            "timeout_seconds": self.timeout_seconds,
            "last_failure": self.last_failure,
        }


# Singleton instances for different services
code_review_breaker = CircuitBreaker(
    failure_threshold=5,
    timeout_seconds=60,
    name="code_review",
)

question_gen_breaker = CircuitBreaker(
    failure_threshold=3,
    timeout_seconds=30,
    name="question_gen",
)

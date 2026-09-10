"""Auth dependencies: get current user + RBAC role guard."""
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    # selectinload để tránh lazy-load relationship trong async context
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == int(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User không tồn tại hoặc bị khoá")
    return user


def require_role(*allowed: str):
    """Dependency factory: chỉ cho qua nếu user có ≥1 role trong `allowed`.

    Dùng: `user: User = Depends(require_role("admin", "mentor"))`
    """

    async def _check(user: User = Depends(get_current_user)) -> User:
        user_roles = {r.name for r in user.roles}
        if not (set(allowed) & user_roles):
            raise HTTPException(status_code=403, detail="Không đủ quyền truy cập")
        return user

    return _check


async def get_current_user_ws(token: str, db_session_maker) -> User | None:
    """Variant cho WebSocket: decode token thủ công (không dùng OAuth2 scheme).

    Trả về User hoặc None nếu token không hợp lệ. Dùng trong signaling / mock-qa WS.
    """
    from app.core.security import decode_access_token

    try:
        payload = decode_access_token(token)
    except Exception:
        return None
    async with db_session_maker() as db:
        result = await db.execute(
            select(User)
            .options(selectinload(User.roles))
            .where(User.id == int(payload["sub"]))
        )
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            return None
        return user

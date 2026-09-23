from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
import os
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import UpdateMeRequest

router = APIRouter(prefix="/api/user", tags=["user"])
security = HTTPBearer()

# Directory for user uploads
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "avatars"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "wallpapers"), exist_ok=True)


@router.get("/profile")
async def get_user_profile(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    user = get_current_user(credentials, db)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar": user.avatar,
        "wallpaper": user.wallpaper,
        "created_at": user.created_at.isoformat() if user.created_at else None
    }


@router.put("/profile")
async def update_user_profile(
    profile_data: UpdateMeRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    user = get_current_user(credentials, db)

    # Update fields
    if profile_data.full_name is not None:
        user.full_name = profile_data.full_name

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar": user.avatar,
        "wallpaper": user.wallpaper,
        "updated_at": datetime.utcnow().isoformat()
    }


@router.post("/avatar")
async def upload_avatar(
    avatar: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Upload user avatar"""
    user = get_current_user(credentials, db)

    # Generate unique filename
    filename = f"avatar_{user.id}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = os.path.join(UPLOAD_DIR, "avatars", filename)

    # Save avatar
    with open(filepath, "wb") as f:
        f.write(avatar.split(",")[1])  # Remove data URL prefix

    # Update user
    user.avatar = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(user)

    return {
        "avatar_url": user.avatar,
        "message": "Avatar uploaded successfully"
    }


@router.delete("/avatar")
async def delete_avatar(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Delete user avatar"""
    user = get_current_user(credentials, db)

    if user.avatar and user.avatar.startswith("/uploads/avatars/"):
        # Delete file
        filepath = os.path.join(UPLOAD_DIR, user.avatar.lstrip("/"))
        if os.path.exists(filepath):
            os.remove(filepath)

    user.avatar = None
    db.commit()

    return {
        "message": "Avatar deleted successfully"
    }


@router.post("/wallpaper")
async def upload_wallpaper(
    wallpaper: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Upload user wallpaper"""
    user = get_current_user(credentials, db)

    # Generate unique filename
    filename = f"wallpaper_{user.id}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = os.path.join(UPLOAD_DIR, "wallpapers", filename)

    # Save wallpaper
    with open(filepath, "wb") as f:
        f.write(wallpaper.split(",")[1])  # Remove data URL prefix

    # Update user
    user.wallpaper = f"/uploads/wallpapers/{filename}"
    db.commit()
    db.refresh(user)

    return {
        "wallpaper_url": user.wallpaper,
        "message": "Wallpaper uploaded successfully"
    }


@router.delete("/wallpaper")
async def delete_wallpaper(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Delete user wallpaper"""
    user = get_current_user(credentials, db)

    if user.wallpaper and user.wallpaper.startswith("/uploads/wallpapers/"):
        # Delete file
        filepath = os.path.join(UPLOAD_DIR, user.wallpaper.lstrip("/"))
        if os.path.exists(filepath):
            os.remove(filepath)

    user.wallpaper = None
    db.commit()

    return {
        "message": "Wallpaper deleted successfully"
    }

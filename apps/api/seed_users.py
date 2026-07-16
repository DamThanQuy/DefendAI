"""Seed 3 tài khoản test (admin / mentor / student) vào DB.

Chạy sau khi alembic migrate xong (gọi từ entrypoint.sh).
Idempotent: ON CONFLICT (email) DO NOTHING — chạy lại nhiều lần không lỗi.

Bảo mật: chỉ dùng cho dev/local. Trên prod đặt SEED_DEMO=false để bỏ qua,
hoặc đổi SEED_DEMO_PASSWORD thành mật khẩu mạnh.
"""
import os

import psycopg2
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Mật khẩu chung cho 3 acc test (bcrypt hash, không lưu plaintext)
DEMO_PW = os.getenv("SEED_DEMO_PASSWORD", "DefendAI@123")
HASH = pwd.hash(DEMO_PW)

# (username, email, full_name, role)
SEED = [
    ("admin", "admin@defendai.dev", "Admin DefendAI", "admin"),
    ("mentor", "mentor@defendai.dev", "Mentor DefendAI", "mentor"),
    ("student", "student@defendai.dev", "Student DefendAI", "student"),
]


def main() -> None:
    # Bỏ qua seed trên prod nếu SEED_DEMO=false
    if os.getenv("SEED_DEMO", "true").lower() == "false":
        print("⏭ SEED_DEMO=false — bỏ qua seed users")
        return

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise SystemExit("DATABASE_URL không được thiết lập")
    # Alembic dùng asyncpg; psycopg2.connect không nhận scheme "+psycopg2"
    # → chỉ giữ "postgresql://"
    dsn = db_url.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgresql+psycopg2://", "postgresql://"
    )

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            for username, email, full_name, role in SEED:
                # Upsert luôn RETURNING id (kể cả khi user đã tồn tại)
                # → đảm bảo role được gán dù seed chạy dở lần trước
                cur.execute(
                    "INSERT INTO users "
                    "(username, email, full_name, hashed_password, auth_provider, is_active, created_at) "
                    "VALUES (%s, %s, %s, %s, 'email', 1, now()) "
                    "ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id",
                    (username, email, full_name, HASH),
                )
                uid = cur.fetchone()[0]
                cur.execute("SELECT id FROM roles WHERE name = %s", (role,))
                rid = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) "
                    "ON CONFLICT DO NOTHING",
                    (uid, rid),
                )
        conn.commit()
    finally:
        conn.close()
    print("✅ Seed users done (admin / mentor / student)")


if __name__ == "__main__":
    main()

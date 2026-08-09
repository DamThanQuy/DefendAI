"""Seed tài khoản hệ thống (admin / mentor) + tài khoản demo (student) vào DB.

Chạy sau khi alembic migrate xong (gọi từ entrypoint.sh).
Idempotent: ON CONFLICT (email) DO NOTHING — chạy lại nhiều lần không lỗi.

Phân loại:
- SYSTEM_SEED: admin + mentor — LUÔN được seed (cần thiết để hệ thống hoạt động,
  ví dụ student đặt lịch phải chọn được mentor). Không bị ảnh hưởng bởi SEED_DEMO.
- DEMO_SEED: student — chỉ seed khi SEED_DEMO=true (mặc định true ở local/dev).

Bảo mật: đổi SEED_DEMO_PASSWORD thành mật khẩu mạnh trên prod.
"""
import os

import psycopg2
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Mật khẩu chung cho các acc seed (bcrypt hash, không lưu plaintext)
DEMO_PW = os.getenv("SEED_DEMO_PASSWORD", "DefendAI@123")
HASH = pwd.hash(DEMO_PW)

# Tài khoản hệ thống — luôn seed (admin + mentor)
SYSTEM_SEED = [
    ("admin", "admin@defendai.dev", "Admin DefendAI", "admin"),
    ("mentor", "mentor@defendai.dev", "Mentor DefendAI", "mentor"),
]

# Tài khoản demo — chỉ seed khi SEED_DEMO=true
DEMO_SEED = [
    ("student", "student@defendai.dev", "Student DefendAI", "student"),
]


def main() -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise SystemExit("DATABASE_URL không được thiết lập")
    # Alembic dùng asyncpg; psycopg2.connect không nhận scheme "+psycopg2"
    # → chỉ giữ "postgresql://"
    dsn = db_url.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgresql+psycopg2://", "postgresql://"
    )

    seed_demo = os.getenv("SEED_DEMO", "true").lower() != "false"
    accounts = list(SYSTEM_SEED)
    if seed_demo:
        accounts += DEMO_SEED
    else:
        print("⏭ SEED_DEMO=false — bỏ qua seed tài khoản demo (student)")

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            for username, email, full_name, role in accounts:
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

            # Seed lịch rảnh mặc định cho mentor (để student có thể đặt lịch ngay)
            # Chỉ chạy cho tài khoản mentor trong SYSTEM_SEED. Idempotent: bỏ qua
            # nếu mentor đã có slot nào đó rồi.
            mentor_emails = {e for (_, e, _, r) in SYSTEM_SEED if r == "mentor"}
            for (_, email, _, role) in accounts:
                if role != "mentor":
                    continue
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                mid = cur.fetchone()[0]
                cur.execute(
                    "SELECT 1 FROM mentor_availability WHERE mentor_id = %s LIMIT 1",
                    (mid,),
                )
                if cur.fetchone() is None:
                    # Khung giờ rảnh mặc định: T2-T6, 08:00-17:00 (mỗi slot 1h)
                    slots = []
                    for dow in range(0, 5):  # 0=T2 ... 4=T6
                        for h in range(8, 17):  # 08:00 .. 16:00
                            start = f"{h:02d}:00"
                            end = f"{h+1:02d}:00"
                            slots.append((mid, dow, start, end))
                    cur.executemany(
                        "INSERT INTO mentor_availability "
                        "(mentor_id, day_of_week, start_time, end_time, is_available, week_pattern) "
                        "VALUES (%s, %s, %s, %s, TRUE, 'all')",
                        slots,
                    )
                    print(f"🗓 Seed lịch rảnh cho mentor {email} ({len(slots)} slot)")
        conn.commit()
    finally:
        conn.close()
    print("✅ Seed users done (admin / mentor" + (" / student" if seed_demo else "") + ")")


if __name__ == "__main__":
    main()

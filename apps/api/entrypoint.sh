#!/usr/bin/env bash
set -e

echo "Running migrations (alembic upgrade heads)..."
alembic upgrade heads

echo "Seeding demo users..."
python seed_users.py

echo "Starting uvicorn..."
# Docker không dùng --reload: watchfiles có thể crash do giới hạn memory/inotify.
# Bật DEV_RELOAD=true nếu thật sự cần hot reload khi phát triển local.
if [ "${DEV_RELOAD:-false}" = "true" ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
# EOF

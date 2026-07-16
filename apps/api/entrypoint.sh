#!/usr/bin/env bash
set -e

echo "▶ Running migrations (alembic upgrade head)..."
alembic upgrade head

echo "▶ Seeding demo users..."
python seed_users.py

echo "▶ Starting uvicorn..."
# exec để container bắt được signal (Ctrl+C / docker stop)
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

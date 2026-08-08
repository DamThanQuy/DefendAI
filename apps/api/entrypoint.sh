#!/usr/bin/env bash
set -e

echo "â–¶ Running migrations (alembic upgrade head)..."
alembic upgrade head

echo "â–¶ Seeding demo users..."
python seed_users.py

echo "â–¶ Starting uvicorn..."
# exec Ä‘á»ƒ container báº¯t Ä‘Æ°á»£c signal (Ctrl+C / docker stop)
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

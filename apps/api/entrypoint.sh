#!/usr/bin/env bash
set -e

echo "Running migrations (alembic upgrade heads)..."
alembic upgrade heads

echo "Seeding demo users..."
python seed_users.py

echo "Seeding rubrics..."
python seed_rubrics.py

echo "Starting uvicorn..."
# exec de container bat duoc signal (Ctrl+C / docker stop)
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# EOF

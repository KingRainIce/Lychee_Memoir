#!/bin/sh
set -e
cd /app

python -c "
from sqlalchemy import text
from app.db import engine
with engine.connect() as conn:
    conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
    conn.commit()
"

alembic upgrade head

python -c "from app.seed import ensure_seed; ensure_seed()"

exec uvicorn app.main:app --host 0.0.0.0 --port 8000

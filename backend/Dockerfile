FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libpq5 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY backend/docker-entry.sh /docker-entry.sh
RUN chmod +x /docker-entry.sh

RUN mkdir -p /app/data
COPY frontend/public/annotations.json /app/data/annotations.json

ENV PYTHONPATH=/app

# 迁移与种子在独立阶段执行，避免在 Uvicorn lifespan 内跑 Alembic 时在某些环境永久阻塞（前端登录一直转圈）。
CMD ["/docker-entry.sh"]

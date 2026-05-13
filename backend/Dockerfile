FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e .

COPY . .

# entrypoint.sh is COPYed in by `COPY . .` above. Some hosts strip the
# executable bit on bind-mount paths, so set it explicitly here.
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

# Entrypoint runs alembic migrations, then execs uvicorn.
ENTRYPOINT ["/app/entrypoint.sh"]

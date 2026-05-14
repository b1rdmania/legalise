FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Vendor the claude-for-uk-legal plugin suite at a pinned commit. Dev
# bind-mounts a sibling checkout (see infra/docker-compose.yml); the
# image needs its own copy because there is no sibling checkout on Fly.
# Update PLUGINS_REPO_REF when a new plugin release is needed; the build
# will fail loudly if the ref does not exist.
ARG PLUGINS_REPO=https://github.com/b1rdmania/claude-for-uk-legal.git
ARG PLUGINS_REPO_REF=3fb0ea86ad49f92d90fbd9dcfbee70f5947ba31c
RUN git clone --filter=blob:none "$PLUGINS_REPO" /plugins \
    && git -C /plugins checkout "$PLUGINS_REPO_REF" \
    && rm -rf /plugins/.git

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e .

COPY . .

# entrypoint.sh is COPYed in by `COPY . .` above. Some hosts strip the
# executable bit on bind-mount paths, so set it explicitly here.
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

# Entrypoint runs alembic migrations, then execs uvicorn.
ENTRYPOINT ["/app/entrypoint.sh"]

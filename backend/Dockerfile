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

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e .

# spaCy NER model for the Phase C anonymisation pipeline (Presidio).
# Distributed outside PyPI; install after the editable install above.
# `en_core_web_sm` is ~12MB; the larger `_lg` model can be swapped in
# at runtime via the PRESIDIO_MODEL env var if higher recall matters.
# Without this step the first POST to /api/documents/{id}/anonymise
# returns 503 with install guidance.
RUN python -m spacy download en_core_web_sm

COPY . .

# entrypoint.sh is COPYed in by `COPY . .` above. Some hosts strip the
# executable bit on bind-mount paths, so set it explicitly here.
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

# Entrypoint runs alembic migrations, then execs uvicorn.
ENTRYPOINT ["/app/entrypoint.sh"]

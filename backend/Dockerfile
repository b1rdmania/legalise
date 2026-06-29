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
# The `anonymisation` (Presidio + spaCy) and `retrieval` (fastembed)
# extras are optional in pyproject but installed here: the demo/dev image
# ships batteries-included. A slim/offline deploy can drop the extras and
# set LEGALISE_EMBEDDING_BACKEND=hash; anonymisation endpoints then return
# 503 with install guidance, and retrieval falls back to the keyless hash
# backend instead of crashing.
RUN pip install --upgrade pip && pip install -e ".[anonymisation,retrieval]"

# spaCy NER model for the Phase C anonymisation pipeline (Presidio).
# Distributed outside PyPI; install after the editable install above.
# `en_core_web_sm` is ~12MB; the larger `_lg` model can be swapped in
# at runtime via the PRESIDIO_MODEL env var if higher recall matters.
# Without this step the first POST to /api/documents/{id}/anonymise
# returns 503 with install guidance.
RUN python -m spacy download en_core_web_sm

# Pre-warm the fastembed retrieval model (BAAI/bge-small-en-v1.5, ~130MB)
# into the image layer so the FIRST evaluator request never pays a runtime
# model download. Uses the same default cache dir the runtime resolves, so
# the warmed model is found on first embed. Skipped naturally for slim
# deploys that drop the retrieval extra (this line would then no-op-fail —
# keep it after the extra install so it only runs when fastembed is present).
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

COPY . .

# entrypoint.sh is COPYed in by `COPY . .` above. Some hosts strip the
# executable bit on bind-mount paths, so set it explicitly here.
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

# Entrypoint runs alembic migrations, then execs uvicorn.
ENTRYPOINT ["/app/entrypoint.sh"]

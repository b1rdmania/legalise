from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post("/{document_id}/anonymise", response_model=AnonymisationResult)
async def post_anonymise_document(
    document_id: uuid.UUID,
    body: AnonymiseRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AnonymisationResult:
    """Run anonymisation and UPSERT the `redacted` DocumentBody."""
    try:
        result = await anonymise_document(
            session=session,
            gateway=model_gateway,
            document_id=document_id,
            actor_id=user.id,
            engine=body.engine,
            entity_types=body.entity_types,
            threshold=body.threshold,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except PROVIDER_HTTP_EXCEPTIONS as exc:
        raise provider_error_http_exception(exc) from exc
    except RuntimeError as exc:
        # Presidio not installed in this environment. 503 communicates
        # "service is real but disabled" more honestly than 500.
        raise HTTPException(503, f"anonymisation engine unavailable: {exc}") from exc

    await session.commit()
    return result


@router.get("/{document_id}/anonymise", response_model=AnonymisationResult)
async def get_anonymise_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AnonymisationResult:
    """Return the most recent redacted body for this document."""
    await _load_owned_document(document_id, session, user)
    redacted = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    if redacted is None:
        raise HTTPException(404, "no anonymised body for this document")
    return _result_from_redacted(redacted)


@router.get("/{document_id}/anonymise/mapping", response_model=MappingRead)
async def get_anonymise_mapping(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> MappingRead:
    """Return the token → original mapping. Matter-owner-only.

    `_load_owned_document` already enforces owner-only via 404; we
    additionally write a `module.anonymisation.viewed` audit row so
    mapping reveals are traceable.
    """
    doc, matter = await _load_owned_document(document_id, session, user)
    redacted = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    if redacted is None:
        raise HTTPException(404, "no anonymised body for this document")

    mapping = redacted.mapping if isinstance(redacted.mapping, dict) else {}
    token_map = mapping.get("tokens") if isinstance(mapping, dict) else None
    tokens: list[TokenMapping] = []
    if isinstance(token_map, dict):
        for token, meta in token_map.items():
            if not isinstance(token, str) or not isinstance(meta, dict):
                continue
            tokens.append(
                TokenMapping(
                    token=token,
                    entity_type=str(meta.get("entity_type", "")),
                    original=str(meta.get("original", "")),
                    occurrences=int(meta.get("occurrences", 0) or 0),
                )
            )
    tokens.sort(key=lambda t: (t.token.split("_", 1)[0], t.token))

    raw_spans = mapping.get("spans") if isinstance(mapping, dict) else None
    spans = raw_spans if isinstance(raw_spans, list) else []

    await audit.log(
        session,
        "module.anonymisation.viewed",
        actor_id=user.id,
        matter_id=matter.id,
        module="anonymisation",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"token_count": len(tokens)},
    )
    await session.commit()

    return MappingRead(document_id=doc.id, tokens=tokens, spans=spans)


@router.delete(
    "/{document_id}/anonymise",
    status_code=204,
    response_class=Response,
)
async def delete_anonymise_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Delete the redacted DocumentBody so the next run starts cold."""
    doc, matter = await _load_owned_document(document_id, session, user)
    redacted = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    if redacted is None:
        return Response(status_code=204)
    await session.delete(redacted)
    await audit.log(
        session,
        "module.anonymisation.deleted",
        actor_id=user.id,
        matter_id=matter.id,
        module="anonymisation",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"engine": redacted.engine},
    )
    await session.commit()
    return Response(status_code=204)

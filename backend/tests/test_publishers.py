"""Phase 3 — publisher registry tests."""

from __future__ import annotations

from app.core.publishers import (
    PublisherInfo,
    all_verified_publishers,
    is_verified_publisher,
    publisher_info,
)


def test_legalise_publisher_is_verified() -> None:
    assert is_verified_publisher("legalise") is True


def test_example_publisher_is_verified() -> None:
    """Reserved for examples/modules/ test fixtures."""
    assert is_verified_publisher("example") is True


def test_unknown_publisher_not_verified() -> None:
    assert is_verified_publisher("random-org") is False
    assert is_verified_publisher("") is False


def test_publisher_info_for_legalise() -> None:
    info = publisher_info("legalise")
    assert isinstance(info, PublisherInfo)
    assert info.publisher_id == "legalise"
    assert "first-party" in info.display_name.lower()
    assert "github_org" in info.trust_root


def test_publisher_info_unknown_returns_none() -> None:
    assert publisher_info("nope") is None


def test_all_verified_publishers_returns_sorted_list() -> None:
    pubs = all_verified_publishers()
    assert isinstance(pubs, list)
    ids = [p.publisher_id for p in pubs]
    assert ids == sorted(ids)
    assert "legalise" in ids
    assert "example" in ids

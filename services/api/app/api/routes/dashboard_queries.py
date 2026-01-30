from dataclasses import asdict
from datetime import datetime, timezone
from typing import Literal, Sequence

from app.models.availability_snapshot import AvailabilitySnapshot
from app.models.catalog_item import CatalogItem
from app.models.catalog_match import CatalogMatch
from app.models.shelf_item import ShelfItem
from app.schemas.dashboard import (
    AvailabilityOut,
    DashboardRowOut,
    MatchMiniOut,
    ReadNextOut,
)
from app.services.read_next_scoring import compute_read_next
from sqlalchemy import select
from sqlalchemy.orm import Session


def load_shelf_items(
    db: Session, user_id: str, source_ids: Sequence[str]
) -> Sequence[ShelfItem]:
    stmt = select(ShelfItem).where(ShelfItem.user_id == user_id)
    if source_ids:
        stmt = stmt.where(ShelfItem.shelf_source_id.in_(source_ids))
    return db.execute(stmt).scalars().all()


def load_matches(
    db: Session, user_id: str, shelf_item_ids: Sequence[str]
) -> dict[str, CatalogMatch]:
    if not shelf_item_ids:
        return {}
    matches = (
        db.execute(
            select(CatalogMatch).where(
                CatalogMatch.user_id == user_id,
                CatalogMatch.shelf_item_id.in_(shelf_item_ids),
            )
        )
        .scalars()
        .all()
    )
    return {m.shelf_item_id: m for m in matches}


def load_catalog_items(
    db: Session, matches: dict[str, CatalogMatch]
) -> dict[str, CatalogItem]:
    catalog_ids = {match.catalog_item_id for match in matches.values()}
    if not catalog_ids:
        return {}
    catalog_items = (
        db.execute(select(CatalogItem).where(CatalogItem.id.in_(list(catalog_ids))))
        .scalars()
        .all()
    )
    return {item.id: item for item in catalog_items}


def load_availability(
    db: Session, user_id: str, catalog_map: dict[str, CatalogItem]
) -> dict[str, list[AvailabilitySnapshot]]:
    if not catalog_map:
        return {}
    snapshots = (
        db.execute(
            select(AvailabilitySnapshot).where(
                AvailabilitySnapshot.user_id == user_id,
                AvailabilitySnapshot.catalog_item_id.in_(list(catalog_map.keys())),
            )
        )
        .scalars()
        .all()
    )
    result: dict[str, list[AvailabilitySnapshot]] = {}
    for snap in snapshots:
        result.setdefault(snap.catalog_item_id, []).append(snap)
    return result


def build_rows(
    shelf_items: Sequence[ShelfItem],
    matches: dict[str, CatalogMatch],
    catalog_map: dict[str, CatalogItem],
    availability_map: dict[str, list[AvailabilitySnapshot]],
    preferred_formats: Sequence[str],
) -> list[DashboardRowOut]:
    rows: list[DashboardRowOut] = []
    for item in shelf_items:
        match = matches.get(item.id)
        match_out = None
        availability: list[AvailabilityOut] = []
        if match:
            catalog = catalog_map.get(match.catalog_item_id)
            if catalog:
                match_out = MatchMiniOut(
                    catalog_item_id=catalog.id,
                    provider=match.provider,
                    provider_item_id=catalog.provider_item_id,
                    method=match.method,
                    confidence=match.confidence,
                )
                for snap in availability_map.get(catalog.id, []):
                    availability.append(
                        AvailabilityOut(
                            format=snap.format,
                            status=snap.status,
                            copies_available=snap.copies_available,
                            copies_total=snap.copies_total,
                            holds=snap.holds,
                            deep_link=snap.deep_link,
                            last_checked_at=snap.last_checked_at,
                        )
                    )
        read_next = compute_read_next(availability, list(preferred_formats))
        rows.append(
            DashboardRowOut(
                shelf_item_id=item.id,
                title=item.title,
                author=item.author,
                shelf=item.shelf,
                needs_fuzzy_match=item.needs_fuzzy_match,
                match=match_out,
                availability=availability,
                read_next=ReadNextOut(**asdict(read_next)),
            )
        )
    return rows


def sort_rows(
    rows: list[DashboardRowOut],
    sort: Literal["read_next", "title", "updated"],
    shelf_items: Sequence[ShelfItem],
) -> None:
    if sort == "read_next":
        rows.sort(key=lambda r: r.read_next.score, reverse=True)
    elif sort == "title":
        rows.sort(key=lambda r: (r.title or "").lower())
    elif sort == "updated":
        updated_map = {item.id: item.updated_at for item in shelf_items}
        rows.sort(
            key=lambda r: updated_map.get(r.shelf_item_id)
            or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

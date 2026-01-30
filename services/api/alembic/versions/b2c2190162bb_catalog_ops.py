import sqlalchemy as sa
from alembic import op


def create_catalog_items() -> None:
    op.create_table(
        "catalog_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("provider_item_id", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=400), nullable=False),
        sa.Column("author", sa.String(length=240), nullable=True),
        sa.Column("isbn10", sa.String(length=10), nullable=True),
        sa.Column("isbn13", sa.String(length=13), nullable=True),
        sa.Column("asin", sa.String(length=20), nullable=True),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider", "provider_item_id", name="uq_catalog_items_provider_item"
        ),
    )


def create_availability_snapshots() -> None:
    op.create_table(
        "availability_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("catalog_item_id", sa.String(length=36), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("copies_available", sa.Integer(), nullable=True),
        sa.Column("copies_total", sa.Integer(), nullable=True),
        sa.Column("holds", sa.Integer(), nullable=True),
        sa.Column("deep_link", sa.String(length=500), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["catalog_item_id"], ["catalog_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "catalog_item_id", "format", name="uq_avail_user_item_format"
        ),
    )
    op.create_index(
        op.f("ix_availability_snapshots_catalog_item_id"),
        "availability_snapshots",
        ["catalog_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_availability_snapshots_user_id"),
        "availability_snapshots",
        ["user_id"],
        unique=False,
    )


def create_catalog_matches() -> None:
    op.create_table(
        "catalog_matches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("shelf_item_id", sa.String(length=36), nullable=False),
        sa.Column("catalog_item_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("method", sa.String(length=40), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["catalog_item_id"], ["catalog_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["shelf_item_id"], ["shelf_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "shelf_item_id", name="uq_catalog_match_user_shelf_item"
        ),
    )
    op.create_index(
        op.f("ix_catalog_matches_catalog_item_id"),
        "catalog_matches",
        ["catalog_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_catalog_matches_shelf_item_id"),
        "catalog_matches",
        ["shelf_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_catalog_matches_user_id"), "catalog_matches", ["user_id"], unique=False
    )


def drop_catalog_matches() -> None:
    op.drop_index(op.f("ix_catalog_matches_user_id"), table_name="catalog_matches")
    op.drop_index(
        op.f("ix_catalog_matches_shelf_item_id"), table_name="catalog_matches"
    )
    op.drop_index(
        op.f("ix_catalog_matches_catalog_item_id"), table_name="catalog_matches"
    )
    op.drop_table("catalog_matches")


def drop_availability_snapshots() -> None:
    op.drop_index(
        op.f("ix_availability_snapshots_user_id"), table_name="availability_snapshots"
    )
    op.drop_index(
        op.f("ix_availability_snapshots_catalog_item_id"),
        table_name="availability_snapshots",
    )
    op.drop_table("availability_snapshots")


def drop_catalog_items() -> None:
    op.drop_table("catalog_items")

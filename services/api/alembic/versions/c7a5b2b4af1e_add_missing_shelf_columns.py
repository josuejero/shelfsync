"""add missing shelf columns

Revision ID: c7a5b2b4af1e
Revises: 8f008b42145c
Create Date: 2025-12-23 23:59:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7a5b2b4af1e"
down_revision: Union[str, Sequence[str], None] = "8f008b42145c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "shelf_sources",
        sa.Column(
            "provider", sa.String(length=40), nullable=False, server_default="goodreads"
        ),
    )
    op.add_column(
        "shelf_sources",
        sa.Column(
            "meta",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    op.add_column(
        "shelf_sources",
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "shelf_sources",
        sa.Column("last_sync_status", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "shelf_sources",
        sa.Column("last_sync_error", sa.String(length=2000), nullable=True),
    )
    op.add_column(
        "shelf_sources",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.add_column(
        "shelf_items",
        sa.Column("external_id", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "shelf_items",
        sa.Column("shelf", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("shelf_items", "shelf")
    op.drop_column("shelf_items", "external_id")
    op.drop_column("shelf_sources", "updated_at")
    op.drop_column("shelf_sources", "last_sync_error")
    op.drop_column("shelf_sources", "last_sync_status")
    op.drop_column("shelf_sources", "last_synced_at")
    op.drop_column("shelf_sources", "meta")
    op.drop_column("shelf_sources", "provider")

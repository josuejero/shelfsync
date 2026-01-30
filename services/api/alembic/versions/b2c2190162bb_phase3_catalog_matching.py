"""phase3 catalog matching

Revision ID: b2c2190162bb
Revises: c7a5b2b4af1e
Create Date: 2025-12-23 19:37:31.748233

"""

from typing import Union

from .b2c2190162bb_catalog_ops import (
    create_availability_snapshots,
    create_catalog_items,
    create_catalog_matches,
    drop_availability_snapshots,
    drop_catalog_items,
    drop_catalog_matches,
)
from .b2c2190162bb_shelf_ops import (
    downgrade_shelf_items,
    downgrade_shelf_sources,
    upgrade_shelf_items,
    upgrade_shelf_sources,
)

# revision identifiers, used by Alembic.
revision: str = "b2c2190162bb"
down_revision: Union[str, Sequence[str], None] = "c7a5b2b4af1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    create_catalog_items()
    create_availability_snapshots()
    create_catalog_matches()
    upgrade_shelf_items()
    upgrade_shelf_sources()


def downgrade() -> None:
    """Downgrade schema."""
    downgrade_shelf_sources()
    downgrade_shelf_items()
    drop_catalog_matches()
    drop_availability_snapshots()
    drop_catalog_items()

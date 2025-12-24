"""add sync_runs table

Revision ID: 32191e629780
Revises: 156614e6d7d6
Create Date: 2025-12-24 07:08:52.372695

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "32191e629780"
down_revision: Union[str, Sequence[str], None] = "156614e6d7d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

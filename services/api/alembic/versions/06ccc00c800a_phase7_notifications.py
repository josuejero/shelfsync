"""phase7 notifications

Revision ID: 06ccc00c800a
Revises: 32191e629780
Create Date: 2025-12-25 14:42:40.739694

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '06ccc00c800a'
down_revision: Union[str, Sequence[str], None] = '32191e629780'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

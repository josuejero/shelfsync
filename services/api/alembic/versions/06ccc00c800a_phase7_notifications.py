"""phase7 notifications

Revision ID: 06ccc00c800a
Revises: 32191e629780
Create Date: 2025-12-25 16:59:39.258811

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "06ccc00c800a"
down_revision: Union[str, None] = "32191e629780"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add per-user notifications toggle (default ON).
    op.add_column(
        "user_settings",
        sa.Column(
            "notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "notifications_enabled")

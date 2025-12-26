"""create sync_runs and notification_events tables

Revision ID: 7b7d94f4f3e1
Revises: 06ccc00c800a
Create Date: 2025-12-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b7d94f4f3e1"
down_revision: Union[str, None] = "06ccc00c800a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- sync_runs ---------------------------------------------------------
    op.create_table(
        "sync_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("progress_current", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_sync_runs_user_id"), "sync_runs", ["user_id"], unique=False
    )
    op.create_index(op.f("ix_sync_runs_kind"), "sync_runs", ["kind"], unique=False)
    op.create_index(op.f("ix_sync_runs_status"), "sync_runs", ["status"], unique=False)

    # ---- notification_events ----------------------------------------------
    op.create_table(
        "notification_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("shelf_item_id", sa.String(length=36), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("old_status", sa.String(length=20), nullable=False),
        sa.Column("new_status", sa.String(length=20), nullable=False),
        sa.Column("deep_link", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["shelf_item_id"], ["shelf_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notification_events_user_id"),
        "notification_events",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_notification_events_shelf_item_id"),
        "notification_events",
        ["shelf_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_notification_events_created_at"),
        "notification_events",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    # notification_events
    op.drop_index(
        op.f("ix_notification_events_created_at"), table_name="notification_events"
    )
    op.drop_index(
        op.f("ix_notification_events_shelf_item_id"), table_name="notification_events"
    )
    op.drop_index(
        op.f("ix_notification_events_user_id"), table_name="notification_events"
    )
    op.drop_table("notification_events")

    # sync_runs
    op.drop_index(op.f("ix_sync_runs_status"), table_name="sync_runs")
    op.drop_index(op.f("ix_sync_runs_kind"), table_name="sync_runs")
    op.drop_index(op.f("ix_sync_runs_user_id"), table_name="sync_runs")
    op.drop_table("sync_runs")

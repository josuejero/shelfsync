import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


def upgrade_shelf_items() -> None:
    with op.batch_alter_table("shelf_items") as batch_op:
        batch_op.alter_column(
            "isbn10",
            existing_type=sa.VARCHAR(length=10),
            type_=sa.String(length=20),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "isbn13",
            existing_type=sa.VARCHAR(length=13),
            type_=sa.String(length=20),
            existing_nullable=True,
        )
        batch_op.drop_index(op.f("ix_shelf_items_user_normkey"))
        batch_op.drop_constraint(op.f("uq_shelf_item_user_normkey"), type_="unique")
        batch_op.create_index(
            "ix_shelf_items_source_external_unique",
            ["shelf_source_id", "external_id"],
            unique=True,
            postgresql_where=sa.text("external_id IS NOT NULL"),
        )
        batch_op.drop_column("normalized_key")
        batch_op.drop_column("goodreads_book_id")


def upgrade_shelf_sources() -> None:
    with op.batch_alter_table("shelf_sources") as batch_op:
        batch_op.drop_constraint(op.f("uq_shelf_source_user_type_ref"), type_="unique")
        batch_op.drop_column("shelf_name")
        batch_op.drop_column("last_imported_at")


def downgrade_shelf_sources() -> None:
    op.add_column(
        "shelf_sources",
        sa.Column(
            "last_imported_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=True,
        ),
    )
    op.add_column(
        "shelf_sources",
        sa.Column("shelf_name", sa.VARCHAR(length=200), autoincrement=False, nullable=True),
    )
    op.create_unique_constraint(
        op.f("uq_shelf_source_user_type_ref"),
        "shelf_sources",
        ["user_id", "source_type", "source_ref"],
        postgresql_nulls_not_distinct=False,
    )


def downgrade_shelf_items() -> None:
    op.add_column(
        "shelf_items",
        sa.Column(
            "goodreads_book_id",
            sa.VARCHAR(length=40),
            autoincrement=False,
            nullable=True,
        ),
    )
    op.add_column(
        "shelf_items",
        sa.Column(
            "normalized_key",
            sa.VARCHAR(length=1100),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.drop_index(
        "ix_shelf_items_source_external_unique",
        table_name="shelf_items",
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )
    op.create_unique_constraint(
        op.f("uq_shelf_item_user_normkey"),
        "shelf_items",
        ["user_id", "normalized_key"],
        postgresql_nulls_not_distinct=False,
    )
    op.create_index(
        op.f("ix_shelf_items_user_normkey"),
        "shelf_items",
        ["user_id", "normalized_key"],
        unique=False,
    )
    op.alter_column(
        "shelf_items",
        "isbn13",
        existing_type=sa.String(length=20),
        type_=sa.VARCHAR(length=13),
        existing_nullable=True,
    )
    op.alter_column(
        "shelf_items",
        "isbn10",
        existing_type=sa.String(length=20),
        type_=sa.VARCHAR(length=10),
        existing_nullable=True,
    )

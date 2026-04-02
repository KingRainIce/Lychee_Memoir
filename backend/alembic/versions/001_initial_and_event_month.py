"""Bootstrap schema (SQLModel) and ensure campus events have month column."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlmodel import SQLModel

from app import models  # noqa: F401 — register metadata

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if not insp.has_table("app_user"):
        SQLModel.metadata.create_all(bind=conn)
    elif insp.has_table("campusevent") and not insp.has_column("campusevent", "month"):
        op.add_column(
            "campusevent",
            sa.Column("month", sa.Integer(), nullable=False, server_default="6"),
        )
        op.alter_column("campusevent", "month", server_default=None)


def downgrade() -> None:
    """不撤销整库建表；若曾仅添加 month 列则可手动回滚。"""
    pass

"""Add poststatus.deleted for admin soft-delete."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_poststatus_deleted"
down_revision: Union[str, None] = "004_user_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    r = conn.execute(
        sa.text(
            """
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'poststatus' AND e.enumlabel = 'deleted'
            """
        )
    )
    if r.scalar():
        return
    # ADD VALUE 在部分 PG 版本下不能放在普通事务里，用 autocommit 块
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE poststatus ADD VALUE 'deleted'"))


def downgrade() -> None:
    """PostgreSQL 不支持安全删除枚举取值；保留 deleted 值即可。"""
    pass

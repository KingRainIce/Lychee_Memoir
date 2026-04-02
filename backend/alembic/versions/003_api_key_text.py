"""Widen airuntimeconfig.siliconflow_api_key to TEXT (500-char VARCHAR truncated long keys -> 401)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_api_key_text"
down_revision: Union[str, None] = "002_place_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if not insp.has_table("airuntimeconfig"):
        return
    col_names = {c["name"] for c in insp.get_columns("airuntimeconfig")}
    if "siliconflow_api_key" not in col_names:
        return
    # PostgreSQL：VARCHAR → TEXT；若已是 TEXT 重复执行亦安全
    op.execute(sa.text("ALTER TABLE airuntimeconfig ALTER COLUMN siliconflow_api_key TYPE TEXT"))


def downgrade() -> None:
    op.execute(
        sa.text("ALTER TABLE airuntimeconfig ALTER COLUMN siliconflow_api_key TYPE VARCHAR(500)"),
    )

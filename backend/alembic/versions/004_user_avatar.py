"""Add avatar_url to app_user table."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_user_avatar"
down_revision: Union[str, None] = "003_api_key_text"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if not insp.has_table("app_user"):
        return
    col_names = {c["name"] for c in insp.get_columns("app_user")}
    if "avatar_url" not in col_names:
        op.add_column(
            "app_user",
            sa.Column("avatar_url", sa.String(2000), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("app_user", "avatar_url")

"""Add optional place_id to campus events and alumni posts."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_place_id"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if insp.has_table("campusevent") and not insp.has_column("campusevent", "place_id"):
        op.add_column("campusevent", sa.Column("place_id", sa.String(length=128), nullable=True))
    if insp.has_table("alumnipost") and not insp.has_column("alumnipost", "place_id"):
        op.add_column("alumnipost", sa.Column("place_id", sa.String(length=128), nullable=True))
    ix_ce = "ix_campusevent_place_id"
    ix_ap = "ix_alumnipost_place_id"
    if insp.has_table("campusevent") and not insp.has_index("campusevent", ix_ce):
        op.create_index(ix_ce, "campusevent", ["place_id"])
    if insp.has_table("alumnipost") and not insp.has_index("alumnipost", ix_ap):
        op.create_index(ix_ap, "alumnipost", ["place_id"])


def downgrade() -> None:
    op.drop_index("ix_alumnipost_place_id", table_name="alumnipost")
    op.drop_index("ix_campusevent_place_id", table_name="campusevent")
    op.drop_column("alumnipost", "place_id")
    op.drop_column("campusevent", "place_id")

"""Post likes, favorites, and threaded comments (2 levels)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_post_social"
down_revision: Union[str, None] = "005_poststatus_deleted"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if not insp.has_table("post_like"):
        op.create_table(
            "post_like",
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("post_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["alumnipost.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id", "post_id"),
        )
    insp = sa.inspect(conn)
    if not insp.has_table("post_favorite"):
        op.create_table(
            "post_favorite",
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("post_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["alumnipost.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id", "post_id"),
        )
    insp = sa.inspect(conn)
    if not insp.has_table("post_comment"):
        op.create_table(
            "post_comment",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("post_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("parent_id", sa.Uuid(), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["parent_id"], ["post_comment.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["post_id"], ["alumnipost.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_post_comment_post_id"), "post_comment", ["post_id"], unique=False)
        op.create_index(op.f("ix_post_comment_user_id"), "post_comment", ["user_id"], unique=False)
        op.create_index(op.f("ix_post_comment_parent_id"), "post_comment", ["parent_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_post_comment_parent_id"), table_name="post_comment")
    op.drop_index(op.f("ix_post_comment_user_id"), table_name="post_comment")
    op.drop_index(op.f("ix_post_comment_post_id"), table_name="post_comment")
    op.drop_table("post_comment")
    op.drop_table("post_favorite")
    op.drop_table("post_like")

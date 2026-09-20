"""add map geometry tables

Revision ID: a1b2c3d4e5f6
Revises: 71867cddef4b
Create Date: 2026-09-20 05:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '71867cddef4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 20. HUB MAP GEOMETRY --------------------------------------------------
    # One-to-one Map Engine V2 geometry extension for safety_hubs.
    # Additive only - no existing table altered.
    op.create_table(
        'hub_map_geometry',
        sa.Column('hub_id', sa.Integer(), nullable=False),
        sa.Column(
            'entrance_geom',
            geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column(
            'area_geom',
            geoalchemy2.types.Geometry(geometry_type='POLYGON', srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('capabilities', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['hub_id'],
            ['safety_hubs.id'],
            name='fk_hub_map_geometry_hub_id',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('hub_id', name='pk_hub_map_geometry'),
    )
    # GiST spatial indexes
    op.create_index(
        'idx_hub_map_geometry_entrance_geom',
        'hub_map_geometry',
        ['entrance_geom'],
        unique=False,
        postgresql_using='gist',
    )
    op.create_index(
        'idx_hub_map_geometry_area_geom',
        'hub_map_geometry',
        ['area_geom'],
        unique=False,
        postgresql_using='gist',
    )

    # --- 21. ROAD CLOSURES -----------------------------------------------------
    # Coordinator-drawn road closure LineStrings for Map Engine V2.
    # Additive only - no existing table altered.
    op.create_table(
        'road_closures',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column(
            'geom',
            geoalchemy2.types.Geometry(geometry_type='LINESTRING', srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column('road_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint("kind IN ('full', 'section')", name='ck_road_closures_kind'),
        sa.ForeignKeyConstraint(
            ['road_id'],
            ['roads.id'],
            name='fk_road_closures_road_id',
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['created_by_id'],
            ['users.id'],
            name='fk_road_closures_created_by_id',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_road_closures'),
    )
    op.create_index('ix_road_closures_id', 'road_closures', ['id'], unique=False)
    op.create_index('ix_road_closures_road_id', 'road_closures', ['road_id'], unique=False)
    op.create_index('ix_road_closures_created_by_id', 'road_closures', ['created_by_id'], unique=False)
    op.create_index(
        'idx_road_closures_geom',
        'road_closures',
        ['geom'],
        unique=False,
        postgresql_using='gist',
    )


def downgrade() -> None:
    op.drop_index('idx_road_closures_geom', table_name='road_closures', postgresql_using='gist')
    op.drop_index('ix_road_closures_created_by_id', table_name='road_closures')
    op.drop_index('ix_road_closures_road_id', table_name='road_closures')
    op.drop_index('ix_road_closures_id', table_name='road_closures')
    op.drop_table('road_closures')

    op.drop_index('idx_hub_map_geometry_area_geom', table_name='hub_map_geometry', postgresql_using='gist')
    op.drop_index('idx_hub_map_geometry_entrance_geom', table_name='hub_map_geometry', postgresql_using='gist')
    op.drop_table('hub_map_geometry')

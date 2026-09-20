"""initial frozen v1 schema

Revision ID: 71867cddef4b
Revises: 
Create Date: 2026-09-04 21:23:29.109907

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '71867cddef4b'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── 1. ENUMS ─────────────────────────────────────────────────────────────
    user_role_enum = postgresql.ENUM('citizen', 'responder', 'coordinator', 'fundraiser', name='userrole', create_type=False)
    user_role_enum.create(op.get_bind(), checkfirst=True)

    responder_status_enum = postgresql.ENUM('available', 'deployed', 'on_mission', 'offline', name='responderstatus', create_type=False)
    responder_status_enum.create(op.get_bind(), checkfirst=True)

    report_status_enum = postgresql.ENUM('unverified', 'clustered', 'verified', 'rejected', name='reportstatus', create_type=False)
    report_status_enum.create(op.get_bind(), checkfirst=True)

    report_cluster_status_enum = postgresql.ENUM('open', 'mission_assigned', 'verified', 'dismissed', name='reportclusterstatus', create_type=False)
    report_cluster_status_enum.create(op.get_bind(), checkfirst=True)

    road_status_enum = postgresql.ENUM('clear', 'hazardous', 'flooded', 'blocked', name='roadstatus', create_type=False)
    road_status_enum.create(op.get_bind(), checkfirst=True)

    hub_status_enum = postgresql.ENUM('open', 'near_capacity', 'full', 'closed', name='hubstatus', create_type=False)
    hub_status_enum.create(op.get_bind(), checkfirst=True)

    mission_type_enum = postgresql.ENUM('verify_incident', 'survey_road', 'deliver_resource', 'rescue', name='missiontype', create_type=False)
    mission_type_enum.create(op.get_bind(), checkfirst=True)

    mission_status_enum = postgresql.ENUM('assigned', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled', name='missionstatus', create_type=False)
    mission_status_enum.create(op.get_bind(), checkfirst=True)

    field_survey_outcome_enum = postgresql.ENUM('confirmed_hazard', 'road_blocked', 'no_hazard_found', 'false_report', name='fieldsurveyverificationoutcome', create_type=False)
    field_survey_outcome_enum.create(op.get_bind(), checkfirst=True)

    hazard_severity_enum = postgresql.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='hazardseverity', create_type=False)
    hazard_severity_enum.create(op.get_bind(), checkfirst=True)

    alert_severity_enum = postgresql.ENUM('ADVISORY', 'WARNING', 'EMERGENCY', name='alertseverity', create_type=False)
    alert_severity_enum.create(op.get_bind(), checkfirst=True)

    campaign_status_enum = postgresql.ENUM('active', 'fulfilled', 'closed', name='campaignstatus', create_type=False)
    campaign_status_enum.create(op.get_bind(), checkfirst=True)

    resource_type_enum = postgresql.ENUM('food', 'water', 'medical', 'shelter_kit', name='resourcetype', create_type=False)
    resource_type_enum.create(op.get_bind(), checkfirst=True)

    requirement_status_enum = postgresql.ENUM('open', 'in_transit', 'fulfilled', 'cancelled', name='requirementstatus', create_type=False)
    requirement_status_enum.create(op.get_bind(), checkfirst=True)

    # ─── 2. ROOT & ACYCLIC TABLES ─────────────────────────────────────────────

    # 1. users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role', user_role_enum, nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 2. safety_hubs
    op.create_table(
        'safety_hubs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('max_capacity', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('current_occupancy', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', hub_status_enum, nullable=False, server_default='open'),
        sa.Column('food_critical_threshold', sa.Float(), nullable=False, server_default='0.20'),
        sa.Column('water_critical_threshold', sa.Float(), nullable=False, server_default='0.20'),
        sa.Column('medical_critical_threshold', sa.Float(), nullable=False, server_default='0.20'),
        sa.Column('capacity_critical_threshold', sa.Float(), nullable=False, server_default='0.85'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('current_occupancy >= 0', name='ck_safety_hubs_occupancy_non_negative'),
        sa.CheckConstraint('max_capacity > 0', name='ck_safety_hubs_max_capacity_positive'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_safety_hubs_id'), 'safety_hubs', ['id'], unique=False)
    op.create_index('idx_safety_hubs_geom', 'safety_hubs', ['geom'], unique=False, postgresql_using='gist')

    # 3. report_clusters
    op.create_table(
        'report_clusters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('centroid_lat', sa.Float(), nullable=False),
        sa.Column('centroid_lng', sa.Float(), nullable=False),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('report_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('priority_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('dominant_category', sa.String(length=100), nullable=True),
        sa.Column('status', report_cluster_status_enum, nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_report_clusters_id'), 'report_clusters', ['id'], unique=False)
    op.create_index('idx_report_clusters_geom', 'report_clusters', ['geom'], unique=False, postgresql_using='gist')

    # 4. sync_queue_log
    op.create_table(
        'sync_queue_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.String(length=128), nullable=False),
        sa.Column('operation_id', sa.String(length=64), nullable=False),
        sa.Column('operation_type', sa.String(length=100), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('client_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='accepted'),
        sa.Column('conflict_notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_queue_log_id'), 'sync_queue_log', ['id'], unique=False)
    op.create_index(op.f('ix_sync_queue_log_client_id'), 'sync_queue_log', ['client_id'], unique=False)
    op.create_index(op.f('ix_sync_queue_log_operation_id'), 'sync_queue_log', ['operation_id'], unique=True)

    # 5. responders
    op.create_table(
        'responders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ngo_name', sa.String(length=255), nullable=True),
        sa.Column('status', responder_status_enum, nullable=False, server_default='available'),
        sa.Column('last_known_lat', sa.Float(), nullable=True),
        sa.Column('last_known_lng', sa.Float(), nullable=True),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_responders_id'), 'responders', ['id'], unique=False)
    op.create_index(op.f('ix_responders_user_id'), 'responders', ['user_id'], unique=True)
    op.create_index('idx_responders_geom', 'responders', ['geom'], unique=False, postgresql_using='gist')

    # 6. audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=100), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('old_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('new_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)
    op.create_index(op.f('ix_audit_logs_actor_id'), 'audit_logs', ['actor_id'], unique=False)

    # 7. emergency_alerts
    op.create_table(
        'emergency_alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('severity', alert_severity_enum, nullable=False, server_default='ADVISORY'),
        sa.Column('alert_type', sa.String(length=100), nullable=False),
        sa.Column('affected_area_geom', geoalchemy2.types.Geometry(geometry_type='MULTIPOLYGON', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('issued_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['issued_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_emergency_alerts_id'), 'emergency_alerts', ['id'], unique=False)
    op.create_index(op.f('ix_emergency_alerts_issued_by_id'), 'emergency_alerts', ['issued_by_id'], unique=False)
    op.create_index('idx_emergency_alerts_affected_area_geom', 'emergency_alerts', ['affected_area_geom'], unique=False, postgresql_using='gist')

    # 8. intersections
    op.create_table(
        'intersections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('is_hub', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('hub_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['hub_id'], ['safety_hubs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_intersections_id'), 'intersections', ['id'], unique=False)
    op.create_index(op.f('ix_intersections_hub_id'), 'intersections', ['hub_id'], unique=False)
    op.create_index('idx_intersections_geom', 'intersections', ['geom'], unique=False, postgresql_using='gist')

    # 9. incident_reports
    op.create_table(
        'incident_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reporter_id', sa.Integer(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', report_status_enum, nullable=False, server_default='unverified'),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('photo_url', sa.String(length=512), nullable=True),
        sa.Column('cluster_id', sa.Integer(), nullable=True),
        sa.Column('submitted_offline', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('client_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['cluster_id'], ['report_clusters.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['verified_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_incident_reports_id'), 'incident_reports', ['id'], unique=False)
    op.create_index(op.f('ix_incident_reports_reporter_id'), 'incident_reports', ['reporter_id'], unique=False)
    op.create_index(op.f('ix_incident_reports_cluster_id'), 'incident_reports', ['cluster_id'], unique=False)
    op.create_index(op.f('ix_incident_reports_verified_by_id'), 'incident_reports', ['verified_by_id'], unique=False)
    op.create_index('idx_incident_reports_geom', 'incident_reports', ['geom'], unique=False, postgresql_using='gist')

    # 10. hub_resources
    op.create_table(
        'hub_resources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('hub_id', sa.Integer(), nullable=False),
        sa.Column('resource_type', resource_type_enum, nullable=False),
        sa.Column('current_quantity', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('unit', sa.String(length=50), nullable=False, server_default='units'),
        sa.Column('critical_threshold', sa.Float(), nullable=False, server_default='100.0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('current_quantity >= 0', name='ck_hub_resources_quantity_non_negative'),
        sa.ForeignKeyConstraint(['hub_id'], ['safety_hubs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hub_id', 'resource_type', name='uq_hub_resource_type')
    )
    op.create_index(op.f('ix_hub_resources_id'), 'hub_resources', ['id'], unique=False)
    op.create_index(op.f('ix_hub_resources_hub_id'), 'hub_resources', ['hub_id'], unique=False)

    # 11. resource_requirements
    op.create_table(
        'resource_requirements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('hub_id', sa.Integer(), nullable=False),
        sa.Column('resource_type', resource_type_enum, nullable=False),
        sa.Column('required_quantity', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('fulfilled_quantity', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('shortfall_quantity', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('unit', sa.String(length=50), nullable=False, server_default='units'),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', requirement_status_enum, nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('required_quantity >= 0', name='ck_resource_requirements_required_non_negative'),
        sa.CheckConstraint('fulfilled_quantity >= 0', name='ck_resource_requirements_fulfilled_non_negative'),
        sa.CheckConstraint('shortfall_quantity >= 0', name='ck_resource_requirements_shortfall_non_negative'),
        sa.CheckConstraint('priority >= 1 AND priority <= 5', name='ck_resource_requirements_priority'),
        sa.ForeignKeyConstraint(['hub_id'], ['safety_hubs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_resource_requirements_id'), 'resource_requirements', ['id'], unique=False)
    op.create_index(op.f('ix_resource_requirements_hub_id'), 'resource_requirements', ['hub_id'], unique=False)

    # 12. campaigns
    op.create_table(
        'campaigns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', campaign_status_enum, nullable=False, server_default='active'),
        sa.Column('hub_id', sa.Integer(), nullable=True),
        sa.Column('requirement_id', sa.Integer(), nullable=True),
        sa.Column('ngo_user_id', sa.Integer(), nullable=True),
        sa.Column('resource_type', resource_type_enum, nullable=True),
        sa.Column('target_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('raised_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('share_slug', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('target_amount >= 0', name='ck_campaigns_target_non_negative'),
        sa.CheckConstraint('raised_amount >= 0', name='ck_campaigns_raised_non_negative'),
        sa.ForeignKeyConstraint(['hub_id'], ['safety_hubs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['ngo_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['requirement_id'], ['resource_requirements.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_campaigns_id'), 'campaigns', ['id'], unique=False)
    op.create_index(op.f('ix_campaigns_hub_id'), 'campaigns', ['hub_id'], unique=False)
    op.create_index(op.f('ix_campaigns_requirement_id'), 'campaigns', ['requirement_id'], unique=False)
    op.create_index(op.f('ix_campaigns_ngo_user_id'), 'campaigns', ['ngo_user_id'], unique=False)
    op.create_index(op.f('ix_campaigns_share_slug'), 'campaigns', ['share_slug'], unique=True)

    # 13. donations
    op.create_table(
        'donations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('donor_name', sa.String(length=255), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('transaction_ref', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('amount > 0', name='ck_donations_amount_positive'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_donations_id'), 'donations', ['id'], unique=False)
    op.create_index(op.f('ix_donations_campaign_id'), 'donations', ['campaign_id'], unique=False)
    op.create_index(op.f('ix_donations_transaction_ref'), 'donations', ['transaction_ref'], unique=True)

    # ─── 3. CYCLIC / CROSS-REFERENCING TABLES ────────────────────────────────

    # 14. hazard_zones (created with base columns; last_verified_survey_id FK deferred)
    op.create_table(
        'hazard_zones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('hazard_type', sa.String(length=100), nullable=False),
        sa.Column('severity', hazard_severity_enum, nullable=False, server_default='LOW'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('last_verified_survey_id', sa.Integer(), nullable=True),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POLYGON', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hazard_zones_id'), 'hazard_zones', ['id'], unique=False)
    op.create_index(op.f('ix_hazard_zones_last_verified_survey_id'), 'hazard_zones', ['last_verified_survey_id'], unique=False)
    op.create_index('idx_hazard_zones_geom', 'hazard_zones', ['geom'], unique=False, postgresql_using='gist')

    # 15. roads (created with intersection FKs; last_verified_survey_id FK deferred)
    op.create_table(
        'roads',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('from_intersection_id', sa.Integer(), nullable=False),
        sa.Column('to_intersection_id', sa.Integer(), nullable=False),
        sa.Column('distance_km', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('hazard_penalty', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('flood_penalty', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('congestion_penalty', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('is_blocked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_bidirectional', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('status', road_status_enum, nullable=False, server_default='clear'),
        sa.Column('confidence_score', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('last_verified_survey_id', sa.Integer(), nullable=True),
        sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='LINESTRING', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('confidence_score >= 0.0 AND confidence_score <= 1.0', name='ck_roads_confidence_score'),
        sa.ForeignKeyConstraint(['from_intersection_id'], ['intersections.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['to_intersection_id'], ['intersections.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roads_id'), 'roads', ['id'], unique=False)
    op.create_index(op.f('ix_roads_from_intersection_id'), 'roads', ['from_intersection_id'], unique=False)
    op.create_index(op.f('ix_roads_to_intersection_id'), 'roads', ['to_intersection_id'], unique=False)
    op.create_index(op.f('ix_roads_last_verified_survey_id'), 'roads', ['last_verified_survey_id'], unique=False)
    op.create_index('idx_roads_geom', 'roads', ['geom'], unique=False, postgresql_using='gist')

    # 16. missions
    op.create_table(
        'missions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mission_type', mission_type_enum, nullable=False),
        sa.Column('status', mission_status_enum, nullable=False, server_default='assigned'),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('responder_id', sa.Integer(), nullable=True),
        sa.Column('cluster_id', sa.Integer(), nullable=True),
        sa.Column('road_id', sa.Integer(), nullable=True),
        sa.Column('hub_id', sa.Integer(), nullable=True),
        sa.Column('target_lat', sa.Float(), nullable=True),
        sa.Column('target_lng', sa.Float(), nullable=True),
        sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['cluster_id'], ['report_clusters.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['hub_id'], ['safety_hubs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['responder_id'], ['responders.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['road_id'], ['roads.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_missions_id'), 'missions', ['id'], unique=False)
    op.create_index(op.f('ix_missions_responder_id'), 'missions', ['responder_id'], unique=False)
    op.create_index(op.f('ix_missions_cluster_id'), 'missions', ['cluster_id'], unique=False)
    op.create_index(op.f('ix_missions_road_id'), 'missions', ['road_id'], unique=False)
    op.create_index(op.f('ix_missions_hub_id'), 'missions', ['hub_id'], unique=False)
    op.create_index('idx_missions_geom', 'missions', ['geom'], unique=False, postgresql_using='gist')

    # 17. field_surveys
    op.create_table(
        'field_surveys',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mission_id', sa.Integer(), nullable=True),
        sa.Column('responder_id', sa.Integer(), nullable=False),
        sa.Column('road_id', sa.Integer(), nullable=True),
        sa.Column('cluster_id', sa.Integer(), nullable=True),
        sa.Column('observed_lat', sa.Float(), nullable=True),
        sa.Column('observed_lng', sa.Float(), nullable=True),
        sa.Column('observed_geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', spatial_index=False), nullable=True),
        sa.Column('observed_condition', sa.Text(), nullable=True),
        sa.Column('road_status', road_status_enum, nullable=True),
        sa.Column('hazard_penalty', sa.Float(), nullable=True),
        sa.Column('flood_penalty', sa.Float(), nullable=True),
        sa.Column('congestion_penalty', sa.Float(), nullable=True),
        sa.Column('is_blocked', sa.Boolean(), nullable=True),
        sa.Column('hazard_level', sa.Integer(), nullable=True),
        sa.Column('verification_outcome', field_survey_outcome_enum, nullable=True),
        sa.Column('media_url', sa.String(length=512), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('submitted_offline', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('client_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('hazard_level IS NULL OR (hazard_level >= 1 AND hazard_level <= 5)', name='ck_field_surveys_hazard_level'),
        sa.ForeignKeyConstraint(['cluster_id'], ['report_clusters.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['mission_id'], ['missions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['responder_id'], ['responders.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['road_id'], ['roads.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_field_surveys_id'), 'field_surveys', ['id'], unique=False)
    op.create_index(op.f('ix_field_surveys_mission_id'), 'field_surveys', ['mission_id'], unique=False)
    op.create_index(op.f('ix_field_surveys_responder_id'), 'field_surveys', ['responder_id'], unique=False)
    op.create_index(op.f('ix_field_surveys_road_id'), 'field_surveys', ['road_id'], unique=False)
    op.create_index(op.f('ix_field_surveys_cluster_id'), 'field_surveys', ['cluster_id'], unique=False)
    op.create_index('idx_field_surveys_observed_geom', 'field_surveys', ['observed_geom'], unique=False, postgresql_using='gist')

    # ─── 4. DEFERRED CROSS-REFERENCING FOREIGN KEYS ───────────────────────────
    op.create_foreign_key(
        'fk_hazard_zones_last_verified_survey_id',
        'hazard_zones',
        'field_surveys',
        ['last_verified_survey_id'],
        ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_roads_last_verified_survey_id',
        'roads',
        'field_surveys',
        ['last_verified_survey_id'],
        ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    # ─── Drop Deferred Foreign Keys ───────────────────────────────────────────
    op.drop_constraint('fk_roads_last_verified_survey_id', 'roads', type_='foreignkey')
    op.drop_constraint('fk_hazard_zones_last_verified_survey_id', 'hazard_zones', type_='foreignkey')

    # ─── Drop Tables in Reverse Dependency Order ──────────────────────────────
    op.drop_table('field_surveys')
    op.drop_table('missions')
    op.drop_table('roads')
    op.drop_table('hazard_zones')
    op.drop_table('donations')
    op.drop_table('campaigns')
    op.drop_table('resource_requirements')
    op.drop_table('hub_resources')
    op.drop_table('incident_reports')
    op.drop_table('intersections')
    op.drop_table('emergency_alerts')
    op.drop_table('audit_logs')
    op.drop_table('responders')
    op.drop_table('sync_queue_log')
    op.drop_table('report_clusters')
    op.drop_table('safety_hubs')
    op.drop_table('users')

    # ─── Drop Enums ───────────────────────────────────────────────────────────
    op.execute('DROP TYPE IF EXISTS requirementstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS resourcetype CASCADE;')
    op.execute('DROP TYPE IF EXISTS campaignstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS alertseverity CASCADE;')
    op.execute('DROP TYPE IF EXISTS hazardseverity CASCADE;')
    op.execute('DROP TYPE IF EXISTS fieldsurveyverificationoutcome CASCADE;')
    op.execute('DROP TYPE IF EXISTS missionstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS missiontype CASCADE;')
    op.execute('DROP TYPE IF EXISTS hubstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS roadstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS reportclusterstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS reportstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS responderstatus CASCADE;')
    op.execute('DROP TYPE IF EXISTS userrole CASCADE;')

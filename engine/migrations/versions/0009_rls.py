"""Row-Level Security (C6): fail-closed tenant isolation on the user-scoped API tables.

Defense in depth on top of the get_current_user chokepoint + the explicit `WHERE user_id` in
PgNotesRepo: a policy keyed on the `app.current_user_id` GUC (set per request via set_config) means
a forgotten scope returns NO rows instead of leaking another tenant's corpus. RLS is the insurance
that follows the chokepoint + the leak test (the primary controls), per backend-guide D6.

Enabled (not FORCEd): the table owner bypasses RLS, so migrations/superuser access are unaffected;
the production app connects as a NON-owner role for which the policy is enforced. Tables that are
NOT user-scoped (facet_cache/topical_cache/pair_dedup/facet_index — keyed by opaque note_id) are
intentionally left without RLS.

Revision ID: 0009_rls
Revises: 0008_observability
Create Date: 2026-06-26
"""
from alembic import op

revision = "0009_rls"
down_revision = "0008_observability"
branch_labels = None
depends_on = None

_TABLES = ("api_notes", "api_connections")


def upgrade() -> None:
    for t in _TABLES:
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {t}
                USING (user_id = current_setting('app.current_user_id', true))
                WITH CHECK (user_id = current_setting('app.current_user_id', true))
            """
        )


def downgrade() -> None:
    for t in _TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {t}")
        op.execute(f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY")

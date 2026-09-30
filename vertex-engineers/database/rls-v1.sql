-- VERTEX Engineers RLS reference policy for PostgreSQL.
-- The application/database adapter must set app.tenant_id and app.organization_id
-- for the transaction/session before scoped queries.
-- A future VERTEX Vision/Supabase adapter may map these values from verified JWT claims.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'engineers_projects',
    'engineers_assets',
    'engineers_elevator_assets',
    'engineers_hvac_assets',
    'engineers_work_orders',
    'engineers_technicians',
    'engineers_work_order_technicians',
    'engineers_compliance_documents',
    'engineers_inspections',
    'engineers_suppliers',
    'engineers_procurement_orders',
    'engineers_event_outbox'
  ]
  loop
    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists engineers_scope_isolation on %I', table_name);
    execute format(
      'create policy engineers_scope_isolation on %I using (
        tenant_id = current_setting(''app.tenant_id'', true)
        and organization_id = current_setting(''app.organization_id'', true)
      ) with check (
        tenant_id = current_setting(''app.tenant_id'', true)
        and organization_id = current_setting(''app.organization_id'', true)
      )',
      table_name
    );
  end loop;
end $$;

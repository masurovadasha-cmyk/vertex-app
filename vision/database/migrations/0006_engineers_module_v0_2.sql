-- VERTEX Engineers 0.2 registration for VERTEX Vision staging.
-- Registration/version metadata and permission definitions only.
-- This migration DOES NOT install or enable Engineers for any organization.
begin;

insert into public.vision_module_definitions(id,name,version)
values ('engineers','VERTEX Engineers','0.2.0')
on conflict(id) do update
set name=excluded.name, version=excluded.version;

insert into public.vision_permissions(code,description) values
 ('engineers.dashboard.read','Read VERTEX Engineers dashboard data'),
 ('engineers.project.read','Read VERTEX Engineers projects'),
 ('engineers.project.write','Create and advance VERTEX Engineers projects'),
 ('engineers.estimate.read','Read VERTEX Engineers estimates'),
 ('engineers.estimate.write','Manage VERTEX Engineers estimates'),
 ('engineers.procurement.read','Read VERTEX Engineers procurement'),
 ('engineers.procurement.write','Manage VERTEX Engineers procurement'),
 ('engineers.asset.read','Read VERTEX Engineers assets'),
 ('engineers.asset.write','Manage VERTEX Engineers assets'),
 ('engineers.maintenance.read','Read VERTEX Engineers maintenance work'),
 ('engineers.maintenance.dispatch','Dispatch VERTEX Engineers maintenance work'),
 ('engineers.compliance.read','Read VERTEX Engineers compliance records'),
 ('engineers.compliance.manage','Manage VERTEX Engineers compliance records'),
 ('engineers.technician.read','Read VERTEX Engineers technician records'),
 ('engineers.technician.manage','Manage VERTEX Engineers technician records')
on conflict(code) do nothing;

-- Intentionally no vision_module_installations insert/update and no role grants.
commit;

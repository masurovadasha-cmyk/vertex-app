-- VERTEX Engineers 0.2 registration for VERTEX Vision staging.
-- Integration metadata and gateway permission definitions only.
-- No Engineers implementation, database schema, installation or role grant is created here.
begin;

insert into public.vision_module_definitions(id,name,version)
values ('engineers','VERTEX Engineers','0.2.0')
on conflict(id) do update
set name=excluded.name, version=excluded.version;

insert into public.vision_permissions(code,description) values
 ('engineers.dashboard.read','Read VERTEX Engineers dashboard projection'),
 ('engineers.project.read','Read VERTEX Engineers project projections'),
 ('engineers.project.write','Send authorized project commands to VERTEX Engineers'),
 ('engineers.estimate.read','Read VERTEX Engineers estimate projections'),
 ('engineers.estimate.write','Send authorized estimate commands to VERTEX Engineers'),
 ('engineers.procurement.read','Read VERTEX Engineers procurement projections'),
 ('engineers.procurement.write','Send authorized procurement commands to VERTEX Engineers'),
 ('engineers.asset.read','Read VERTEX Engineers asset projections'),
 ('engineers.asset.write','Send authorized asset commands to VERTEX Engineers'),
 ('engineers.maintenance.read','Read VERTEX Engineers maintenance projections'),
 ('engineers.maintenance.dispatch','Send authorized maintenance dispatch commands to VERTEX Engineers'),
 ('engineers.compliance.read','Read VERTEX Engineers compliance projections'),
 ('engineers.compliance.manage','Send authorized compliance commands to VERTEX Engineers'),
 ('engineers.technician.read','Read explicitly exposed technician projections'),
 ('engineers.technician.manage','Send authorized technician commands to VERTEX Engineers')
on conflict(code) do nothing;

-- Intentionally no vision_module_installations change and no role grant.
commit;

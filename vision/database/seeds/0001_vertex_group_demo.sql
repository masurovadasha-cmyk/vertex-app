-- SAFE DEMO SEED: no real PII, credentials, door codes or bank data.
-- Intended for development/staging only.
insert into vision_tenants(code,name) values ('vertex-demo','Vertex Group Demo') on conflict do nothing;
with t as (select id from vision_tenants where code='vertex-demo')
insert into vision_organizations(tenant_id,code,name,kind)
select t.id,v.code,v.name,v.kind from t cross join (values
('vertex-group','Vertex Group','GROUP'),
('views','Views Hotel & Apartments','COMPANY'),
('managing','Vertex Managing IO','COMPANY'),
('engineers','Vertex Engineers','COMPANY'),
('travel','Vertex Travel','COMPANY'),
('investment','Vertex Investment / Ventures','COMPANY'),
('technologies','Vertex Technologies','COMPANY'),
('taxi','Vertex Taxi / Rent Car','COMPANY'),
('concierge','Concierge Service','COMPANY'),
('cleaning','Vertex Cleaning','COMPANY'),
('laundry','Vertex Laundry','COMPANY'),
('vmarket','V-Market','COMPANY'),
('aura','Aura Design Studio','COMPANY'),
('ditalia','D’Italia Ristorante','COMPANY')
) as v(code,name,kind)
on conflict do nothing;

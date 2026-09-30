begin;
-- Stable keyset feeds: tenant first, then ordered timestamp and UUID tie-breaker.
-- Initial staging tables are small. On a large installation, plan an online
-- CONCURRENTLY index rollout before applying an equivalent production migration.
create index vision_orders_feed on public.vision_orders(tenant_id,created_at desc,id desc);
create index vision_tasks_feed on public.vision_tasks(tenant_id,created_at desc,id desc);
create index vision_history_feed on public.vision_order_status_history(tenant_id,created_at desc,id desc);
create index vision_audit_feed on public.vision_audit_events(tenant_id,created_at desc,id desc);
commit;

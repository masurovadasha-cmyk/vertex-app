import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routePlan,projectSessionContext} from '../backend/kernel.mjs';

const tenant='11111111-1111-4111-8111-111111111111';
const organization='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const url=path=>new URL('https://vision.example'+path);

test('Application Kernel exposes only declared command, context and read routes',()=>{
  assert.equal(routePlan(url('/api/v1/views/commands'),'POST').rpc,'vision_views_command');
  assert.equal(routePlan(url('/api/commands'),'POST').rpc,'vision_command');
  const context=routePlan(url('/api/v1/context?tenant_id='+tenant+'&organization_id='+organization),'GET');
  assert.deepEqual({kind:context.kind,rpc:context.rpc,tenant:context.tenant,organization:context.organization},{kind:'context',rpc:'vision_session_context',tenant,organization});
  assert.equal(routePlan(url('/api/v1/views/bookings?tenant_id='+tenant+'&organization_id='+organization),'GET').table,'vision_views_bookings');
  const work=routePlan(url('/api/v1/work-feed?tenant_id='+tenant+'&organization_id='+organization+'&limit=25'),'GET');
  assert.deepEqual({kind:work.kind,rpc:work.rpc,tenant:work.tenant,organization:work.organization,limit:work.limit},{kind:'work-feed',rpc:'vision_work_feed',tenant,organization,limit:25});
  assert.equal(routePlan(url('/api/v1/work/commands'),'POST').rpc,'vision_work_command');
  const assignees=routePlan(url('/api/v1/work-assignees?tenant_id='+tenant+'&organization_id='+organization),'GET');
  assert.deepEqual({kind:assignees.kind,rpc:assignees.rpc,tenant:assignees.tenant,organization:assignees.organization},{kind:'work-assignees',rpc:'vision_work_assignees',tenant,organization});
  const notifications=routePlan(url('/api/v1/notifications?tenant_id='+tenant+'&organization_id='+organization+'&limit=20'),'GET');
  assert.deepEqual({kind:notifications.kind,rpc:notifications.rpc,tenant:notifications.tenant,organization:notifications.organization,limit:notifications.limit},{kind:'notification-feed',rpc:'vision_notification_feed',tenant,organization,limit:20});
  assert.equal(routePlan(url('/api/v1/notifications/commands'),'POST').rpc,'vision_notification_command');
  assert.equal(routePlan(url('/api/v1/views/commands'),'GET'),null);
  assert.equal(routePlan(url('/api/v1/unknown'),'GET'),null);
});

test('Application Kernel rejects ambiguous or malformed context scope',()=>{
  for(const path of [
    '/api/v1/context?tenant_id='+tenant,
    '/api/v1/context?tenant_id='+tenant+'&organization_id=bad',
    '/api/v1/context?tenant_id='+tenant+'&tenant_id='+tenant+'&organization_id='+organization,
    '/api/v1/context?tenant_id='+tenant+'&organization_id='+organization+'&permission=admin'
  ])assert.throws(()=>routePlan(url(path),'GET'),/invalid_context_query/);
  for(const path of [
    '/api/v1/work-feed?tenant_id='+tenant,
    '/api/v1/work-feed?tenant_id='+tenant+'&organization_id=bad',
    '/api/v1/work-feed?tenant_id='+tenant+'&organization_id='+organization+'&limit=0',
    '/api/v1/work-feed?tenant_id='+tenant+'&organization_id='+organization+'&limit=101',
    '/api/v1/work-feed?tenant_id='+tenant+'&organization_id='+organization+'&admin=true'
  ])assert.throws(()=>routePlan(url(path),'GET'),/invalid_work_feed_query/);
  for(const path of [
    '/api/v1/work-assignees?tenant_id='+tenant,
    '/api/v1/work-assignees?tenant_id='+tenant+'&organization_id=bad',
    '/api/v1/work-assignees?tenant_id='+tenant+'&organization_id='+organization+'&admin=true'
  ])assert.throws(()=>routePlan(url(path),'GET'),/invalid_work_assignees_query/);
  for(const path of [
    '/api/v1/notifications?tenant_id='+tenant,
    '/api/v1/notifications?tenant_id='+tenant+'&organization_id=bad',
    '/api/v1/notifications?tenant_id='+tenant+'&organization_id='+organization+'&limit=0',
    '/api/v1/notifications?tenant_id='+tenant+'&organization_id='+organization+'&limit=101',
    '/api/v1/notifications?tenant_id='+tenant+'&organization_id='+organization+'&admin=true'
  ])assert.throws(()=>routePlan(url(path),'GET'),/invalid_notification_query/);
});

test('session context DTO strips unknown data and validates every permission/capability',()=>{
  const raw={
    actor_id:actor,tenant_id:tenant,organization_id:organization,module:'views',module_enabled:true,guest_linked:false,
    roles:['views-manager','views-manager'],permissions:['views.operations.read','views.booking.manage','views.booking.manage'],
    capabilities:{read_operations:true,create_booking:false,manage_booking:true,execute_cleaning:false,verify_cleaning:false},
    secret:'must not cross the kernel'
  };
  const projected=projectSessionContext(raw);
  assert.equal(Object.hasOwn(projected,'secret'),false);
  assert.deepEqual(projected.roles,['views-manager']);
  assert.deepEqual(projected.permissions,['views.operations.read','views.booking.manage']);
  assert.equal(Object.isFrozen(projected),true);assert.equal(Object.isFrozen(projected.capabilities),true);
  assert.throws(()=>projectSessionContext({...raw,permissions:['admin/../../root']}),/upstream_invalid_response/);
  assert.throws(()=>projectSessionContext({...raw,capabilities:{...raw.capabilities,superadmin:true}}),/upstream_invalid_response/);
  assert.throws(()=>projectSessionContext({...raw,module_enabled:false}),/upstream_invalid_response/);
});

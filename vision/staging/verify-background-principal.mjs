import pg from 'pg';

const connectionString=process.env.VISION_BACKGROUND_DATABASE_URL;
if(!connectionString) throw new Error('VISION_BACKGROUND_DATABASE_URL_required');

const client=new pg.Client({connectionString});
await client.connect();
try{
  const identity=(await client.query('select current_user as role')).rows[0]?.role;
  if(identity!=='vision_background_staging') throw new Error('wrong_background_principal');

  const tableNames=[
    'public.vision_outbox_events',
    'public.vision_notifications',
    'public.vision_escalations',
    'public.vision_tasks',
    'public.vision_approval_requests'
  ];
  for(const table of tableNames){
    const row=(await client.query(
      "select has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE') as allowed",
      [table]
    )).rows[0];
    if(row?.allowed===true) throw new Error('unexpected_table_privilege:'+table);
  }

  const allowedFunctions=[
    'public.vision_outbox_claim(integer)',
    'public.vision_outbox_ack(uuid,uuid)',
    'public.vision_outbox_fail(uuid,uuid)',
    'public.vision_notification_consume(uuid,uuid,text,text,uuid,uuid,text,jsonb)',
    'public.vision_background_scopes(integer)',
    'public.vision_reconcile_escalations(uuid,uuid)'
  ];
  for(const fn of allowedFunctions){
    const row=(await client.query(
      "select has_function_privilege(current_user,$1,'EXECUTE') as allowed",
      [fn]
    )).rows[0];
    if(row?.allowed!==true) throw new Error('missing_function_privilege:'+fn);
  }

  process.stdout.write(JSON.stringify({
    principal:identity,
    directTableAccess:false,
    reviewedRpcCount:allowedFunctions.length,
    status:'passed'
  })+'\n');
}finally{
  await client.end();
}

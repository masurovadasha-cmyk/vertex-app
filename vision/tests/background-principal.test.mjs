import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sql=fs.readFileSync(path.resolve('vision/staging/background-principal-grants.sql'),'utf8');
const executable=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');

test('background staging principal is RPC-only and password-free',()=>{
  assert.match(sql,/rolname='vision_background_staging'/);
  assert.doesNotMatch(sql,/create\s+role|alter\s+role.*password|password\s+/i);
  assert.match(sql,/revoke all on all tables in schema public from vision_background_staging/);
  assert.match(sql,/revoke all on all sequences in schema public from vision_background_staging/);
  assert.match(sql,/revoke all on all functions in schema public from vision_background_staging/);
  for(const signature of [
    'vision_outbox_claim\\(integer\\)',
    'vision_outbox_ack\\(uuid,uuid\\)',
    'vision_outbox_fail\\(uuid,uuid\\)',
    'vision_notification_consume\\(uuid,uuid,text,text,uuid,uuid,text,jsonb\\)',
    'vision_background_scopes\\(integer\\)',
    'vision_reconcile_escalations\\(uuid,uuid\\)'
  ]) assert.match(sql,new RegExp('grant execute on function public\\.'+signature+' to vision_background_staging'));
  assert.doesNotMatch(sql,/grant\s+(select|insert|update|delete|truncate|references|trigger)\b/i);
});

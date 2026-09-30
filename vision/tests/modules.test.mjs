import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modules} from '../modules/registry.mjs';
import {validateModules} from '../module-sdk/validate.mjs';
import {readFile} from 'node:fs/promises';
const {events}=JSON.parse(await readFile(new URL('../contracts/events-v1.json',import.meta.url),'utf8'));
const options={events,allowedOrigins:['https://vertex-app.masurovadasha.workers.dev']};
test('registered modules are immutable and reject foreign permissions, unsafe launches and incompatible contracts',()=>{
  assert.throws(()=>{modules[0].permissions.push('cleaning.order.assign');},TypeError);
  const changes=[m=>m.permissions.push('cleaning.order.assign'),m=>m.events.push('unknown.event'),m=>m.core='>=9.0',m=>m.navigation.icon='/../../secret',m=>m.navigation.path='https://evil.example',m=>m.entrypoint.url='https://evil.example',m=>m.entrypoint.url='https://user:password@vertex-app.masurovadasha.workers.dev/',m=>m.entrypoint.identity_integration='connected'];
  for(const change of changes){const copy=structuredClone(modules);change(copy[0]);assert.throws(()=>validateModules(copy,options),/Invalid module/);}
  assert.throws(()=>validateModules([modules[0],modules[0]],options),/duplicate id/);
  assert.equal(validateModules(structuredClone(modules),options)[0].navigation.path,'/directions/views');
});

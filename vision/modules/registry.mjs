import {readFile} from 'node:fs/promises';
import {validateModules} from '../module-sdk/validate.mjs';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const manifests=await Promise.all(['views','cleaning'].map(id=>read(`./${id}/manifest.json`)));
const {events}=await read('../contracts/events-v1.json');
export const modules=validateModules(manifests,{events,allowedOrigins:['https://vertex-app.masurovadasha.workers.dev']});
// Only launchable directions belong here. A registered organization is not
// automatically a working application or a permission grant.
export const directions=Object.freeze(modules.filter(m=>m.navigation).map(m=>Object.freeze({
  id:m.id,name:m.name,...m.navigation,entrypoint:m.entrypoint
})).sort((a,b)=>a.order-b.order));

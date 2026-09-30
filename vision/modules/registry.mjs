import {readFile} from 'node:fs/promises';
const views=JSON.parse(await readFile(new URL('./views/manifest.json',import.meta.url),'utf8'));
// Only launchable directions belong here. A registered organization is not
// automatically a working application or a permission grant.
export const directions=[{
  id:views.id,
  name:views.name,
  ...views.navigation,
  entrypoint:views.entrypoint
}];

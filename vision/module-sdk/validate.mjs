const semver=/^(\d+)\.(\d+)\.(\d+)(?:-[a-z0-9.-]+)?$/;
const text=value=>typeof value==='string'&&value.trim().length>0;
function freeze(value){for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);}

// A manifest describes integration. It never grants database access or installs
// code. Entrypoints are checked against operator-owned origins, not manifest data.
export function validateModules(input,{events,allowedOrigins,coreVersion='0.2.0'}){
  const modules=structuredClone(input),ids=new Set(),orders=new Set();
  const core=coreVersion.match(semver);if(!core)throw new Error('Invalid core version');
  for(const m of modules){
    const fail=reason=>{throw new Error(`Invalid module ${m?.id||'?'}: ${reason}`);};
    if(!m||typeof m!=='object'||! /^[a-z][a-z0-9-]*$/.test(m.id||''))fail('id');
    if(ids.has(m.id))fail('duplicate id');ids.add(m.id);
    if(!text(m.name)||!semver.test(m.version||''))fail('name/version');
    const minimum=/^>=(\d+)\.(\d+)(?:\.(\d+))?$/.exec(m.core||'');
    if(!minimum)fail('unsupported core range');
    const target=minimum.slice(1).map(x=>Number(x||0)),current=core.slice(1).map(Number);
    let compatible=true;
    for(let i=0;i<3;i++){if(current[i]!==target[i]){compatible=current[i]>target[i];break;}}
    if(!compatible)fail('requires newer core');
    for(const key of ['permissions','services','events','workflows']){
      if(!Array.isArray(m[key])||m[key].some(x=>!text(x))||new Set(m[key]).size!==m[key].length)fail(key);
    }
    if([...m.permissions,...m.services].some(x=>!x.startsWith(m.id+'.')))fail('foreign namespace');
    if(m.events.some(x=>!Object.hasOwn(events,x)))fail('unknown event');
    if(Boolean(m.navigation)!==Boolean(m.entrypoint))fail('incomplete launch configuration');
    if(m.navigation){
      const n=m.navigation,e=m.entrypoint;
      if(!text(n.label)||!text(n.subtitle)||!text(n.description))fail('navigation text');
      if(!Number.isInteger(n.order)||n.order<1||orders.has(n.order))fail('navigation order');orders.add(n.order);
      if(n.path!==`/directions/${m.id}`||n.icon!==`/modules/${m.id}/icon.svg`)fail('navigation path');
      if(!Array.isArray(n.features)||n.features.some(x=>!text(x)))fail('features');
      let url;try{url=new URL(e.url);}catch{fail('entrypoint URL');}
      if(e.type!=='external'||url.protocol!=='https:'||url.username||url.password||!allowedOrigins.includes(url.origin))fail('untrusted entrypoint');
      if(e.identity_integration!=='not_connected')fail('unsupported identity integration');
    }
  }
  return freeze(modules);
}

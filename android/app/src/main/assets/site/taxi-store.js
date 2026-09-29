/* Fail-closed local demo repository. Replace via the same read/commit contract
 * with authenticated server APIs before accepting real orders. Not an auth layer. */
(function (root, factory) {
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./taxi-domain.js'):root.VertexTaxiDomain);
  if(typeof module==='object'&&module.exports) module.exports=api; else root.VertexTaxiStore=api;
})(typeof window==='undefined'?globalThis:window,function(D){
  'use strict';
  const KEY='vertex-taxi-v1';
  function create(storage) {
    let last, loaded=false;
    function error(code){const e=new Error(code);e.code=code;return e;}
    function read(){
      let raw;try{raw=storage.getItem(KEY);}catch{loaded=false;throw error('read');}
      let state;try{state=raw===null?D.empty():D.validateState(JSON.parse(raw));}catch{loaded=false;throw error('corrupt');}
      last=raw;loaded=true;return state;
    }
    function commit(change){
      if(!loaded)read();
      let raw;try{raw=storage.getItem(KEY);}catch{throw error('read');}
      if(raw!==last){loaded=false;throw error('conflict');}
      const before=raw===null?D.empty():D.validateState(JSON.parse(raw));
      const next=D.validateState(change(before));
      if(next.revision!==before.revision+1)throw error('revision');
      const json=JSON.stringify(next);
      try{storage.setItem(KEY,json);}catch{throw error('write');}
      last=json;return D.validateState(next);
    }
    return Object.freeze({read,commit});
  }
  return Object.freeze({KEY,create});
});

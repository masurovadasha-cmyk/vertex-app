/* Pure host reporting + bounded local preferences. Never a payment ledger or auth system. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VertexHostDomain=api;})(typeof window==='undefined'?globalThis:window,()=>{
'use strict';
const KEY='vertex-host-workspace-v1';
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function fresh(){return {version:1,name:'',language:'ru',largeText:false,reduceMotion:false,notifications:true,stars:[],read:{},notes:{}};}
function normalize(v){
 const d=fresh();if(!obj(v)||v.version!==1) return d;
 if(typeof v.name==='string')d.name=v.name.slice(0,60);if(['ru','en'].includes(v.language))d.language=v.language;
 for(const k of ['largeText','reduceMotion','notifications'])if(typeof v[k]==='boolean')d[k]=v[k];
 if(Array.isArray(v.stars))d.stars=[...new Set(v.stars.filter(x=>typeof x==='string'&&/^[\w-]{1,100}$/.test(x)))].slice(0,500);
 for(const k of ['read','notes'])if(obj(v[k]))for(const [id,val]of Object.entries(v[k]).slice(0,500))if(/^[\w-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)&&typeof val==='string'){
  if(k==='read'&&Number.isFinite(Date.parse(val)))d[k][id]=val;
  if(k==='notes')d[k][id]=val.slice(0,1000);
 }
 return d;
}
function repository(storage){
 let d=fresh(),raw=null,damaged=false,unavailable=false;
 try{raw=storage.getItem(KEY);if(raw!==null){const parsed=JSON.parse(raw);if(!obj(parsed)||parsed.version!==1)throw Error('schema');d=normalize(parsed);}}catch(e){damaged=raw!==null;unavailable=raw===null;}
 return Object.freeze({get:()=>clone(d),status:()=>({damaged,unavailable}),save(patch){
  if(!obj(patch))return {ok:false,error:'invalid'};
  if(unavailable)return {ok:false,error:'unreadable'};
  if((Array.isArray(patch.stars)&&patch.stars.length>500)||['read','notes'].some(k=>obj(patch[k])&&Object.keys(patch[k]).length>500))return {ok:false,error:'limit'};
  const next=normalize({...d,...patch,version:1});
  try{if(damaged&&raw!==null)storage.setItem(KEY+'-recovery',raw);storage.setItem(KEY,JSON.stringify(next));d=next;raw=JSON.stringify(next);damaged=false;unavailable=false;return {ok:true};}
  catch(e){return {ok:false,error:'storage'};}
 }});
}
function report(snapshot,{month='',property='all',currency='USD'}={}){
 const bookings=Array.isArray(snapshot?.bookings)?snapshot.bookings:[];
 const rows=bookings.filter(b=>obj(b)&&b.status==='Подтверждено'&&typeof b.arrival==='string'&&(!month||b.arrival.slice(0,7)===month)&&(property==='all'||b.listingId===property)&&b.currency===currency);
 const known=rows.filter(b=>Number.isFinite(b.total)&&b.total>=0);
 const totalMinor=known.reduce((s,b)=>s+Math.round(b.total*100),0);
 const nights=rows.reduce((s,b)=>s+(Number.isInteger(b.n)&&b.n>0?b.n:0),0);
 const months=Array.from({length:6},(_,i)=>{const base=/^\d{4}-\d{2}$/.test(month)?month:new Date().toISOString().slice(0,7);const [y,m]=base.split('-').map(Number);const date=new Date(Date.UTC(y,m-6+i,1));const key=date.toISOString().slice(0,7);const matching=bookings.filter(b=>obj(b)&&b.status==='Подтверждено'&&b.currency===currency&&(property==='all'||b.listingId===property)&&typeof b.arrival==='string'&&b.arrival.startsWith(key)&&Number.isFinite(b.total)&&b.total>=0);return {key,total:matching.reduce((s,b)=>s+Math.round(b.total*100),0)/100};});
 return {rows:clone(rows),count:rows.length,nights,total:totalMinor/100,priced:known.length,unpriced:rows.length-known.length,currency,months};
}
function csv(rows){
 const cell=v=>'"'+String(v??'').replace(/^(?=\s*[=+\-@]|[\t\r\n])/,"'").replace(/"/g,'""')+'"';
 const cols=['id','title','arrival','departure','guests','status','total','currency'];
 return '\ufeff'+[cols,...rows.map(r=>cols.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
}
function filterBookings(bookings,tab,date){return bookings.filter(b=>obj(b)&&['Запрос отправлен','Подтверждено'].includes(b.status)).filter(b=>tab==='arrivals'?b.arrival===date:tab==='departures'?b.departure===date:tab==='staying'?b.arrival<=date&&b.departure>date:b.departure>=date).sort((a,b)=>a.arrival.localeCompare(b.arrival));}
return Object.freeze({KEY,normalize,repository,report,csv,filterBookings});
});

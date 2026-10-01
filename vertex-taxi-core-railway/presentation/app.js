const API="https://vertex-taxi-core-api-production.up.railway.app";
const USER="demo-client-presentation-web";
const DRIVER1="demo-driver-1";
const DRIVER2="demo-driver-2";
const app=document.querySelector("#app");
const state={
  screen:"splash",role:"client",tariff:"comfort",ride:null,rideId:localStorage.getItem("vertexRideId")||null,
  offerId:null,driverId:localStorage.getItem("vertexDriverId")||DRIVER1,stars:5,error:null,map:null,
  pickup:{lat:41.3111,lng:69.2797,label:"NRG U-Tower, Tashkent"},
  destination:{lat:41.2995,lng:69.2401,label:"Tashkent City Mall"},
  apiOnline:true
};

async function api(path,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4500);
  try{
    const res=await fetch(API+path,{...options,signal:controller.signal,headers:{"content-type":"application/json",...(options.headers||{})}});
    const text=await res.text();
    let body={};try{body=JSON.parse(text)}catch{body={raw:text}}
    if(!res.ok) throw new Error(body.error||("HTTP "+res.status));
    state.apiOnline=true;
    return body;
  }catch(error){
    state.apiOnline=false;
    throw error;
  }finally{clearTimeout(timer)}
}
function money(minor){return "$"+(Number(minor||0)/100).toFixed(2)}
function icon(name){const m={home:"⌂",history:"◷",wallet:"▣",profile:"♙",earn:"▥",orders:"▤",admin:"⚙"};return m[name]||"•"}
function setScreen(screen){
 state.screen=screen;state.error=null;destroyMap();
 try{
   if(state.rideId&&["trip","driverNav"].includes(screen)) window.VertexNative?.connectRideRealtime?.(state.rideId);
   else window.VertexNative?.disconnectRideRealtime?.();
 }catch{}
 render();window.scrollTo(0,0)
}
function destroyMap(){if(state.map){state.map.remove();state.map=null}}
function tabs(active,role=state.role){
  const items=role==="driver"?[["driverHome","home","Home"],["earnings","earn","Earnings"],["driverOrders","orders","Orders"],["profile","profile","Profile"]]:[["home","home","Home"],["history","history","History"],["wallet","wallet","Wallet"],["profile","profile","Profile"]];
  return '<nav class="tabs">'+items.map(([s,i,l])=>`<button data-screen="${s}" class="${active===s?"active":""}"><span class="ico">${icon(i)}</span>${l}</button>`).join("")+'</nav>';
}
function topbar(title,back=true){
 return `<div class="topbar">${back?'<button class="back" data-back>‹</button>':'<div class="brand"><span class="vmark">V</span>VERTEX TAXI</div>'}<h1>${title||""}</h1><div class="avatar">V</div></div>`;
}
function mapHtml(overlay=""){return `<div class="map-wrap"><div id="map" class="map"></div>${overlay}</div>`}
function initMap(mode="client"){
 if(!window.L||!document.querySelector("#map"))return;
 destroyMap();
 const center=mode==="driver"?[41.3111,69.2797]:[state.pickup.lat,state.pickup.lng];
 const map=L.map("map",{zoomControl:false,attributionControl:false}).setView(center,13);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
 const gold="#e7b749",blue="#7ea9ff";
 const marker=(p,label,color)=>L.circleMarker([p.lat,p.lng],{radius:8,color:"#081018",weight:3,fillColor:color,fillOpacity:1}).addTo(map).bindTooltip(label,{permanent:true,direction:"top",offset:[0,-8]});
 if(mode==="client"||mode==="trip"){marker(state.pickup,"Pickup","#20c985");marker(state.destination,"Destination",gold);L.polyline([[state.pickup.lat,state.pickup.lng],[41.306,69.266],[state.destination.lat,state.destination.lng]],{color:mode==="trip"?blue:gold,weight:5,opacity:.85}).addTo(map)}
 if(mode==="driver"){marker({lat:41.312,lng:69.28},"You",gold);if(state.ride)L.polyline([[41.312,69.28],[state.pickup.lat,state.pickup.lng]],{color:blue,weight:5}).addTo(map)}
 state.map=map;
}
async function useLocation(){
 if(!navigator.geolocation)return;
 navigator.geolocation.getCurrentPosition(p=>{state.pickup={lat:p.coords.latitude,lng:p.coords.longitude,label:"Моя геопозиция"};render()},()=>{}, {enableHighAccuracy:true,timeout:7000});
}
const tariffs={start:{name:"Standard",fare:"$5.0"},comfort:{name:"Comfort",fare:"$8.0"},business:{name:"Business",fare:"$13.0"}};

function splash(){
 return `<main class="screen no-tabs hero"><div class="skyline"></div><div class="car-art"></div><div class="logo-large"><span class="vmark">V</span></div><div class="logo-title">VERTEX TAXI</div><h1>Move the World<br/>with Comfort</h1><p>Safe · Fast · Premium</p><button class="gold-btn" data-screen="login">Get Started</button><button class="link-btn" data-screen="login">Sign in</button><div class="notice">Presentation staging · Tashkent</div></main>`
}
function login(){
 return `<main class="screen no-tabs">${topbar("",true)}<div class="auth-card"><div class="logo-large"><span class="vmark">V</span></div><h1>Welcome to<br/>Vertex Taxi</h1><p>Sign in to continue</p><div class="social"><button data-login="google">🇬 Google&nbsp;&nbsp; Continue with Google</button><button data-login="apple">● Apple&nbsp;&nbsp; Continue with Apple</button><button class="email" data-login="email">✉&nbsp;&nbsp; Continue with Email</button></div><div class="or">or</div><button class="gold-btn" data-role="driver">Sign in as Driver</button><button class="link-btn" data-role="admin">Admin presentation</button><p class="notice">Demo authentication for presentation. No real account or payment is created.</p></div></main>`
}
function routeOverlay(){
 return `<div class="map-overlay"><div class="route-field"><span class="route-dot"></span><div><small>Your location</small><strong>${state.pickup.label}</strong></div><button class="link-btn" data-location>◎</button></div><div class="route-field"><span class="route-dot dest"></span><div><small>Where to?</small><strong>${state.destination.label}</strong></div><span>›</span></div></div>`
}
function home(){
 return `<main class="screen">${topbar("",false)}${mapHtml(routeOverlay())}<section class="bottom-sheet"><div class="tariffs">${Object.entries(tariffs).map(([id,t])=>`<button class="tariff ${state.tariff===id?"active":""}" data-tariff="${id}"><span class="car-mini">🚘</span><strong>${t.name}</strong><b>${t.fare}</b><span>${id==="business"?"Premium":"2 min"}</span></button>`).join("")}</div>${state.error?`<div class="error" style="margin-top:10px">${state.error}</div>`:""}<button class="gold-btn" style="margin-top:12px" data-order>Order a Taxi</button><div class="notice">Railway demo API · ${state.apiOnline?"online":"offline fallback"}</div></section>${tabs("home")}</main>`;
}
async function createClientRide(){
 state.error=null;render();
 try{
   const quote=await api("/demo/v1/quotes",{method:"POST",body:JSON.stringify({userId:USER,pickup:state.pickup,destination:state.destination,serviceClass:state.tariff,distanceKm:12})});
   const ride=await api("/demo/v1/rides",{method:"POST",body:JSON.stringify({userId:USER,quoteId:quote.data.id})});
   state.ride=ride.data;state.rideId=ride.data.id;localStorage.setItem("vertexRideId",state.rideId);
   for(const d of [{id:DRIVER1,lat:41.312,lng:69.28},{id:DRIVER2,lat:41.314,lng:69.282}]){
     await api("/demo/v1/drivers/"+d.id+"/location",{method:"POST",body:JSON.stringify({lat:d.lat,lng:d.lng,accuracyM:8,available:true,serviceClasses:[state.tariff]})});
   }
   const cs=await api("/demo/v1/dispatch/"+state.rideId+"/candidates");
   const chosen=cs.data[0]?.driverId||DRIVER1;state.driverId=chosen;localStorage.setItem("vertexDriverId",chosen);
   const offer=await api("/demo/v1/offers",{method:"POST",body:JSON.stringify({rideId:state.rideId,driverId:chosen})});
   state.offerId=offer.data.offerId;
   const accepted=await api("/demo/v1/offers/"+state.offerId+"/accept",{method:"POST",body:"{}"});
   state.ride=accepted.data;
   await commandRide("DRIVER_EN_ROUTE",chosen,false);
   setScreen("trip");
 }catch(e){state.error="Demo API: "+e.message;render()}
}
async function commandRide(command,actorId,rerender=true){
 if(!state.rideId)throw new Error("No active ride");
 const r=await api("/demo/v1/rides/"+state.rideId+"/commands",{method:"POST",body:JSON.stringify({command,actorId})});
 state.ride=r.data;if(rerender)render();return r.data;
}
function trip(){
 const ride=state.ride||{state:"DRIVER_EN_ROUTE",fare_minor:1300};
 return `<main class="screen">${topbar("Trip tracking",true)}${mapHtml("")}<section class="bottom-sheet"><div class="status-pill">${ride.state==="DRIVER_EN_ROUTE"?"Driver is on the way · 2 min":ride.state}</div><div class="driver-card" style="margin-top:14px"><div class="driver-face">🧔</div><div><strong>Azizbek</strong><small>★ 4.9 · 1 245 trips<br/>Toyota Camry · 01 234 ABC</small></div><div class="round-actions"><button>☎</button><button>✉</button></div></div><div class="grid2" style="margin-top:12px"><button class="outline-btn" data-share>Share trip</button><button class="outline-btn" data-cancel>Cancel</button></div><button class="gold-btn" style="margin-top:10px" data-driver-demo>Open driver view</button></section>${tabs("home")}</main>`
}
async function cancelRide(){
 try{await commandRide("RIDER_CANCEL",USER,false);setScreen("home")}catch(e){state.error=e.message;render()}
}
function driverEntry(){
 return `<main class="screen no-tabs hero"><div class="skyline"></div><div class="car-art"></div><div class="logo-large"><span class="vmark">V</span></div><div class="logo-title">VERTEX TAXI DRIVER</div><h1>Drive. Earn. Grow.<br/>Together.</h1><button class="gold-btn" data-screen="driverHome">Sign in as Driver</button><button class="outline-btn" style="margin-top:10px" data-screen="driverHome">Register as Driver</button><button class="link-btn" data-screen="login">Back to client</button></main>`
}
async function prepareDriverOrder(){
 try{
  const q=await api("/demo/v1/quotes",{method:"POST",body:JSON.stringify({userId:"demo-client-driverflow",pickup:state.pickup,destination:state.destination,serviceClass:"comfort",distanceKm:12})});
  const r=await api("/demo/v1/rides",{method:"POST",body:JSON.stringify({userId:"demo-client-driverflow",quoteId:q.data.id})});
  state.ride=r.data;state.rideId=r.data.id;localStorage.setItem("vertexRideId",state.rideId);
  await api("/demo/v1/drivers/"+DRIVER1+"/location",{method:"POST",body:JSON.stringify({lat:41.312,lng:69.28,accuracyM:8,available:true,serviceClasses:["comfort"]})});
  const off=await api("/demo/v1/offers",{method:"POST",body:JSON.stringify({rideId:state.rideId,driverId:DRIVER1})});
  state.offerId=off.data.offerId;setScreen("driverOrder");
 }catch(e){state.error=e.message;render()}
}
function driverHome(){
 return `<main class="screen">${topbar("",false)}${mapHtml("")}<section class="bottom-sheet"><div class="status-pill">Online</div><h2 class="trip-title">Ready for a new order?</h2><p style="color:var(--muted);font-size:13px">Demand is active around central Tashkent.</p>${state.error?`<div class="error">${state.error}</div>`:""}<button class="gold-btn" data-new-driver-order>Find demo order</button></section>${tabs("driverHome","driver")}</main>`
}
function driverOrder(){
 return `<main class="screen">${topbar("New order",true)}${mapHtml("")}<section class="bottom-sheet"><div style="display:flex;justify-content:space-between"><strong>New order</strong><span>1.5 km</span></div><div class="trip-title">Amir Temur Ave. → Tashkent City Mall</div><div class="trip-price">$13.00</div><div class="role-switch"><span class="role-chip">Comfort</span><span class="role-chip">Cash / Demo</span></div><div class="grid2" style="margin-top:14px"><button class="dark-btn" data-screen="driverHome">Decline</button><button class="gold-btn" data-driver-accept>Accept</button></div></section>${tabs("driverHome","driver")}</main>`
}
async function driverAccept(){
 try{const r=await api("/demo/v1/offers/"+state.offerId+"/accept",{method:"POST",body:"{}"});state.ride=r.data;state.driverId=DRIVER1;await commandRide("DRIVER_EN_ROUTE",DRIVER1,false);setScreen("driverNav")}catch(e){state.error=e.message;render()}
}
function driverNav(){
 const s=state.ride?.state||"DRIVER_EN_ROUTE";
 const next=s==="DRIVER_EN_ROUTE"?["ARRIVED","Arrived"]:s==="DRIVER_ARRIVED"?["RIDER_ONBOARD","Passenger onboard"]:s==="RIDER_ONBOARD"?["START","Start trip"]:s==="IN_PROGRESS"?["COMPLETE","Complete trip"]:null;
 return `<main class="screen">${topbar("On the way to passenger",true)}${mapHtml("")}<section class="bottom-sheet"><div class="driver-card"><div class="driver-face">👩</div><div><strong>Sarah M.</strong><small>★ 4.8<br/>Amir Temur Ave. 15</small></div><div class="round-actions"><button>✉</button><button>☎</button></div></div><div class="status-pill" style="margin-top:12px">${s}</div>${next?`<button class="gold-btn" style="margin-top:12px" data-driver-command="${next[0]}">${next[1]}</button>`:`<button class="gold-btn" style="margin-top:12px" data-screen="earnings">View earnings</button>`}</section>${tabs("driverHome","driver")}</main>`
}
async function driverCommand(cmd){
 try{await commandRide(cmd,DRIVER1,false);if(cmd==="COMPLETE")setScreen("earnings");else setScreen("driverNav")}catch(e){state.error=e.message;render()}
}
async function earnings(){
 let data={trips:12,gross_minor:8450,rating:4.8};
 try{const r=await api("/demo/v1/drivers/"+DRIVER1+"/earnings");data={...data,...r.data}}catch{}
 const vals=[28,46,35,70,52,92,41,67,32];
 return `<main class="screen">${topbar("Earnings",true)}<div class="role-switch"><span class="role-chip gold">Day</span><span class="role-chip">Week</span><span class="role-chip">Month</span></div><div class="earnings"><b>${money(data.gross_minor)}</b><small>Today · ${data.trips} trips · rating ${Number(data.rating||4.8).toFixed(1)}</small></div><div class="bars">${vals.map(v=>`<span class="bar" style="height:${v}%"></span>`).join("")}</div><div class="list" style="margin-top:18px"><div class="row"><span>Transactions</span><b>›</b></div><div class="row"><span>Incentives</span><b>›</b></div><div class="row"><span>Ratings</span><b>›</b></div><div class="row"><span>Support</span><b>›</b></div></div>${tabs("earnings","driver")}</main>`
}
async function payment(){
 let ride=state.ride;
 if(!ride&&state.rideId){try{ride=(await api("/demo/v1/rides/"+state.rideId)).data}catch{}}
 const total=ride?.fare_minor||1300;
 let paid={status:"PAID",last4:"4242",service_fee_minor:Math.round(total*.05),subtotal_minor:Math.round(total*.95)};
 try{if(state.rideId)paid=(await api("/demo/v1/rides/"+state.rideId+"/demo-payment",{method:"POST",body:JSON.stringify({last4:"4242"})})).data}catch{}
 return `<main class="screen no-tabs">${topbar("Trip completed",true)}<div class="card receipt"><div class="trip-title">NRG U-Tower → Tashkent City Mall</div><div class="line"><strong>Total</strong><strong>${money(total)}</strong></div><div class="line"><span>Distance</span><span>${money(paid.subtotal_minor)}</span></div><div class="line"><span>Service fee</span><span>${money(paid.service_fee_minor)}</span></div><div class="line"><span>Payment method</span><span>•••• ${paid.last4||"4242"} <b class="green">${paid.status}</b></span></div></div><h3>Rate your driver</h3><div class="stars">${[1,2,3,4,5].map(n=>`<button data-star="${n}" class="${n<=state.stars?"on":""}">★</button>`).join("")}</div><textarea id="rating-comment" placeholder="Great ride!"></textarea><button class="gold-btn" style="margin-top:12px" data-rate>Done</button></main>`
}
async function submitRating(){
 if(!state.rideId)return setScreen("home");
 const comment=document.querySelector("#rating-comment")?.value||"Great ride!";
 try{await api("/demo/v1/rides/"+state.rideId+"/rating",{method:"POST",body:JSON.stringify({userId:state.ride?.user_id||USER,stars:state.stars,comment})})}catch{}
 setScreen("home")
}
async function history(){
 let rides=[];try{rides=(await api("/demo/v1/users/"+USER+"/rides")).data}catch{}
 return `<main class="screen">${topbar("History",false)}<div class="list">${rides.length?rides.map(r=>`<div class="row"><div><strong>${r.pickup_label} → ${r.destination_label}</strong><small>${r.state}</small></div><b>${money(r.fare_minor)}</b></div>`).join(""):'<div class="row"><span>No trips yet</span></div>'}</div>${tabs("history")}</main>`
}
function wallet(){return `<main class="screen">${topbar("Wallet",false)}<div class="card"><small style="color:var(--muted)">Demo balance</small><div class="trip-price">$120.00</div></div><div class="list" style="margin-top:14px"><div class="row"><span>Visa •••• 4242</span><b class="green">Demo</b></div><div class="row"><span>Add payment method</span><b>›</b></div></div>${tabs("wallet")}</main>`}
function profile(){return `<main class="screen">${topbar("Profile",false)}<div class="card driver-card"><div class="driver-face">V</div><div><strong>Vertex Demo User</strong><small>${state.role}</small></div><span class="role-chip">staging</span></div><h3>Presentation roles</h3><div class="role-switch"><button data-role="client">Client</button><button data-role="driver">Driver</button><button data-role="staff">Staff</button><button data-role="moderator">Moderator</button><button data-role="admin">Admin</button></div><div class="list" style="margin-top:16px"><button data-screen="login"><span>Sign out</span><b>›</b></button></div>${tabs("profile",state.role==="driver"?"driver":"client")}</main>`}
async function admin(){
 let d={onlineDrivers:2,rides:{rides:0,gross_minor:0},states:{},recentRides:[]};try{d=(await api("/demo/v1/admin/summary")).data}catch{}
 const completed=d.states?.COMPLETED||0;
 const items=["Live Map","Drivers","Orders","Users","Payments","Support","Analytics","Settings"];
 return `<main class="screen no-tabs">${topbar("",false)}<div class="brand" style="margin-bottom:18px"><span class="vmark">V</span>VERTEX TAXI <span class="role-chip">ADMIN</span></div><div class="grid2"><div class="metric"><b class="green">${d.onlineDrivers}</b><span>Active Drivers</span></div><div class="metric"><b>${d.rides?.rides||0}</b><span>Orders</span></div><div class="metric"><b>${completed}</b><span>Completed</span></div><div class="metric"><b class="gold">${money(d.rides?.gross_minor||0)}</b><span>Demo Revenue</span></div></div><div class="list" style="margin-top:16px">${items.map(x=>`<button data-admin-section="${x}"><span>${x}</span><b>›</b></button>`).join("")}</div><button class="outline-btn" style="margin-top:16px" data-role="client">Exit admin</button></main>`
}
function driverOrders(){return `<main class="screen">${topbar("Orders",false)}<div class="list"><div class="row"><div><strong>Current / recent demo order</strong><small>${state.ride?.state||"No active order"}</small></div><b>›</b></div></div>${tabs("driverOrders","driver")}</main>`}

async function adminDetail(){
 const section=state.adminSection||"Overview";
 let d={onlineDrivers:0,rides:{rides:0,gross_minor:0},states:{},recentRides:[]};try{d=(await api("/demo/v1/admin/summary")).data}catch{}
 const demoRows={
   "Live Map":[["demo-driver-1","Online · Central Tashkent"],["demo-driver-2","Online · Tashkent City"]],
   "Drivers":[["demo-driver-1","Active"],["demo-driver-2","Active"]],
   "Users":[["demo-client-presentation-web","Client"],["demo-client-ci","Client"],["demo-driver-1","Driver"]],
   "Payments":[["Demo card •••• 4242","PAID"],["Real processing","Disabled in staging"]],
   "Support":[["VT-SUP-01","Trip assistance · open"],["VT-SUP-02","Driver verification · review"]],
   "Analytics":[["Total demo rides",String(d.rides?.rides||0)],["Gross demo volume",money(d.rides?.gross_minor||0)]],
   "Settings":[["Environment","Railway staging"],["Real payments","Disabled"],["Production dispatch","Disabled"]],
 };
 const rows=section==="Orders"?(d.recentRides||[]).slice(0,12).map(r=>[String(r.id).slice(0,8),r.state+" · "+money(r.fare_minor)]):(demoRows[section]||[]);
 return `<main class="screen no-tabs">${topbar(section,true)}${section==="Live Map"?mapHtml(""):""}<div class="list" style="margin-top:14px">${rows.length?rows.map(([a,b])=>`<div class="row"><div><strong>${a}</strong><small>${b}</small></div><b>›</b></div>`).join(""):'<div class="row"><span>No demo records</span></div>'}</div><button class="outline-btn" style="margin-top:16px" data-screen="admin">Back to Admin</button></main>`
}

function staff(){
 return `<main class="screen no-tabs">${topbar("",false)}<div class="brand"><span class="vmark">V</span>VERTEX OPERATIONS <span class="role-chip">STAFF</span></div><h2 class="serif" style="font-size:30px">Operations shift</h2><div class="grid2"><div class="metric"><b class="green">2</b><span>Drivers online</span></div><div class="metric"><b>${state.ride?.state?"1":"0"}</b><span>Active demo rides</span></div><div class="metric"><b>0</b><span>Critical incidents</span></div><div class="metric"><b>99.9%</b><span>Core health</span></div></div><div class="list" style="margin-top:16px"><div class="row"><span>Ride monitoring</span><b>›</b></div><div class="row"><span>Driver support</span><b>›</b></div><div class="row"><span>Fleet checks</span><b>›</b></div></div><button class="outline-btn" style="margin-top:16px" data-screen="profile">Role switch</button></main>`
}

function moderator(){
 return `<main class="screen no-tabs">${topbar("",false)}<div class="brand"><span class="vmark">V</span>VERTEX TRUST <span class="role-chip">MODERATOR</span></div><h2 class="serif" style="font-size:30px">Driver verification</h2><div class="card"><strong>Aziz R.</strong><p style="color:var(--muted)">Tashkent · Leapmotor C01 · Documents submitted</p><div class="grid2"><button class="outline-btn" data-mod-action="reject">Reject</button><button class="gold-btn" data-mod-action="approve">Approve</button></div></div><div id="mod-result" class="notice">Presentation-only moderation adapter</div><button class="outline-btn" style="margin-top:16px" data-screen="profile">Role switch</button></main>`
}

async function render(){
 destroyMap();
 let html="";
 if(state.screen==="splash")html=splash();
 else if(state.screen==="login")html=login();
 else if(state.screen==="home")html=home();
 else if(state.screen==="trip")html=trip();
 else if(state.screen==="driverEntry")html=driverEntry();
 else if(state.screen==="driverHome")html=driverHome();
 else if(state.screen==="driverOrder")html=driverOrder();
 else if(state.screen==="driverNav")html=driverNav();
 else if(state.screen==="earnings")html=await earnings();
 else if(state.screen==="payment")html=await payment();
 else if(state.screen==="history")html=await history();
 else if(state.screen==="wallet")html=wallet();
 else if(state.screen==="profile")html=profile();
 else if(state.screen==="admin")html=await admin();
 else if(state.screen==="adminDetail")html=await adminDetail();
 else if(state.screen==="staff")html=staff();
 else if(state.screen==="moderator")html=moderator();
 else if(state.screen==="driverOrders")html=driverOrders();
 app.innerHTML=`<div class="app">${html}</div>`;
 bind();
 requestAnimationFrame(()=>{
   if(["home"].includes(state.screen))initMap("client");
   if(["trip"].includes(state.screen))initMap("trip");
   if(["driverHome","driverOrder","driverNav"].includes(state.screen))initMap("driver");
 });
}
function bind(){
 document.querySelectorAll("[data-screen]").forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
 document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>setScreen(state.role==="driver"?"driverHome":state.role==="admin"?"admin":state.role==="staff"?"staff":state.role==="moderator"?"moderator":"home"));
 document.querySelectorAll("[data-login]").forEach(b=>b.onclick=()=>{state.role="client";setScreen("home")});
 document.querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>{state.role=b.dataset.role;if(state.role==="driver")setScreen("driverEntry");else if(state.role==="admin")setScreen("admin");else if(state.role==="staff")setScreen("staff");else if(state.role==="moderator")setScreen("moderator");else if(state.role==="client"&&state.ride?.state==="COMPLETED")setScreen("payment");else setScreen("home")});
 document.querySelectorAll("[data-tariff]").forEach(b=>b.onclick=()=>{state.tariff=b.dataset.tariff;render()});
 document.querySelector("[data-location]")?.addEventListener("click",useLocation);
 document.querySelector("[data-order]")?.addEventListener("click",createClientRide);
 document.querySelector("[data-cancel]")?.addEventListener("click",cancelRide);
 document.querySelector("[data-share]")?.addEventListener("click",()=>navigator.share?.({title:"Vertex Taxi",text:"My Vertex Taxi demo trip"}));
 document.querySelector("[data-driver-demo]")?.addEventListener("click",()=>{state.role="driver";setScreen("driverNav")});
 document.querySelector("[data-new-driver-order]")?.addEventListener("click",prepareDriverOrder);
 document.querySelector("[data-driver-accept]")?.addEventListener("click",driverAccept);
 document.querySelectorAll("[data-driver-command]").forEach(b=>b.onclick=()=>driverCommand(b.dataset.driverCommand));
 document.querySelectorAll("[data-star]").forEach(b=>b.onclick=()=>{state.stars=Number(b.dataset.star);render()});
 document.querySelector("[data-rate]")?.addEventListener("click",submitRating);
 document.querySelectorAll("[data-admin-section]").forEach(b=>b.onclick=()=>{state.adminSection=b.dataset.adminSection;setScreen("adminDetail")});
 document.querySelectorAll("[data-mod-action]").forEach(b=>b.onclick=()=>{const el=document.querySelector("#mod-result");if(el){el.className=b.dataset.modAction==="approve"?"success":"error";el.textContent=b.dataset.modAction==="approve"?"Driver approved in presentation mode":"Driver rejected in presentation mode"}});
 try{
   const native=window.VertexNative;
   const driverOnline=state.role==="driver"&&["driverHome","driverOrder","driverNav","earnings","driverOrders"].includes(state.screen);
   native?.setDriverOnline?.(driverOnline);
 }catch{}
 if(state.screen==="trip"&&state.ride?.state==="COMPLETED")setTimeout(()=>setScreen("payment"),200);
}
window.addEventListener("popstate",()=>{if(state.screen!=="splash")setScreen("home")});
render();

window.addEventListener("vertex:realtime", async (event)=>{
  try{
    const payload=typeof event.detail==="string"?JSON.parse(event.detail):event.detail;
    if(!payload||payload.rideId!==state.rideId)return;
    if(payload.state){
      state.ride={...(state.ride||{}),state:payload.state,version:payload.version??state.ride?.version};
      if(["trip","driverNav"].includes(state.screen))render();
      if(payload.state==="COMPLETED"&&state.role==="client")setScreen("payment");
    }
  }catch{}
});
window.addEventListener("vertex:realtime-status",(event)=>{
  document.documentElement.dataset.realtime=String(event.detail||"unknown");
});

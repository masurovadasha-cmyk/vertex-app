const KEY="vertex.engineers.prototype.v1";
const seed={projects:[],assets:[],workOrders:[]};
const clone=x=>JSON.parse(JSON.stringify(x));
function load(){try{return {...clone(seed),...JSON.parse(localStorage.getItem(KEY)||"{}")};}catch{return clone(seed);}}
function save(data){localStorage.setItem(KEY,JSON.stringify(data));return clone(data);}
const id=p=>p+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
export function createPrototypeStore(){
 let data=load();
 return{
  snapshot:()=>clone(data),
  reset:()=>{data=clone(seed);save(data);return clone(data);},
  createProject(input){const item={id:id("project"),name:input.name||"Demo project",client_id:"demo-client",type:input.type||"mixed",site_address:input.site_address||"",stage:"lead",status:"active",demo:true};data.projects.unshift(item);save(data);return clone(item);},
  addEquipment(input){if(!input.project_id)throw new Error("Сначала создайте проект.");const item={id:id("asset"),project_id:input.project_id,category:input.category||"elevator",manufacturer:input.manufacturer||"",model:input.model||"",site_location:input.site_location||"",status:"installed",demo:true};data.assets.unshift(item);save(data);return clone(item);},
  createWorkOrder(input){if(!input.asset_id)throw new Error("Сначала добавьте оборудование.");const item={id:id("work"),asset_id:input.asset_id,type:input.type||"preventive",priority:input.priority||"normal",status:"open",requested_at:new Date().toISOString(),demo:true};data.workOrders.unshift(item);save(data);return clone(item);},
  advanceWorkOrder(idValue){const order=data.workOrders.find(x=>x.id===idValue);if(!order)throw new Error("Заявка не найдена.");const flow=["open","assigned","in_progress","completed"];const index=flow.indexOf(order.status);if(index<flow.length-1)order.status=flow[index+1];save(data);return clone(order);}
 };
}

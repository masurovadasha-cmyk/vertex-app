export const RIDE_TRANSITIONS=Object.freeze({
  DRIVER_EN_ROUTE:{from:["DRIVER_ASSIGNED"],to:"DRIVER_EN_ROUTE"},
  ARRIVED:{from:["DRIVER_EN_ROUTE"],to:"DRIVER_ARRIVED"},
  RIDER_ONBOARD:{from:["DRIVER_ARRIVED"],to:"RIDER_ONBOARD"},
  START:{from:["RIDER_ONBOARD","DRIVER_ARRIVED"],to:"IN_PROGRESS"},
  COMPLETE:{from:["IN_PROGRESS"],to:"COMPLETED"},
  RIDER_CANCEL:{from:["REQUESTED","SEARCHING","DRIVER_OFFERED","DRIVER_ASSIGNED","DRIVER_EN_ROUTE","DRIVER_ARRIVED","RIDER_ONBOARD"],to:"RIDER_CANCELLED"},
  DRIVER_CANCEL:{from:["DRIVER_OFFERED","DRIVER_ASSIGNED","DRIVER_EN_ROUTE","DRIVER_ARRIVED"],to:"DRIVER_CANCELLED"},
});

export const TERMINAL_RIDE_STATES=new Set([
  "COMPLETED","RIDER_CANCELLED","DRIVER_CANCELLED","SYSTEM_CANCELLED","NO_DRIVER","EXPIRED"
]);

export function resolveRideTransition(state,command){
  const rule=RIDE_TRANSITIONS[command];
  if(!rule)return {ok:false,error:"unknown_command",state,command};
  if(!rule.from.includes(state))return {ok:false,error:"invalid_transition",state,command};
  return {ok:true,from:state,to:rule.to,command};
}

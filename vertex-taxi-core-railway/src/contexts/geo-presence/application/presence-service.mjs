import {latLngToCell,gridDisk} from "h3-js";
import {validateLocation,isFresh} from "../domain/presence-policy.mjs";

export function createPresenceService({store,h3Resolution=9,ttlSeconds=20,clock=()=>Date.now()}){
  return {
    async update(driverId,input){
      validateLocation(input);
      const now=clock();
      const cell=latLngToCell(input.lat,input.lng,h3Resolution);
      await store.upsert(driverId,{...input,updatedAt:now},cell);
      return {driverId,cell,ttlSeconds};
    },
    async candidates({pickupLat,pickupLng,serviceClass,radius=2,limit=20}){
      const origin=latLngToCell(Number(pickupLat),Number(pickupLng),h3Resolution);
      const cells=gridDisk(origin,radius);
      const ids=await store.driverIdsInCells(cells);
      const now=clock();
      const result=[];
      for(const driverId of ids){
        const raw=await store.get(driverId);
        const updatedAt=Number(raw.updatedAt);
        if(!raw.updatedAt||!isFresh(updatedAt,now,ttlSeconds)||raw.available!=="true") continue;
        let classes=[];try{classes=JSON.parse(raw.serviceClasses||"[]")}catch{}
        if(!classes.includes(serviceClass)) continue;
        const dLat=(Number(raw.lat)-Number(pickupLat))*111;
        const dLng=(Number(raw.lng)-Number(pickupLng))*111*Math.cos(Number(pickupLat)*Math.PI/180);
        const approxKm=Math.sqrt(dLat*dLat+dLng*dLng);
        result.push({driverId,cell:raw.cell,ageMs:now-updatedAt,approxKm});
      }
      result.sort((a,b)=>a.approxKm-b.approxKm||a.ageMs-b.ageMs);
      return result.slice(0,limit);
    }
  };
}

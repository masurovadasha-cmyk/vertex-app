import crypto from "node:crypto";
export function createLeaseService({store}){
  return {
    async acquire(rideId,driverId){
      const leaseToken=crypto.randomUUID();
      const fencingToken=Number(await store.nextFencingToken());
      const value=JSON.stringify({rideId,driverId,leaseToken,fencingToken});
      if(!await store.acquireRide(rideId,value)) return {ok:false,error:"ride_already_reserved"};
      if(!await store.acquireDriver(driverId,value)){
        await store.releaseRideIfOwner(rideId,value);
        return {ok:false,error:"driver_already_reserved"};
      }
      return {ok:true,value,leaseToken,fencingToken};
    },
    async verify(offer){
      if(!offer.lease_token||offer.fencing_token==null) return {ok:false,error:"legacy_lease"};
      const expected=JSON.stringify({
        rideId:String(offer.ride_id),driverId:String(offer.driver_id),
        leaseToken:String(offer.lease_token),fencingToken:Number(offer.fencing_token)
      });
      const [rideValue,driverValue]=await Promise.all([store.readRide(offer.ride_id),store.readDriver(offer.driver_id)]);
      return {ok:rideValue===expected&&driverValue===expected,expected};
    },
    async release(rideId,driverId,value){
      await Promise.all([store.releaseRideIfOwner(rideId,value),store.releaseDriverIfOwner(driverId,value)]);
    }
  };
}

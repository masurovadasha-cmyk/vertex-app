export function redisLeaseStore(redis,{ttlMs}){
  const driverKey=id=>`taxi:lease:driver:${id}`;
  const rideKey=id=>`taxi:lease:ride:${id}`;
  async function releaseIfOwner(key,value){
    return redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",{keys:[key],arguments:[value]});
  }
  return {
    async nextFencingToken(){return redis.incr("taxi:lease:fencing:sequence")},
    async acquireRide(rideId,value){return (await redis.set(rideKey(rideId),value,{NX:true,PX:ttlMs}))==="OK"},
    async acquireDriver(driverId,value){return (await redis.set(driverKey(driverId),value,{NX:true,PX:ttlMs}))==="OK"},
    async releaseRideIfOwner(rideId,value){return releaseIfOwner(rideKey(rideId),value)},
    async releaseDriverIfOwner(driverId,value){return releaseIfOwner(driverKey(driverId),value)},
    async readRide(rideId){return redis.get(rideKey(rideId))},
    async readDriver(driverId){return redis.get(driverKey(driverId))}
  };
}

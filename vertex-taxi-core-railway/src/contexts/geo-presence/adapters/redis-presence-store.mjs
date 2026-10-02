export function redisPresenceStore(redis,{ttlSeconds}){
  const locationKey=id=>`taxi:driver:${id}:location`;
  const cellKey=cell=>`taxi:h3:${cell}:drivers`;
  return {
    async upsert(driverId,location,cell){
      const previous=await redis.hGet(locationKey(driverId),"cell");
      const tx=redis.multi();
      if(previous&&previous!==cell) tx.sRem(cellKey(previous),driverId);
      tx.hSet(locationKey(driverId),{
        lat:String(location.lat),lng:String(location.lng),accuracyM:String(location.accuracyM),
        heading:String(location.heading??""),speedMps:String(location.speedMps??""),
        available:String(location.available),serviceClasses:JSON.stringify(location.serviceClasses),
        cell,updatedAt:String(location.updatedAt)
      });
      tx.expire(locationKey(driverId),ttlSeconds);
      tx.sAdd(cellKey(cell),driverId);
      tx.expire(cellKey(cell),ttlSeconds*3);
      await tx.exec();
    },
    async driverIdsInCells(cells){
      const ids=new Set();
      for(const cell of cells) for(const id of await redis.sMembers(cellKey(cell))) ids.add(id);
      return [...ids];
    },
    async get(driverId){return redis.hGetAll(locationKey(driverId))}
  };
}

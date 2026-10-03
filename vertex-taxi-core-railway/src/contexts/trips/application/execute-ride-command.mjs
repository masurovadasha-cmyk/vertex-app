import {resolveRideTransition,TERMINAL_RIDE_STATES} from "../domain/ride-state-machine.mjs";

export function createRideCommandService({db,leases,publishRideEvent}){
  return {
    async execute({rideId,input,demo=false,validateRide=()=>true}){
      const client=await db.connect();
      try{
        await client.query("begin");
        const current=await client.query("select * from taxi_rides where id=$1 for update",[rideId]);
        if(!current.rowCount){
          await client.query("rollback");
          return {ok:false,status:404,error:"ride_not_found"};
        }
        const ride=current.rows[0];
        if(!validateRide(ride)){
          await client.query("rollback");
          return {ok:false,status:403,error:"forbidden"};
        }
        if(input.expectedVersion&&Number(ride.version)!==input.expectedVersion){
          await client.query("rollback");
          return {ok:false,status:409,error:"version_conflict",currentVersion:Number(ride.version)};
        }
        const transition=resolveRideTransition(ride.state,input.command);
        if(!transition.ok){
          await client.query("rollback");
          return {ok:false,status:409,error:transition.error,from:ride.state,command:input.command};
        }
        const updated=await client.query(
          "update taxi_rides set state=$2,version=version+1,updated_at=now() where id=$1 returning *",
          [rideId,transition.to]
        );
        const next=updated.rows[0];
        await client.query(
          `insert into taxi_outbox(event_type,aggregate_id,aggregate_version,payload,correlation_id)
           values($1,$2,$3,$4,$5)`,
          [`taxi.ride.v2.${String(transition.to).toLowerCase()}`,rideId,next.version,
           JSON.stringify({ride_id:rideId,state:transition.to,actor_id:input.actorId??null,demo}),next.correlation_id]
        );
        await client.query(
          `insert into taxi_audit_timeline
           (ride_id,actor_type,actor_id,action,before_json,after_json,reason,correlation_id)
           values($1,$2,$3,$4,$5,$6,$7,$8)`,
          [rideId,input.command.startsWith("DRIVER")?"driver":"user",input.actorId??null,input.command,
           JSON.stringify({state:ride.state,version:ride.version}),
           JSON.stringify({state:next.state,version:next.version}),
           demo?"presentation_demo_command":"ride_command",next.correlation_id]
        );
        await client.query("commit");

        if(TERMINAL_RIDE_STATES.has(next.state)&&next.driver_id){
          const acceptedOffer=await db.query(
            "select * from taxi_offers where ride_id=$1 and driver_id=$2 and state='ACCEPTED' order by updated_at desc limit 1",
            [rideId,next.driver_id]
          );
          if(acceptedOffer.rowCount){
            const ownership=await leases.verify(acceptedOffer.rows[0]);
            if(ownership.expected)await leases.release(rideId,next.driver_id,ownership.expected);
          }
        }
        await publishRideEvent(rideId,{type:"ride.state_changed",rideId,state:next.state,version:next.version,demo});
        return {ok:true,data:next};
      }catch(error){
        try{await client.query("rollback")}catch{}
        throw error;
      }finally{
        client.release();
      }
    }
  };
}

export function createNotificationWorker({db,provider,maxAttempts=5}) {
  if(!db||!provider) throw new Error("notification worker dependencies required");
  return async function processBatch(limit=50){
    const safeLimit=Math.min(100,Math.max(1,Number(limit)||50));
    const client=await db.connect();
    const summary={claimed:0,delivered:0,retried:0,dead:0};
    try{
      await client.query("begin");
      const claimed=await client.query(
        `select * from taxi_notification_outbox
         where state in ('PENDING','RETRY') and next_attempt_at<=now()
         order by created_at asc
         for update skip locked limit $1`,[safeLimit]
      );
      summary.claimed=claimed.rowCount;
      for(const row of claimed.rows){
        await client.query(
          "update taxi_notification_outbox set state='PROCESSING',attempt_count=attempt_count+1 where id=$1",
          [row.id]
        );
        try{
          await provider.deliver(row);
          await client.query(
            "update taxi_notification_outbox set state='DELIVERED',delivered_at=now(),last_error=null where id=$1",
            [row.id]
          );
          summary.delivered++;
        }catch(error){
          const attempts=Number(row.attempt_count)+1;
          if(attempts>=maxAttempts){
            await client.query(
              "update taxi_notification_outbox set state='DEAD',last_error=$2 where id=$1",
              [row.id,String(error).slice(0,500)]
            );
            summary.dead++;
          }else{
            const delaySeconds=Math.min(300,Math.pow(2,attempts)*5);
            await client.query(
              `update taxi_notification_outbox
               set state='RETRY',last_error=$2,next_attempt_at=now()+($3::text||' seconds')::interval
               where id=$1`,
              [row.id,String(error).slice(0,500),delaySeconds]
            );
            summary.retried++;
          }
        }
      }
      await client.query("commit");
      return summary;
    }catch(error){
      try{await client.query("rollback")}catch{}
      throw error;
    }finally{client.release()}
  };
}

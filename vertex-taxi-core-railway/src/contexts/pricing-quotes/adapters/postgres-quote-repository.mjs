export function postgresQuoteRepository(db){
  return {
    async insert(q){
      const result=await db.query(
        `insert into taxi_quotes
          (user_id,pickup_lat,pickup_lng,pickup_label,destination_lat,destination_lng,
           destination_label,service_class,distance_km,fare_minor,currency,pricing_version,expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [q.userId,q.pickup.lat,q.pickup.lng,q.pickup.label,
         q.destination.lat,q.destination.lng,q.destination.label,
         q.serviceClass,q.distanceKm,q.fareMinor,q.currency,q.pricingVersion,q.expiresAt]
      );
      return result.rows[0];
    }
  };
}

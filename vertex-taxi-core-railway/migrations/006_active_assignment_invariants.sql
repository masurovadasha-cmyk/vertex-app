-- Defense in depth: Redis fencing/leases are the fast coordination plane,
-- PostgreSQL remains the durable authority and must reject impossible active assignments.

CREATE UNIQUE INDEX IF NOT EXISTS taxi_rides_one_active_ride_per_driver
ON taxi_rides(driver_id)
WHERE driver_id IS NOT NULL
  AND state IN (
    'DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'RIDER_ONBOARD',
    'IN_PROGRESS'
  );

CREATE UNIQUE INDEX IF NOT EXISTS taxi_offers_one_live_offer_per_ride
ON taxi_offers(ride_id)
WHERE state IN ('OFFERED','ACCEPTED');

CREATE UNIQUE INDEX IF NOT EXISTS taxi_offers_one_live_offer_per_driver
ON taxi_offers(driver_id)
WHERE state IN ('OFFERED','ACCEPTED');

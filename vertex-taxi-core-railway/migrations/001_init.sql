CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS taxi_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  pickup_label text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  destination_label text NOT NULL,
  service_class text NOT NULL,
  distance_km numeric(10,2) NOT NULL,
  fare_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pricing_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taxi_rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  quote_id uuid REFERENCES taxi_quotes(id),
  state text NOT NULL CHECK (state IN (
    'REQUESTED','SEARCHING','DRIVER_OFFERED','DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE','DRIVER_ARRIVED','RIDER_ONBOARD','IN_PROGRESS',
    'COMPLETED','RIDER_CANCELLED','DRIVER_CANCELLED','SYSTEM_CANCELLED',
    'NO_DRIVER','EXPIRED'
  )),
  service_class text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  pickup_label text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  destination_label text NOT NULL,
  fare_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  driver_id text,
  version integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxi_rides_state_idx ON taxi_rides(state, created_at);
CREATE INDEX IF NOT EXISTS taxi_rides_driver_idx ON taxi_rides(driver_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS taxi_dispatch_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES taxi_rides(id) ON DELETE CASCADE,
  candidate_driver_ids jsonb NOT NULL,
  selected_driver_id text,
  outcome text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taxi_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES taxi_rides(id) ON DELETE CASCADE,
  driver_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('OFFERED','ACCEPTED','DECLINED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS taxi_offers_driver_idx ON taxi_offers(driver_id, state, expires_at);

CREATE TABLE IF NOT EXISTS taxi_outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL,
  payload jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS taxi_audit_timeline (
  id bigserial PRIMARY KEY,
  ride_id uuid,
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  reason text,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Marketplace Foundation 0.2 staging migration
-- Additive only. Do not drop or rename existing tables/columns.

DO $$ BEGIN
  CREATE TYPE taxi_presence_status AS ENUM ('OFFLINE','ONLINE','AVAILABLE','RESERVED','ON_TRIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taxi_location_freshness AS ENUM ('FRESH','DEGRADED','STALE','OFFLINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taxi_offer_state AS ENUM ('OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS taxi_driver_presence (
  driver_id uuid PRIMARY KEY,
  status taxi_presence_status NOT NULL DEFAULT 'OFFLINE',
  last_heartbeat_at timestamptz,
  last_location_at timestamptz,
  location_freshness taxi_location_freshness NOT NULL DEFAULT 'OFFLINE',
  h3_cell text,
  latitude double precision,
  longitude double precision,
  heading double precision,
  speed_mps double precision,
  accuracy_m double precision,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxi_driver_presence_status_idx
  ON taxi_driver_presence(status, location_freshness);
CREATE INDEX IF NOT EXISTS taxi_driver_presence_h3_idx
  ON taxi_driver_presence(h3_cell, status);

CREATE TABLE IF NOT EXISTS taxi_quotes (
  id uuid PRIMARY KEY,
  rider_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  pickup_label text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  destination_label text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  service_class_id text NOT NULL,
  base_fare_minor integer NOT NULL DEFAULT 0,
  distance_fare_minor integer NOT NULL DEFAULT 0,
  time_fare_minor integer NOT NULL DEFAULT 0,
  surge_minor integer NOT NULL DEFAULT 0,
  fees_minor integer NOT NULL DEFAULT 0,
  discount_minor integer NOT NULL DEFAULT 0,
  total_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pricing_version text NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxi_quotes_rider_created_idx
  ON taxi_quotes(rider_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS taxi_driver_offers (
  id uuid PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES taxi_rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  lease_token uuid NOT NULL UNIQUE,
  state taxi_offer_state NOT NULL DEFAULT 'OFFERED',
  expires_at timestamptz NOT NULL,
  offered_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS taxi_driver_offers_one_active_driver_idx
  ON taxi_driver_offers(driver_id)
  WHERE state='OFFERED';
CREATE UNIQUE INDEX IF NOT EXISTS taxi_driver_offers_one_accepted_ride_idx
  ON taxi_driver_offers(ride_id)
  WHERE state='ACCEPTED';

CREATE TABLE IF NOT EXISTS taxi_dispatch_attempts (
  id uuid PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES taxi_rides(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  selected_driver_id uuid,
  outcome text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  trace_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(ride_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS taxi_progress_snapshots (
  id bigserial PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES taxi_rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  driver_lat double precision,
  driver_lng double precision,
  eta_seconds integer,
  distance_meters integer,
  state text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxi_progress_ride_time_idx
  ON taxi_progress_snapshots(ride_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS taxi_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percent integer NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users(id) ON DELETE SET NULL
);

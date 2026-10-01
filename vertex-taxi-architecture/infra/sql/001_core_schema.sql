CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS taxi_identity;
CREATE SCHEMA IF NOT EXISTS taxi_market;
CREATE SCHEMA IF NOT EXISTS taxi_rider;
CREATE SCHEMA IF NOT EXISTS taxi_fleet;
CREATE SCHEMA IF NOT EXISTS taxi_driver;
CREATE SCHEMA IF NOT EXISTS taxi_geo;
CREATE SCHEMA IF NOT EXISTS taxi_ride;
CREATE SCHEMA IF NOT EXISTS taxi_payment;
CREATE SCHEMA IF NOT EXISTS taxi_ledger;
CREATE SCHEMA IF NOT EXISTS taxi_safety;
CREATE SCHEMA IF NOT EXISTS taxi_audit;
CREATE SCHEMA IF NOT EXISTS taxi_integration;

CREATE TABLE taxi_market.markets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  currency text NOT NULL,
  timezone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);

CREATE TABLE taxi_driver.drivers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('OFFLINE','AVAILABLE','OFFERED','RESERVED','EN_ROUTE','ARRIVED','WAITING','ON_TRIP','SUSPENDED')),
  score numeric(8,4) NOT NULL DEFAULT 0,
  rating numeric(4,2),
  location geography(Point,4326),
  location_updated_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivers_location_gix ON taxi_driver.drivers USING gist(location);

CREATE TABLE taxi_fleet.vehicles (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  driver_id uuid,
  service_class_id text NOT NULL,
  plate text NOT NULL,
  status text NOT NULL CHECK (status IN ('AVAILABLE','IN_TRIP','MAINTENANCE','SUSPENDED')),
  UNIQUE (tenant_id, plate)
);

CREATE TABLE taxi_ride.quotes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  market_id uuid NOT NULL,
  service_class_id text NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency text NOT NULL,
  pricing_version text NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE taxi_ride.rides (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  passenger_id uuid NOT NULL,
  quote_id uuid,
  service_class_id text NOT NULL,
  payment_method text NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  driver_id uuid,
  vehicle_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rides_search_idx ON taxi_ride.rides(tenant_id, organization_id, status, created_at);

CREATE TABLE taxi_ride.offers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  ride_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  pickup_eta_seconds integer NOT NULL,
  ranking_score numeric(12,6) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_driver_offer ON taxi_ride.offers(driver_id) WHERE status='OFFERED';
CREATE UNIQUE INDEX one_active_ride_offer ON taxi_ride.offers(ride_id) WHERE status='ACCEPTED';

CREATE TABLE taxi_ledger.accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  currency text NOT NULL,
  UNIQUE (tenant_id, code, currency)
);
CREATE TABLE taxi_ledger.transactions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  ride_id uuid,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE taxi_ledger.entries (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES taxi_ledger.transactions(id),
  account_id uuid NOT NULL REFERENCES taxi_ledger.accounts(id),
  debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  CHECK ((debit_minor = 0) <> (credit_minor = 0))
);

CREATE TABLE taxi_integration.idempotency (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, actor_id, key)
);

CREATE TABLE taxi_integration.outbox (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON taxi_integration.outbox(created_at) WHERE published_at IS NULL;

CREATE TABLE taxi_audit.audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  before_state jsonb,
  after_state jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

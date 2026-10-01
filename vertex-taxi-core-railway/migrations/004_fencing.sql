ALTER TABLE taxi_offers
  ADD COLUMN IF NOT EXISTS lease_token text,
  ADD COLUMN IF NOT EXISTS fencing_token bigint;

CREATE INDEX IF NOT EXISTS taxi_offers_fencing_idx
  ON taxi_offers(driver_id, fencing_token DESC);

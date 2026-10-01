CREATE TABLE IF NOT EXISTS taxi_demo_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES taxi_rides(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'demo_card',
  last4 text NOT NULL DEFAULT '4242',
  status text NOT NULL CHECK (status IN ('PAID','VOID')) DEFAULT 'PAID',
  subtotal_minor integer NOT NULL,
  waiting_minor integer NOT NULL DEFAULT 0,
  service_fee_minor integer NOT NULL DEFAULT 0,
  total_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taxi_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES taxi_rides(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  driver_id text,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxi_ratings_driver_idx ON taxi_ratings(driver_id, created_at DESC);

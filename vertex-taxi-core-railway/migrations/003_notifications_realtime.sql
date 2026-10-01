CREATE TABLE IF NOT EXISTS taxi_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android','ios','web')),
  provider text NOT NULL CHECK (provider IN ('fcm','apns','webpush','demo')),
  token_hash text NOT NULL,
  token_ciphertext text,
  device_id text NOT NULL,
  app_version text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, token_hash)
);
CREATE INDEX IF NOT EXISTS taxi_devices_user_idx ON taxi_devices(user_id, enabled, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS taxi_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('push','realtime')),
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','PROCESSING','DELIVERED','RETRY','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(event_id,user_id,channel)
);
CREATE INDEX IF NOT EXISTS taxi_notification_pending_idx
  ON taxi_notification_outbox(state,next_attempt_at,created_at);

CREATE TABLE IF NOT EXISTS taxi_realtime_sequence (
  stream_key text PRIMARY KEY,
  last_sequence bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

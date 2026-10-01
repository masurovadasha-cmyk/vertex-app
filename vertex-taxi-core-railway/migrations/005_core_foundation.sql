CREATE TABLE IF NOT EXISTS taxi_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taxi_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES taxi_organizations(id),
  code text NOT NULL,
  country_code char(2) NOT NULL,
  city text NOT NULL,
  timezone text NOT NULL,
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code)
);

CREATE TABLE IF NOT EXISTS taxi_idempotency (
  organization_id uuid NOT NULL REFERENCES taxi_organizations(id),
  actor_id text NOT NULL,
  command_name text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  response_status integer,
  response_body jsonb,
  aggregate_id text,
  state text NOT NULL DEFAULT 'PROCESSING' CHECK (state IN ('PROCESSING','COMPLETED','FAILED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY(organization_id,actor_id,command_name,idempotency_key)
);
CREATE INDEX IF NOT EXISTS taxi_idempotency_expiry_idx ON taxi_idempotency(expires_at);

CREATE TABLE IF NOT EXISTS taxi_inbox (
  consumer_name text NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(consumer_name,event_id)
);

CREATE TABLE IF NOT EXISTS taxi_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES taxi_organizations(id),
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  currency char(3) NOT NULL,
  account_type text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FROZEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,owner_type,owner_id,currency,account_type)
);

CREATE TABLE IF NOT EXISTS taxi_ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES taxi_organizations(id),
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  idempotency_key text NOT NULL,
  currency char(3) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS taxi_ledger_entries (
  id bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES taxi_ledger_transactions(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES taxi_ledger_accounts(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS taxi_ledger_entries_tx_idx ON taxi_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS taxi_ledger_entries_account_idx ON taxi_ledger_entries(account_id,created_at);

CREATE OR REPLACE FUNCTION taxi_assert_balanced_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  debits bigint;
  credits bigint;
BEGIN
  SELECT COALESCE(SUM(amount_minor) FILTER (WHERE direction='DEBIT'),0),
         COALESCE(SUM(amount_minor) FILTER (WHERE direction='CREDIT'),0)
    INTO debits,credits
    FROM taxi_ledger_entries
   WHERE transaction_id=COALESCE(NEW.transaction_id,OLD.transaction_id);
  IF debits<>credits THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced: debit %, credit %',
      COALESCE(NEW.transaction_id,OLD.transaction_id),debits,credits;
  END IF;
  RETURN NULL;
END $$;

-- Balance is checked explicitly by the application before commit.
-- A deferred constraint trigger will be enabled once ledger writes become active.


CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'renter'
    CHECK (role IN ('renter','landlord','caretaker','manager','agent','admin')),
  verified_identity BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  county TEXT NOT NULL DEFAULT 'Nairobi',
  property_type TEXT NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms INTEGER NOT NULL DEFAULT 1,
  rent INTEGER NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  service_charge INTEGER NOT NULL DEFAULT 0,
  viewing_fee INTEGER NOT NULL DEFAULT 0,
  units_available INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  water TEXT,
  internet TEXT,
  security TEXT,
  parking BOOLEAN NOT NULL DEFAULT FALSE,
  floor TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','occupied','paused')),
  verification_score INTEGER,
  verified_at TIMESTAMPTZ,
  availability_confirmed_at TIMESTAMPTZ,
  availability_expires_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  uploader_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  renter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  meeting_note TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','completed','cancelled')),
  safety_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_area ON listings(area);
CREATE INDEX IF NOT EXISTS idx_listings_rent ON listings(rent);
CREATE INDEX IF NOT EXISTS idx_media_listing ON media(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_listing ON bookings(listing_id);


-- KejaScan short-stay / furnished-stay extension.
-- These statements are safe on existing PostgreSQL deployments.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('renter','landlord','caretaker','manager','agent','host','admin'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_mode TEXT NOT NULL DEFAULT 'long_term';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS nightly_rate INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS weekly_rate INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS monthly_rate INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS cleaning_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS security_deposit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS minimum_nights INTEGER NOT NULL DEFAULT 1;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS maximum_guests INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS check_in_time TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS check_out_time TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS furnished BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS self_check_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS kitchen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS workspace BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS pool BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gym BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listings_listing_mode_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_listing_mode_check
      CHECK (listing_mode IN ('long_term','short_stay','furnished_monthly'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_mode ON listings(listing_mode);

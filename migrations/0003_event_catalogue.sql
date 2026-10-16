-- Canonical event catalogue. The Google Sheet is a one-time legacy import and
-- remains untouched after migration.
CREATE TABLE IF NOT EXISTS catalogue_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  artists TEXT NOT NULL DEFAULT '',
  primary_genre TEXT NOT NULL DEFAULT '',
  subgenres TEXT NOT NULL DEFAULT '',
  event_format TEXT NOT NULL DEFAULT '',
  tribute_to TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_datetime TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  organizer TEXT NOT NULL DEFAULT '',
  price_min_inr REAL,
  price_max_inr REAL,
  admission_type TEXT NOT NULL DEFAULT '',
  ticket_status TEXT NOT NULL DEFAULT '',
  event_status TEXT NOT NULL DEFAULT 'upcoming',
  booking_url TEXT NOT NULL DEFAULT '',
  source_urls TEXT NOT NULL DEFAULT '',
  source_event_ids TEXT NOT NULL DEFAULT '',
  relevance_tier TEXT NOT NULL DEFAULT '',
  verification TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  first_seen_run_id TEXT NOT NULL DEFAULT '',
  last_verified_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  event_category TEXT NOT NULL DEFAULT 'music',
  uncertainty_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalogue_events_date ON catalogue_events(start_date, start_time);
CREATE INDEX IF NOT EXISTS idx_catalogue_events_status ON catalogue_events(event_status);
CREATE INDEX IF NOT EXISTS idx_catalogue_events_category ON catalogue_events(event_category);

CREATE TABLE IF NOT EXISTS catalogue_images (
  event_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  source_page_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  image_type TEXT NOT NULL DEFAULT 'poster',
  image_order INTEGER NOT NULL DEFAULT 1,
  verified_at_utc TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(event_id, image_url),
  FOREIGN KEY(event_id) REFERENCES catalogue_events(event_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_catalogue_images_event ON catalogue_images(event_id, image_order);

CREATE TABLE IF NOT EXISTS ingestion_sources (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'public_page',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'never_checked',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  expected_sources INTEGER NOT NULL DEFAULT 0,
  completed_sources INTEGER NOT NULL DEFAULT 0,
  candidates_found INTEGER NOT NULL DEFAULT 0,
  candidates_reviewed INTEGER NOT NULL DEFAULT 0,
  events_published INTEGER NOT NULL DEFAULT 0,
  changes_recorded INTEGER NOT NULL DEFAULT 0,
  images_audited INTEGER NOT NULL DEFAULT 0,
  images_added INTEGER NOT NULL DEFAULT 0,
  images_missing INTEGER NOT NULL DEFAULT 0,
  source_failures INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  digest TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ingestion_fetches (
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  content_hash TEXT NOT NULL DEFAULT '',
  snapshot_key TEXT NOT NULL DEFAULT '',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(run_id, source_id)
);

CREATE TABLE IF NOT EXISTS ingestion_candidates (
  candidate_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_batch_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidates_run ON ingestion_candidates(run_id, status);

CREATE TABLE IF NOT EXISTS review_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS catalogue_changes (
  change_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_catalogue_changes_event ON catalogue_changes(event_id, changed_at);

CREATE TABLE IF NOT EXISTS ingestion_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ingestion_config(key,value,updated_at) VALUES
  ('latest_run_id','',datetime('now')),
  ('timezone','Asia/Kolkata',datetime('now')),
  ('pipeline_version','1',datetime('now'));

INSERT OR IGNORE INTO ingestion_sources(source_id,name,source_url,source_type,created_at,updated_at) VALUES
  ('bookmyshow','BookMyShow','https://in.bookmyshow.com/explore/events-bengaluru','public_page',datetime('now'),datetime('now')),
  ('district','District','https://www.district.in/events/bengaluru','public_page',datetime('now'),datetime('now')),
  ('skillbox','SkillBox','https://skillbox.co/events/bangalore','public_page',datetime('now'),datetime('now')),
  ('sortmyscene','Sort My Scene','https://www.sortmyscene.com/bangalore','public_page',datetime('now'),datetime('now')),
  ('urbanaut','Urbanaut','https://urbanaut.app/bangalore/events','public_page',datetime('now'),datetime('now')),
  ('bandsintown','Bandsintown','https://www.bandsintown.com/c/bangalore-india','public_page',datetime('now'),datetime('now')),
  ('songkick','Songkick','https://www.songkick.com/metro-areas/9562-india-bangalore','public_page',datetime('now'),datetime('now')),
  ('allevents','AllEvents','https://allevents.in/bangalore','public_page',datetime('now'),datetime('now')),
  ('highape','HighApe','https://highape.com/bangalore/events','public_page',datetime('now'),datetime('now')),
  ('bic','Bangalore International Centre','https://bangaloreinternationalcentre.org/events/','official_venue',datetime('now'),datetime('now')),
  ('sabhablr','Sabha BLR','https://sabhablr.in/events','official_venue',datetime('now'),datetime('now')),
  ('bhoomija','Bhoomija','https://www.bhoomija.org/events','official_organizer',datetime('now'),datetime('now')),
  ('chowdiahall','Chowdiah Memorial Hall','https://chowdiahall.gov.in/events','official_venue',datetime('now'),datetime('now')),
  ('jagriti','Jagriti Theatre','https://jagrititheatre.com/events','official_venue',datetime('now'),datetime('now')),
  ('windmills','Windmills Craftworks','https://windmills-india.com/events/','official_venue',datetime('now'),datetime('now')),
  ('spicmacay','SPIC MACAY','https://spicmacay.org/events','official_organizer',datetime('now'),datetime('now')),
  ('gayana','Bangalore Gayana Samaja','https://www.gayanasamaja.org/events','official_venue',datetime('now'),datetime('now')),
  ('indiranagar_sabha','Indiranagar Sangeetha Sabha','https://www.issblr.org/events','official_venue',datetime('now'),datetime('now')),
  ('nadasurabhi','Nadasurabhi','https://nadasurabhi.org/events','official_organizer',datetime('now'),datetime('now'));

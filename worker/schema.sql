CREATE TABLE IF NOT EXISTS hits (
  id       INTEGER PRIMARY KEY,
  ts       INTEGER NOT NULL,
  country  TEXT,
  city     TEXT,
  lat      REAL,
  lon      REAL,
  ip       TEXT,
  region   TEXT,
  browser  TEXT,
  os       TEXT,
  referrer TEXT
);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits(ts);

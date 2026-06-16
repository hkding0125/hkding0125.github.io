CREATE TABLE IF NOT EXISTS hits (
  id      INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,
  country TEXT,
  city    TEXT,
  lat     REAL,
  lon     REAL
);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits(ts);

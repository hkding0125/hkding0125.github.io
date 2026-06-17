-- Migration: add visitor-detail columns to the existing live `hits` table.
-- The live table is (id, ts, country, city, lat, lon); SQLite adds nullable
-- columns in place and back-fills existing rows with NULL.
ALTER TABLE hits ADD COLUMN ip TEXT;
ALTER TABLE hits ADD COLUMN region TEXT;
ALTER TABLE hits ADD COLUMN browser TEXT;
ALTER TABLE hits ADD COLUMN os TEXT;
ALTER TABLE hits ADD COLUMN referrer TEXT;

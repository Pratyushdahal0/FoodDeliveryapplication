-- FoodExpress Rider Location Tracking
-- Run once against the application database.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_lat  DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_lng  DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_updated_at DATETIME DEFAULT NULL;

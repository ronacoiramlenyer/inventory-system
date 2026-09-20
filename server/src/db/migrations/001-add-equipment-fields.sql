-- Add serial_number and location columns to items table for Equipment category items
-- This migration adds support for equipment-specific metadata

ALTER TABLE items ADD COLUMN serial_number TEXT;
ALTER TABLE items ADD COLUMN location TEXT;

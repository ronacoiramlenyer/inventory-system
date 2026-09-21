-- Add equipment_instance_id column to equipment_logs
-- This migration adds the new foreign key while keeping backward compatibility

ALTER TABLE equipment_logs ADD COLUMN equipment_instance_id INTEGER REFERENCES equipment_instances(id) ON DELETE CASCADE;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_equipment_logs_instance ON equipment_logs(equipment_instance_id);

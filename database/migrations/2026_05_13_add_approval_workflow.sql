-- FoodExpress Approval Workflow Enhancement
-- Adds approval tracking fields for users and restaurants
-- Run once against the application database.

-- Add approval fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status ENUM('pending', 'approved', 'rejected', 'suspended') DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_at DATETIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by_admin_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approval_updated_at DATETIME DEFAULT NULL,
  ADD INDEX idx_approval_status (approval_status),
  ADD INDEX idx_approved_by_admin (approved_by_admin_id);

-- Add approval fields to restaurants table (if exists)
-- First check if restaurants table exists
SET @table_exists = (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
    AND table_name = 'restaurants'
);

-- If restaurants table exists, add approval fields
SET @sql = IF(@table_exists > 0,
    'ALTER TABLE restaurants
      ADD COLUMN IF NOT EXISTS approval_status ENUM(\'pending\', \'approved\', \'rejected\', \'suspended\') DEFAULT \'pending\',
      ADD COLUMN IF NOT EXISTS approved_at DATETIME DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS approved_by_admin_id INT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS approval_updated_at DATETIME DEFAULT NULL,
      ADD INDEX idx_restaurant_approval_status (approval_status),
      ADD INDEX idx_restaurant_approved_by_admin (approved_by_admin_id);',
    'SELECT "Restaurants table does not exist - skipping restaurant approval fields" as message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create approval_audit_log table for tracking all approval actions
CREATE TABLE IF NOT EXISTS approval_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('user', 'restaurant') NOT NULL,
    entity_id INT NOT NULL,
    action ENUM('submitted', 'approved', 'rejected', 'suspended', 'unsuspended') NOT NULL,
    admin_id INT DEFAULT NULL,
    previous_status VARCHAR(50) DEFAULT NULL,
    new_status VARCHAR(50) NOT NULL,
    reason TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_admin (admin_id),
    INDEX idx_created_at (created_at)
);
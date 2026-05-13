-- FoodExpress - Coupon / Promo Code System
-- ---------------------------------------
-- IMPORTANT:
-- Run this migration BEFORE enabling server-side promo code validation logic.
--
-- Notes:
-- - This creates a "real" coupons table + redemption tracking for usage limits.
-- - Your existing frontend "reward coupon" flow (localStorage-based rewards) is separate.
--   Do NOT remove or break that reward flow; promo code validation should be additive.
--
-- Database: food_deliveryapp

-- ------------------------------------------------
-- 1) coupons table
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL,
  `discount_type` ENUM('percent','fixed') NOT NULL,
  `discount_value` DECIMAL(10,2) NOT NULL,
  `min_order_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `max_discount_amount` DECIMAL(10,2) NULL DEFAULT NULL,
  `expires_at` DATETIME NULL DEFAULT NULL,
  `usage_limit` INT NULL DEFAULT NULL,
  `per_user_limit` INT NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_coupons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------
-- 2) coupon_redemptions table
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupon_redemptions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `coupon_id` INT NOT NULL,
  `order_id` INT NOT NULL,
  `user_id` INT NULL DEFAULT NULL,
  `customer_email` VARCHAR(255) NULL DEFAULT NULL,
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY `idx_coupon_redemptions_coupon_id` (`coupon_id`),
  KEY `idx_coupon_redemptions_user_id` (`user_id`),
  KEY `idx_coupon_redemptions_customer_email` (`customer_email`),
  UNIQUE KEY `uq_coupon_redemptions_coupon_order` (`coupon_id`, `order_id`),

  CONSTRAINT `fk_coupon_redemptions_coupon_id`
    FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------
-- Seed coupons (safe / idempotent)
-- ------------------------------------------------
INSERT INTO `coupons`
  (`code`, `discount_type`, `discount_value`, `min_order_amount`, `max_discount_amount`, `is_active`)
VALUES
  ('WELCOME10', 'percent', 10.00, 300.00, 100.00, 1),
  ('FOOD50',    'fixed',   50.00, 250.00, NULL,   1),
  ('FEAST15',   'percent', 15.00, 800.00, 200.00, 1)
ON DUPLICATE KEY UPDATE
  `discount_type` = VALUES(`discount_type`),
  `discount_value` = VALUES(`discount_value`),
  `min_order_amount` = VALUES(`min_order_amount`),
  `max_discount_amount` = VALUES(`max_discount_amount`),
  `is_active` = VALUES(`is_active`),
  `updated_at` = CURRENT_TIMESTAMP;


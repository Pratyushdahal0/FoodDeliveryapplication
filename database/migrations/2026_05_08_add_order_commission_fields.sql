-- FoodExpress - Orders commission + coupon fields
-- ------------------------------------------------
-- IMPORTANT:
-- Run this migration BEFORE deploying/running the updated backend PHP that
-- writes commission/coupon fields on order creation.
--
-- This migration is designed to be:
-- - Backward compatible (does not rename/remove any existing columns)
-- - Safe for existing rows (adds nullable/defaulted columns, then backfills)
--
-- Database: food_deliveryapp
-- Table:    orders

-- ------------------------------------------------
-- 1) Schema changes (orders table only)
-- ------------------------------------------------
ALTER TABLE `orders`
  ADD COLUMN `coupon_id` INT NULL,
  ADD COLUMN `coupon_code` VARCHAR(50) NULL,
  ADD COLUMN `coupon_discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `commission_rate` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN `commission_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `restaurant_earnings` DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- ------------------------------------------------
-- 2) Backfill existing orders
-- ------------------------------------------------
-- Notes:
-- - coupon_discount is assumed to already be populated (or default 0.00).
-- - commission is calculated on restaurant food revenue only:
--     commission_base = max(subtotal - coupon_discount, 0)
--     commission_amount = round(commission_base * 0.10, 2)
--     restaurant_earnings = round(commission_base - (commission_base * 0.10), 2)
UPDATE `orders`
SET
  `commission_rate` = 10.00,
  `commission_amount` = ROUND(GREATEST(`subtotal` - `coupon_discount`, 0) * 0.10, 2),
  `restaurant_earnings` = ROUND(
    GREATEST(`subtotal` - `coupon_discount`, 0) - (GREATEST(`subtotal` - `coupon_discount`, 0) * 0.10),
    2
  );


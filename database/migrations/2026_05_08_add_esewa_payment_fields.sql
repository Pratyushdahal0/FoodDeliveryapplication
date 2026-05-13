-- FoodExpress - eSewa Sandbox Payment Fields
-- Run before enabling eSewa sandbox checkout.

ALTER TABLE `orders`
  ADD COLUMN `payment_status` VARCHAR(30) NOT NULL DEFAULT 'pending' AFTER `payment_method`,
  ADD COLUMN `payment_gateway` VARCHAR(30) NULL DEFAULT NULL AFTER `payment_status`,
  ADD COLUMN `payment_transaction_uuid` VARCHAR(100) NULL DEFAULT NULL AFTER `payment_gateway`,
  ADD COLUMN `payment_reference_id` VARCHAR(100) NULL DEFAULT NULL AFTER `payment_transaction_uuid`,
  ADD COLUMN `paid_at` DATETIME NULL DEFAULT NULL AFTER `payment_reference_id`;
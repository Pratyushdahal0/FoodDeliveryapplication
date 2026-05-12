-- FoodExpress Chat System
-- Run once against the application database.

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  sender_role ENUM('customer','rider','owner','system') NOT NULL,
  sender_id   INT,
  sender_email VARCHAR(255),
  sender_name  VARCHAR(100),
  message     TEXT NOT NULL,
  is_read     TINYINT(1) DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_id  (order_id),
  INDEX idx_created_at (created_at)
);

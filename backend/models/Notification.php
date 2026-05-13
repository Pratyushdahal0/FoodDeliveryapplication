<?php

class Notification {
    private $conn;
    private $table = "notifications";

    public function __construct($db) {
        $this->conn = $db;
    }

    public function create($data) {
        $userId = $data["user_id"] ?? null;
        $userEmail = trim($data["user_email"] ?? "");
        $role = trim($data["role"] ?? "customer");
        $orderId = $data["order_id"] ?? null;
        $orderNumber = $data["order_number"] ?? null;
        $type = trim($data["type"] ?? "");
        $title = trim($data["title"] ?? "");
        $message = trim($data["message"] ?? "");

        if (!$role || !$type || !$title || !$message) {
            return false;
        }

        /*
          Important production fix:
          Previously, if the same notification existed, we returned true and kept
          the old message. That means old wrong text like "Spicy Grill Owner..."
          could stay forever.

          Now, if the same order + role + type exists, we update the title/message
          and make it unread again so the corrected notification appears.
        */
        if ($orderId && $this->exists($orderId, $role, $type)) {
            return $this->updateExisting(
                $orderId,
                $role,
                $type,
                $title,
                $message,
                $orderNumber,
                $userEmail,
                $userId
            );
        }

        $query = "INSERT INTO {$this->table}
            (user_id, user_email, role, order_id, order_number, type, title, message, is_read)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param(
            "ississss",
            $userId,
            $userEmail,
            $role,
            $orderId,
            $orderNumber,
            $type,
            $title,
            $message
        );

        $success = $stmt->execute();
        $stmt->close();

        return $success;
    }

    public function exists($orderId, $role, $type) {
        $query = "SELECT id FROM {$this->table}
                  WHERE order_id = ?
                  AND role = ?
                  AND type = ?
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param("iss", $orderId, $role, $type);
        $stmt->execute();

        $result = $stmt->get_result();
        $exists = $result && $result->num_rows > 0;

        $stmt->close();

        return $exists;
    }

    public function updateExisting($orderId, $role, $type, $title, $message, $orderNumber = null, $userEmail = "", $userId = null) {
        $query = "UPDATE {$this->table}
                  SET
                    user_id = COALESCE(?, user_id),
                    user_email = CASE WHEN ? != '' THEN ? ELSE user_email END,
                    order_number = COALESCE(?, order_number),
                    title = ?,
                    message = ?,
                    is_read = 0,
                    created_at = NOW()
                  WHERE order_id = ?
                  AND role = ?
                  AND type = ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param(
            "isssssiss",
            $userId,
            $userEmail,
            $userEmail,
            $orderNumber,
            $title,
            $message,
            $orderId,
            $role,
            $type
        );

        $success = $stmt->execute();
        $stmt->close();

        return $success;
    }

    public function getForUser($email, $role = "customer", $limit = 30) {
        $email = trim($email);
        $role = trim($role);

        $query = "SELECT *
                  FROM {$this->table}
                  WHERE user_email = ?
                  AND role = ?
                  ORDER BY created_at DESC
                  LIMIT ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return [];
        }

        $stmt->bind_param("ssi", $email, $role, $limit);
        $stmt->execute();

        $result = $stmt->get_result();

        $notifications = [];

        while ($row = $result->fetch_assoc()) {
            $notifications[] = $row;
        }

        $stmt->close();

        return $notifications;
    }

    public function getUnreadCount($email, $role = "customer") {
        $query = "SELECT COUNT(*) AS total
                  FROM {$this->table}
                  WHERE user_email = ?
                  AND role = ?
                  AND is_read = 0";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return 0;
        }

        $stmt->bind_param("ss", $email, $role);
        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        return intval($row["total"] ?? 0);
    }

    public function markAllRead($email, $role = "customer") {
        $query = "UPDATE {$this->table}
                  SET is_read = 1
                  WHERE user_email = ?
                  AND role = ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param("ss", $email, $role);
        $success = $stmt->execute();

        $stmt->close();

        return $success;
    }

    public function markOneRead($id) {
        $query = "UPDATE {$this->table}
                  SET is_read = 1
                  WHERE id = ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param("i", $id);
        $success = $stmt->execute();

        $stmt->close();

        return $success;
    }
}
?>
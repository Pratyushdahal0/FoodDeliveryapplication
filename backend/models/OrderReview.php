<?php

class OrderReview {
    private $conn;
    private $table = "order_reviews";

    public function __construct($db) {
        $this->conn = $db;
    }

    public function create($data) {
        $orderId = isset($data["order_id"]) && $data["order_id"] !== "" ? intval($data["order_id"]) : null;
        $orderNumber = trim($data["order_number"] ?? "");
        $customerEmail = trim($data["customer_email"] ?? "");
        $restaurantId = isset($data["restaurant_id"]) && $data["restaurant_id"] !== "" ? intval($data["restaurant_id"]) : null;
        $riderId = isset($data["rider_id"]) && $data["rider_id"] !== "" ? intval($data["rider_id"]) : null;
        $foodRating = intval($data["food_rating"] ?? 0);
        $riderRating = intval($data["rider_rating"] ?? 0);
        $reviewNote = trim($data["review_note"] ?? "");

        if (!$orderNumber || $foodRating < 1 || $foodRating > 5 || $riderRating < 1 || $riderRating > 5) {
            return [
                "success" => false,
                "message" => "Invalid review data"
            ];
        }

        if ($this->exists($orderNumber, $customerEmail)) {
            return [
                "success" => true,
                "message" => "Review already submitted",
                "already_exists" => true
            ];
        }

        $query = "INSERT INTO {$this->table}
            (order_id, order_number, customer_email, restaurant_id, rider_id, food_rating, rider_rating, review_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return [
                "success" => false,
                "message" => "Prepare failed",
                "error" => $this->conn->error
            ];
        }

        $stmt->bind_param(
            "issiiiis",
            $orderId,
            $orderNumber,
            $customerEmail,
            $restaurantId,
            $riderId,
            $foodRating,
            $riderRating,
            $reviewNote
        );

        $success = $stmt->execute();
        $insertId = $stmt->insert_id;

        $stmt->close();

        return [
            "success" => $success,
            "message" => $success ? "Review saved" : "Could not save review",
            "id" => $insertId
        ];
    }

    public function exists($orderNumber, $customerEmail = "") {
        if ($customerEmail) {
            $query = "SELECT id FROM {$this->table}
                      WHERE order_number = ?
                      AND customer_email = ?
                      LIMIT 1";

            $stmt = $this->conn->prepare($query);
            if (!$stmt) return false;

            $stmt->bind_param("ss", $orderNumber, $customerEmail);
        } else {
            $query = "SELECT id FROM {$this->table}
                      WHERE order_number = ?
                      LIMIT 1";

            $stmt = $this->conn->prepare($query);
            if (!$stmt) return false;

            $stmt->bind_param("s", $orderNumber);
        }

        $stmt->execute();
        $result = $stmt->get_result();
        $exists = $result && $result->num_rows > 0;

        $stmt->close();

        return $exists;
    }

    public function getByOrderNumber($orderNumber) {
        $query = "SELECT *
                  FROM {$this->table}
                  WHERE order_number = ?
                  ORDER BY created_at DESC
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return null;

        $stmt->bind_param("s", $orderNumber);
        $stmt->execute();

        $result = $stmt->get_result();
        $review = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        return $review;
    }

    public function getForRestaurant($restaurantId, $limit = 20) {
        $query = "SELECT *
                  FROM {$this->table}
                  WHERE restaurant_id = ?
                  ORDER BY created_at DESC
                  LIMIT ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("ii", $restaurantId, $limit);
        $stmt->execute();

        $result = $stmt->get_result();
        $reviews = [];

        while ($row = $result->fetch_assoc()) {
            $reviews[] = $row;
        }

        $stmt->close();

        return $reviews;
    }

    public function getForRider($riderId, $limit = 20) {
        $query = "SELECT *
                  FROM {$this->table}
                  WHERE rider_id = ?
                  ORDER BY created_at DESC
                  LIMIT ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("ii", $riderId, $limit);
        $stmt->execute();

        $result = $stmt->get_result();
        $reviews = [];

        while ($row = $result->fetch_assoc()) {
            $reviews[] = $row;
        }

        $stmt->close();

        return $reviews;
    }
}
?>
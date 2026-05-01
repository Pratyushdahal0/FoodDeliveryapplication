<?php

class Order {
    private $conn;
    private $table = 'orders';
    private $items_table = 'order_items';

    public function __construct($db) {
        $this->conn = $db;
    }

    // Create a new order
    public function create($data) {
        try {
            $order_number = 'ORD' . date('Ymd') . strtoupper(substr(uniqid(), -4));

            $user_id = isset($data['user_id']) && $data['user_id'] !== ''
                ? intval($data['user_id'])
                : null;

            $restaurant_id = isset($data['restaurant_id'])
                ? intval($data['restaurant_id'])
                : 0;

            // Restaurant/kitchen status
            $status = isset($data['status']) && $data['status'] !== ''
                ? $data['status']
                : 'pending';

            // Rider/delivery status starts immediately after customer places order
            $delivery_status = isset($data['delivery_status']) && $data['delivery_status'] !== ''
                ? $data['delivery_status']
                : 'searching';

            $notes = isset($data['notes']) ? $data['notes'] : null;
            $subtotal = isset($data['subtotal']) ? floatval($data['subtotal']) : 0;
            $tax = isset($data['tax']) ? floatval($data['tax']) : 0;
            $delivery_fee = isset($data['delivery_fee']) ? floatval($data['delivery_fee']) : 5.00;
            $total = isset($data['total']) ? floatval($data['total']) : 0;

            $customer_email = isset($data['customer_email']) ? trim($data['customer_email']) : null;

            $query = "INSERT INTO " . $this->table . "
                      (
                        order_number,
                        user_id,
                        restaurant_id,
                        customer_name,
                        customer_email,
                        phone_number,
                        address,
                        city,
                        postal_code,
                        payment_method,
                        subtotal,
                        tax,
                        delivery_fee,
                        total,
                        status,
                        delivery_status,
                        notes
                      )
                      VALUES
                      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $stmt = $this->conn->prepare($query);

            if (!$stmt) {
                return [
                    'success' => false,
                    'message' => 'Database prepare error: ' . $this->conn->error
                ];
            }

            $stmt->bind_param(
                "siisssssssddddsss",
                $order_number,
                $user_id,
                $restaurant_id,
                $data['customer_name'],
                $customer_email,
                $data['phone_number'],
                $data['address'],
                $data['city'],
                $data['postal_code'],
                $data['payment_method'],
                $subtotal,
                $tax,
                $delivery_fee,
                $total,
                $status,
                $delivery_status,
                $notes
            );

            if ($stmt->execute()) {
                $order_id = $this->conn->insert_id;
                $stmt->close();

                return [
                    'success' => true,
                    'order_id' => $order_id,
                    'order_number' => $order_number,
                    'status' => $status,
                    'delivery_status' => $delivery_status,
                    'message' => 'Order created successfully'
                ];
            }

            $error = $stmt->error;
            $stmt->close();

            return [
                'success' => false,
                'message' => 'Execute error: ' . $error
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => 'Exception: ' . $e->getMessage()
            ];
        }
    }

    // Add items to an order
    public function addItems($order_id, $items) {
        $query = "INSERT INTO " . $this->items_table . "
                  (order_id, product_id, product_name, quantity, price, subtotal)
                  VALUES
                  (?, ?, ?, ?, ?, ?)";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        foreach ($items as $item) {
            $product_id = isset($item['id']) ? intval($item['id']) : 0;
            $product_name = isset($item['name']) ? strval($item['name']) : '';
            $quantity = isset($item['quantity']) ? intval($item['quantity']) : 1;
            $price = isset($item['price']) ? floatval($item['price']) : 0;
            $subtotal = $price * $quantity;

            $stmt->bind_param(
                "iisidd",
                $order_id,
                $product_id,
                $product_name,
                $quantity,
                $price,
                $subtotal
            );

            if (!$stmt->execute()) {
                $stmt->close();
                return false;
            }
        }

        $stmt->close();
        return true;
    }

    // Get order by ID
    public function getById($order_id) {
        $query = "SELECT * FROM " . $this->table . " WHERE id = ? LIMIT 1";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return null;

        $stmt->bind_param("i", $order_id);
        $stmt->execute();

        $result = $stmt->get_result();
        $order = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        return $order ?: null;
    }

    // Get order by order number
    public function getByOrderNumber($order_number) {
        $query = "SELECT * FROM " . $this->table . " WHERE order_number = ? LIMIT 1";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return null;

        $stmt->bind_param("s", $order_number);
        $stmt->execute();

        $result = $stmt->get_result();
        $order = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        return $order ?: null;
    }

    // Get order items
    public function getItems($order_id) {
        $query = "SELECT * FROM " . $this->items_table . " WHERE order_id = ?";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("i", $order_id);
        $stmt->execute();

        $result = $stmt->get_result();

        $items = [];
        while ($row = $result->fetch_assoc()) {
            $items[] = $row;
        }

        $stmt->close();

        return $items;
    }

    // Get all orders
    public function getAll($limit = 50, $offset = 0) {
        $query = "SELECT * FROM " . $this->table . " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("ii", $limit, $offset);
        $stmt->execute();

        $result = $stmt->get_result();

        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        $stmt->close();

        return $orders;
    }

    // Update restaurant/kitchen order status
    public function updateStatus($order_id, $status) {
        $query = "UPDATE " . $this->table . " SET status = ? WHERE id = ?";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return false;

        $stmt->bind_param("si", $status, $order_id);
        $success = $stmt->execute();

        $stmt->close();

        return $success;
    }

    // Update rider/delivery status
    public function updateDeliveryStatus($order_id, $delivery_status) {
        $timestampColumn = null;

        if ($delivery_status === 'assigned') {
            $timestampColumn = 'rider_assigned_at';
        } elseif ($delivery_status === 'picked_up') {
            $timestampColumn = 'picked_up_at';
        } elseif ($delivery_status === 'on_the_way') {
            $timestampColumn = 'on_the_way_at';
        } elseif ($delivery_status === 'delivered') {
            $timestampColumn = 'delivered_at';
        }

        if ($timestampColumn) {
            $query = "UPDATE " . $this->table . "
                      SET delivery_status = ?, $timestampColumn = NOW()
                      WHERE id = ?";
        } else {
            $query = "UPDATE " . $this->table . "
                      SET delivery_status = ?
                      WHERE id = ?";
        }

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return false;

        $stmt->bind_param("si", $delivery_status, $order_id);
        $success = $stmt->execute();

        $stmt->close();

        return $success;
    }

    // Assign rider to order
    public function assignRider($order_id, $rider_id, $rider_name, $rider_email = null, $rider_phone = null) {
        $delivery_status = 'assigned';

        $query = "UPDATE " . $this->table . "
                  SET
                    delivery_status = ?,
                    rider_id = ?,
                    rider_name = ?,
                    rider_email = ?,
                    rider_phone = ?,
                    rider_assigned_at = NOW()
                  WHERE id = ?
                  AND delivery_status IN ('searching', 'assigned')";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return false;

        $stmt->bind_param(
            "sisssi",
            $delivery_status,
            $rider_id,
            $rider_name,
            $rider_email,
            $rider_phone,
            $order_id
        );

        $success = $stmt->execute();
        $affectedRows = $stmt->affected_rows;

        $stmt->close();

        return $success && $affectedRows > 0;
    }

    // Mark order as delivered from rider side
    public function markDelivered($order_id) {
        $query = "UPDATE " . $this->table . "
                  SET
                    status = 'delivered',
                    delivery_status = 'delivered',
                    delivered_at = NOW()
                  WHERE id = ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return false;

        $stmt->bind_param("i", $order_id);
        $success = $stmt->execute();

        $stmt->close();

        return $success;
    }

    // Get orders by restaurant/kitchen status
    public function getByStatus($status) {
        $query = "SELECT * FROM " . $this->table . " WHERE status = ? ORDER BY created_at DESC";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("s", $status);
        $stmt->execute();

        $result = $stmt->get_result();

        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        $stmt->close();

        return $orders;
    }

    // Get available deliveries for rider
    public function getAvailableDeliveries($limit = 50) {
        /*
          Real-world flow:
          Rider can accept early once order exists and delivery_status is searching.
          Restaurant still controls when food is ready for pickup.
        */
        $query = "SELECT *
                  FROM " . $this->table . "
                  WHERE status NOT IN ('cancelled', 'delivered')
                  AND delivery_status = 'searching'
                  ORDER BY created_at DESC
                  LIMIT ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("i", $limit);
        $stmt->execute();

        $result = $stmt->get_result();

        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        $stmt->close();

        return $orders;
    }

    // Get assigned deliveries for one rider
    public function getAssignedDeliveriesByRider($rider_id, $limit = 50) {
        $query = "SELECT *
                  FROM " . $this->table . "
                  WHERE rider_id = ?
                  AND delivery_status IN ('assigned', 'picked_up', 'on_the_way')
                  AND status != 'cancelled'
                  ORDER BY created_at DESC
                  LIMIT ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("ii", $rider_id, $limit);
        $stmt->execute();

        $result = $stmt->get_result();

        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        $stmt->close();

        return $orders;
    }

    // Get total sales
    public function getTotalSales() {
        $query = "SELECT SUM(total) as total_sales FROM " . $this->table . " WHERE status != 'cancelled'";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return isset($row['total_sales']) ? floatval($row['total_sales']) : 0;
    }

    // Get orders count
    public function getOrdersCount() {
        $query = "SELECT COUNT(*) as count FROM " . $this->table;
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return isset($row['count']) ? intval($row['count']) : 0;
    }

    // ===== OWNER DASHBOARD =====

    public function getTotalOrdersByRestaurant($restaurantId) {
        $query = "SELECT COUNT(*) as total_orders
                  FROM " . $this->table . "
                  WHERE restaurant_id = ?";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->bind_param("i", $restaurantId);
        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return intval($row['total_orders'] ?? 0);
    }

    public function getTotalEarningsByRestaurant($restaurantId) {
        $query = "SELECT SUM(total) as total_earnings
                  FROM " . $this->table . "
                  WHERE restaurant_id = ?
                  AND status != 'cancelled'";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->bind_param("i", $restaurantId);
        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return floatval($row['total_earnings'] ?? 0);
    }

    public function getActiveOrdersByRestaurant($restaurantId) {
        /*
          Restaurant active means kitchen/restaurant work only.
          Delivery movement is handled by delivery_status.
        */
        $query = "SELECT COUNT(*) as active_orders
                  FROM " . $this->table . "
                  WHERE restaurant_id = ?
                  AND status IN ('confirmed', 'preparing', 'ready_for_pickup')";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->bind_param("i", $restaurantId);
        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return intval($row['active_orders'] ?? 0);
    }

    public function getPendingOrdersByRestaurant($restaurantId) {
        $query = "SELECT COUNT(*) as pending_orders
                  FROM " . $this->table . "
                  WHERE restaurant_id = ?
                  AND status = 'pending'";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->bind_param("i", $restaurantId);
        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return intval($row['pending_orders'] ?? 0);
    }

    public function getWeeklyEarningsByRestaurant($restaurantId) {
        $query = "SELECT SUM(total) as weekly_earnings
                  FROM " . $this->table . "
                  WHERE restaurant_id = ?
                  AND status != 'cancelled'
                  AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return 0;

        $stmt->bind_param("i", $restaurantId);
        $stmt->execute();

        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $stmt->close();

        return floatval($row['weekly_earnings'] ?? 0);
    }

    public function getRecentOrdersByRestaurant($restaurantId, $limit = 5) {
        $query = "SELECT
                    id,
                    order_number,
                    customer_name,
                    total,
                    status,
                    delivery_status,
                    rider_name,
                    created_at
                  FROM " . $this->table . "
                  WHERE restaurant_id = ?
                  ORDER BY created_at DESC
                  LIMIT ?";
        $stmt = $this->conn->prepare($query);

        if (!$stmt) return [];

        $stmt->bind_param("ii", $restaurantId, $limit);
        $stmt->execute();

        $result = $stmt->get_result();

        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        $stmt->close();

        return $orders;
    }
}
?>
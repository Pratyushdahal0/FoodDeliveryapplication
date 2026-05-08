<?php

class Order {
    private $conn;
    private $table = 'orders';
    private $items_table = 'order_items';

    public function __construct($db) {
        $this->conn = $db;
    }

    /*
    |--------------------------------------------------------------------------
    | Realistic FoodExpress pricing helpers
    |--------------------------------------------------------------------------
    | Beta rule for Nepal market:
    | Subtotal under Rs. 500   => Rs. 50 delivery
    | Subtotal Rs. 500-999     => Rs. 30 delivery
    | Subtotal Rs. 1000-1499   => Rs. 20 delivery
    | Subtotal Rs. 1500+       => Free delivery
    */

    private function calculateDeliveryFee($subtotal) {
        $amount = floatval($subtotal);

        if ($amount <= 0) {
            return 0.00;
        }

        if ($amount >= 1500) {
            return 0.00;
        }

        if ($amount >= 1000) {
            return 20.00;
        }

        if ($amount >= 500) {
            return 30.00;
        }

        return 50.00;
    }

    private function calculateTax($subtotal) {
        return round(floatval($subtotal) * 0.10, 2);
    }

    private function normalizeDeliveryFee($subtotal, $providedDeliveryFee = null) {
        $calculatedDeliveryFee = $this->calculateDeliveryFee($subtotal);

        if ($providedDeliveryFee === null || $providedDeliveryFee === '') {
            return $calculatedDeliveryFee;
        }

        $providedDeliveryFee = floatval($providedDeliveryFee);

        /*
          Protect backend from old demo frontend values.
          If old frontend sends Rs. 5.00 or Rs. 0.00 for an order that should
          have a real delivery fee, backend recalculates it.
        */
        if ($calculatedDeliveryFee > 0 && $providedDeliveryFee <= 5) {
            return $calculatedDeliveryFee;
        }

        if ($providedDeliveryFee < 0) {
            return $calculatedDeliveryFee;
        }

        return round($providedDeliveryFee, 2);
    }

    private function normalizeTax($subtotal, $providedTax = null) {
        if ($providedTax === null || $providedTax === '') {
            return $this->calculateTax($subtotal);
        }

        $providedTax = floatval($providedTax);

        if ($providedTax <= 0 && floatval($subtotal) > 0) {
            return $this->calculateTax($subtotal);
        }

        return round($providedTax, 2);
    }

    private function calculateFinalTotal($subtotal, $tax, $deliveryFee, $discountAmount = 0) {
        $total = floatval($subtotal) + floatval($tax) + floatval($deliveryFee) - floatval($discountAmount);
        return round(max(0, $total), 2);
    }

    // Get rider's current active delivery
    public function getActiveDeliveryByRider($rider_id) {
    $query = "
        SELECT
            o.*,
            r.restaurant_name AS restaurant_name,
            r.restaurant_name AS restaurantName,
            r.location AS restaurant_address,
            r.location AS restaurantAddress,
            r.city AS restaurant_city
        FROM " . $this->table . " o
        LEFT JOIN restaurants r ON o.restaurant_id = r.id
        WHERE o.rider_id = ?
          AND o.delivery_status IN ('assigned', 'picked_up', 'on_the_way')
          AND o.status != 'delivered'
        ORDER BY o.updated_at DESC, o.created_at DESC
        LIMIT 1
    ";

    $stmt = $this->conn->prepare($query);

    if (!$stmt) return null;

    $stmt->bind_param("i", $rider_id);
    $stmt->execute();

    $result = $stmt->get_result();
    $order = $result ? $result->fetch_assoc() : null;

    $stmt->close();

    if ($order) {
        $restaurantAddress = trim(($order["restaurant_address"] ?? "") . ", " . ($order["restaurant_city"] ?? ""));
        $restaurantAddress = trim($restaurantAddress, " ,");

        $order["restaurantAddress"] = $restaurantAddress ?: ($order["restaurant_address"] ?? "");
        $order["restaurant_address"] = $restaurantAddress ?: ($order["restaurant_address"] ?? "");
    }

    return $order ?: null;
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

            $status = isset($data['status']) && $data['status'] !== ''
                ? $data['status']
                : 'pending';

            $delivery_status = isset($data['delivery_status']) && $data['delivery_status'] !== ''
                ? $data['delivery_status']
                : 'searching';

            $notes = isset($data['notes'])
                ? $data['notes']
                : (isset($data['delivery_note']) ? $data['delivery_note'] : null);

            $subtotal = isset($data['subtotal']) ? round(floatval($data['subtotal']), 2) : 0.00;

            $tax = $this->normalizeTax(
                $subtotal,
                isset($data['tax']) ? $data['tax'] : null
            );

            $delivery_fee = $this->normalizeDeliveryFee(
                $subtotal,
                isset($data['delivery_fee']) ? $data['delivery_fee'] : null
            );

            $discount_amount = isset($data['discount_amount'])
                ? floatval($data['discount_amount'])
                : 0.00;

            /*
              Backend becomes the final source of truth for totals.
              This prevents old frontend values like Rs. 5 delivery fee from
              being saved accidentally.
            */
            $total = $this->calculateFinalTotal(
                $subtotal,
                $tax,
                $delivery_fee,
                $discount_amount
            );

            $customer_email = isset($data['customer_email'])
                ? trim($data['customer_email'])
                : null;

            $customer_name = isset($data['customer_name'])
                ? trim($data['customer_name'])
                : 'Guest User';

            $phone_number = isset($data['phone_number'])
                ? trim($data['phone_number'])
                : '';

            $address = isset($data['address'])
                ? trim($data['address'])
                : '';

            $city = isset($data['city'])
                ? trim($data['city'])
                : '';

            $postal_code = isset($data['postal_code'])
                ? trim($data['postal_code'])
                : '';

            $payment_method = isset($data['payment_method'])
                ? trim($data['payment_method'])
                : 'cash';

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
                $customer_name,
                $customer_email,
                $phone_number,
                $address,
                $city,
                $postal_code,
                $payment_method,
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
                    'subtotal' => $subtotal,
                    'tax' => $tax,
                    'delivery_fee' => $delivery_fee,
                    'total' => $total,
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
            $product_name = isset($item['name'])
                ? strval($item['name'])
                : (isset($item['product_name']) ? strval($item['product_name']) : 'Food Item');

            $quantity = isset($item['quantity']) ? intval($item['quantity']) : 1;
            $price = isset($item['price']) ? floatval($item['price']) : 0;
            $subtotal = round($price * $quantity, 2);

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
        $query = "UPDATE " . $this->table . "
                  SET status = ?, updated_at = NOW()
                  WHERE id = ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) return false;

        $stmt->bind_param("si", $status, $order_id);
        $success = $stmt->execute();

        $stmt->close();

        return $success;
    }

    // Update rider/delivery status
    public function updateDeliveryStatus($order_id, $delivery_status) {
        $allowed = ['searching', 'assigned', 'picked_up', 'on_the_way', 'delivered'];

        if (!in_array($delivery_status, $allowed, true)) {
            return false;
        }

        $timestampColumn = null;
        $mainStatus = null;

        if ($delivery_status === 'assigned') {
            $timestampColumn = 'rider_assigned_at';
        } elseif ($delivery_status === 'picked_up') {
            $timestampColumn = 'picked_up_at';
            $mainStatus = 'picked_up';
        } elseif ($delivery_status === 'on_the_way') {
            $timestampColumn = 'on_the_way_at';
            $mainStatus = 'on_the_way';
        } elseif ($delivery_status === 'delivered') {
            $timestampColumn = 'delivered_at';
            $mainStatus = 'delivered';
        }

        if ($mainStatus && $timestampColumn) {
            $query = "UPDATE " . $this->table . "
                      SET 
                        delivery_status = ?,
                        status = ?,
                        $timestampColumn = NOW(),
                        updated_at = NOW()
                      WHERE id = ?";
        } elseif ($timestampColumn) {
            $query = "UPDATE " . $this->table . "
                      SET 
                        delivery_status = ?,
                        $timestampColumn = NOW(),
                        updated_at = NOW()
                      WHERE id = ?";
        } else {
            $query = "UPDATE " . $this->table . "
                      SET 
                        delivery_status = ?,
                        updated_at = NOW()
                      WHERE id = ?";
        }

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

        if ($mainStatus && $timestampColumn) {
            $stmt->bind_param("ssi", $delivery_status, $mainStatus, $order_id);
        } else {
            $stmt->bind_param("si", $delivery_status, $order_id);
        }

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
                    rider_assigned_at = NOW(),
                    updated_at = NOW()
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
                    delivered_at = NOW(),
                    updated_at = NOW()
                  WHERE id = ?";

        $stmt = $this->conn->prepare($query);

        if (!$stmt) {
            return false;
        }

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
          Current beta flow:
          Rider can see orders that are still searching for a rider,
          as long as the order is not cancelled or delivered.

          Later real-world upgrade:
          We can decide whether riders should see orders only after
          ready_for_pickup or earlier while the restaurant is preparing.
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
        $query = "SELECT SUM(total) as total_sales
                  FROM " . $this->table . "
                  WHERE status != 'cancelled'";

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
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
            
            $status = 'pending';
            $notes = isset($data['notes']) ? $data['notes'] : null;
            $subtotal = isset($data['subtotal']) ? floatval($data['subtotal']) : 0;
            $tax = isset($data['tax']) ? floatval($data['tax']) : 0;
            $delivery_fee = isset($data['delivery_fee']) ? floatval($data['delivery_fee']) : 5.00;
            $total = isset($data['total']) ? floatval($data['total']) : 0;
            
            $query = "INSERT INTO " . $this->table . " 
                      (order_number, customer_name, phone_number, address, city, postal_code, 
                       payment_method, subtotal, tax, delivery_fee, total, status, notes) 
                      VALUES 
                      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $stmt = $this->conn->prepare($query);
            
            if (!$stmt) {
                return ['success' => false, 'message' => 'Database prepare error: ' . $this->conn->error];
            }

            $bind_result = $stmt->bind_param(
                "sssssssddddss",
                $order_number,
                $data['customer_name'],
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
                $notes
            );

            if (!$bind_result) {
                return ['success' => false, 'message' => 'Bind parameter error: ' . $stmt->error];
            }

            if ($stmt->execute()) {
                return [
                    'success' => true,
                    'order_id' => $this->conn->insert_id,
                    'order_number' => $order_number,
                    'message' => 'Order created successfully'
                ];
            }

            return ['success' => false, 'message' => 'Execute error: ' . $stmt->error];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Exception: ' . $e->getMessage()];
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
                return false;
            }
        }

        return true;
    }

    // Get order by ID
    public function getById($order_id) {
        $query = "SELECT * FROM " . $this->table . " WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bind_param("i", $order_id);
        $stmt->execute();
        $result = $stmt->get_result();
        return $result->fetch_assoc();
    }

    // Get order by order number
    public function getByOrderNumber($order_number) {
        $query = "SELECT * FROM " . $this->table . " WHERE order_number = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bind_param("s", $order_number);
        $stmt->execute();
        $result = $stmt->get_result();
        return $result->fetch_assoc();
    }

    // Get order items
    public function getItems($order_id) {
        $query = "SELECT * FROM " . $this->items_table . " WHERE order_id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bind_param("i", $order_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $items = [];
        while ($row = $result->fetch_assoc()) {
            $items[] = $row;
        }
        return $items;
    }

    // Get all orders
    public function getAll($limit = 50, $offset = 0) {
        $query = "SELECT * FROM " . $this->table . " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bind_param("ii", $limit, $offset);
        $stmt->execute();
        $result = $stmt->get_result();
        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }
        return $orders;
    }

    // Update order status
    public function updateStatus($order_id, $status) {
        $query = "UPDATE " . $this->table . " SET status = ? WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bind_param("si", $status, $order_id);
        return $stmt->execute();
    }

    // Get orders by status
    public function getByStatus($status) {
        $query = "SELECT * FROM " . $this->table . " WHERE status = ? ORDER BY created_at DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->bind_param("s", $status);
        $stmt->execute();
        $result = $stmt->get_result();
        $orders = [];
        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }
        return $orders;
    }

    // Get total sales
    public function getTotalSales() {
        $query = "SELECT SUM(total) as total_sales FROM " . $this->table . " WHERE status != 'cancelled'";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        return isset($row['total_sales']) ? floatval($row['total_sales']) : 0;
    }

    // Get orders count
    public function getOrdersCount() {
        $query = "SELECT COUNT(*) as count FROM " . $this->table;
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        return isset($row['count']) ? intval($row['count']) : 0;
    }
}
?>

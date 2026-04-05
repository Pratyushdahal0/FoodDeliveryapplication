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
        // Generate unique order number
        $order_number = 'ORD' . date('Ymd') . strtoupper(substr(uniqid(), -4));
        
        $query = "INSERT INTO " . $this->table . " 
                  (order_number, customer_name, phone_number, address, city, postal_code, 
                   payment_method, subtotal, tax, delivery_fee, total, status, notes) 
                  VALUES 
                  (:order_number, :customer_name, :phone_number, :address, :city, :postal_code, 
                   :payment_method, :subtotal, :tax, :delivery_fee, :total, :status, :notes)";

        $stmt = $this->conn->prepare($query);

        // Bind values
        $stmt->bindParam(':order_number', $order_number);
        $stmt->bindParam(':customer_name', $data['customer_name']);
        $stmt->bindParam(':phone_number', $data['phone_number']);
        $stmt->bindParam(':address', $data['address']);
        $stmt->bindParam(':city', $data['city']);
        $stmt->bindParam(':postal_code', $data['postal_code']);
        $stmt->bindParam(':payment_method', $data['payment_method']);
        $stmt->bindParam(':subtotal', $data['subtotal']);
        $stmt->bindParam(':tax', $data['tax']);
        $stmt->bindParam(':delivery_fee', $data['delivery_fee']);
        $stmt->bindParam(':total', $data['total']);
        
        $status = 'pending';
        $stmt->bindParam(':status', $status);
        
        $notes = isset($data['notes']) ? $data['notes'] : null;
        $stmt->bindParam(':notes', $notes);

        if ($stmt->execute()) {
            return [
                'success' => true,
                'order_id' => $this->conn->lastInsertId(),
                'order_number' => $order_number,
                'message' => 'Order created successfully'
            ];
        }

        return [
            'success' => false,
            'message' => 'Failed to create order'
        ];
    }

    // Add items to an order
    public function addItems($order_id, $items) {
        $query = "INSERT INTO " . $this->items_table . " 
                  (order_id, product_id, product_name, quantity, price, subtotal) 
                  VALUES 
                  (:order_id, :product_id, :product_name, :quantity, :price, :subtotal)";

        $stmt = $this->conn->prepare($query);

        foreach ($items as $item) {
            $stmt->bindParam(':order_id', $order_id);
            $stmt->bindParam(':product_id', $item['id']);
            $stmt->bindParam(':product_name', $item['name']);
            $stmt->bindParam(':quantity', $item['quantity']);
            $stmt->bindParam(':price', $item['price']);
            
            $subtotal = $item['price'] * $item['quantity'];
            $stmt->bindParam(':subtotal', $subtotal);

            if (!$stmt->execute()) {
                return false;
            }
        }

        return true;
    }

    // Get order by ID
    public function getById($order_id) {
        $query = "SELECT * FROM " . $this->table . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $order_id);
        $stmt->execute();
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // Get order by order number
    public function getByOrderNumber($order_number) {
        $query = "SELECT * FROM " . $this->table . " WHERE order_number = :order_number";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':order_number', $order_number);
        $stmt->execute();
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // Get order items
    public function getItems($order_id) {
        $query = "SELECT * FROM " . $this->items_table . " WHERE order_id = :order_id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':order_id', $order_id);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Get all orders
    public function getAll($limit = 50, $offset = 0) {
        $query = "SELECT * FROM " . $this->table . " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Update order status
    public function updateStatus($order_id, $status) {
        $query = "UPDATE " . $this->table . " SET status = :status WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':status', $status);
        $stmt->bindParam(':id', $order_id);
        
        return $stmt->execute();
    }

    // Get orders by status
    public function getByStatus($status) {
        $query = "SELECT * FROM " . $this->table . " WHERE status = :status ORDER BY created_at DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':status', $status);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Get total sales
    public function getTotalSales() {
        $query = "SELECT SUM(total) as total_sales FROM " . $this->table . " WHERE status != 'cancelled'";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result['total_sales'] ?? 0;
    }

    // Get orders count
    public function getOrdersCount() {
        $query = "SELECT COUNT(*) as count FROM " . $this->table;
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result['count'] ?? 0;
    }
}
?>

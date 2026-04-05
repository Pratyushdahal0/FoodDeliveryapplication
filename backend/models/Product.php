<?php
class Product {
    private $conn;
    private $table = "products";

    public function __construct($conn) {
        $this->conn = $conn;
    }

    // Get all available products
    public function getAll() {
        $sql = "SELECT * FROM {$this->table} WHERE is_available = 1 ORDER BY is_popular DESC, created_at DESC";
        $result = $this->conn->query($sql);
        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }
        return $products;
    }

    // Get products by category
    public function getByCategory($category) {
        $category = $this->conn->real_escape_string($category);
        $sql = "SELECT * FROM {$this->table} WHERE category = '$category' AND is_available = 1";
        $result = $this->conn->query($sql);
        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }
        return $products;
    }

    // Get popular products
    public function getPopular() {
        $sql = "SELECT * FROM {$this->table} WHERE is_popular = 1 AND is_available = 1 LIMIT 8";
        $result = $this->conn->query($sql);
        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }
        return $products;
    }

    // Get single product by ID
    public function getById($id) {
        $id = intval($id);
        $sql = "SELECT * FROM {$this->table} WHERE id = $id AND is_available = 1";
        $result = $this->conn->query($sql);
        return $result->fetch_assoc();
    }

    // Search products
    public function search($keyword) {
        $keyword = $this->conn->real_escape_string($keyword);
        $sql = "SELECT * FROM {$this->table} 
                WHERE is_available = 1 
                AND (name LIKE '%$keyword%' OR description LIKE '%$keyword%' OR category LIKE '%$keyword%')";
        $result = $this->conn->query($sql);
        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }
        return $products;
    }
}
?>
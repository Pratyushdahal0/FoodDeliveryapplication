<?php
class Product {
    private $conn;
    private $table = "products";

    public function __construct($conn) {
        $this->conn = $conn;
    }

    // ===== CUSTOMER SIDE =====
    public function getAll() {
        $sql = "SELECT * FROM {$this->table} WHERE is_available = 1 ORDER BY is_popular DESC, created_at DESC";
        $result = $this->conn->query($sql);
        $products = [];

        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    public function getByCategory($category) {
        $stmt = $this->conn->prepare(
            "SELECT * FROM {$this->table}
             WHERE category = ? AND is_available = 1
             ORDER BY created_at DESC"
        );
        $stmt->bind_param("s", $category);
        $stmt->execute();
        $result = $stmt->get_result();

        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    public function getPopular() {
        $sql = "SELECT * FROM {$this->table} WHERE is_popular = 1 AND is_available = 1 ORDER BY created_at DESC LIMIT 8";
        $result = $this->conn->query($sql);
        $products = [];

        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    public function getById($id) {
        $stmt = $this->conn->prepare("SELECT * FROM {$this->table} WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $result = $stmt->get_result();

        return $result->fetch_assoc();
    }

    public function search($keyword) {
        $keyword = "%" . $keyword . "%";

        $stmt = $this->conn->prepare(
            "SELECT * FROM {$this->table}
             WHERE is_available = 1
             AND (name LIKE ? OR description LIKE ? OR category LIKE ?)
             ORDER BY created_at DESC"
        );

        $stmt->bind_param("sss", $keyword, $keyword, $keyword);
        $stmt->execute();
        $result = $stmt->get_result();

        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    // ===== OWNER SIDE =====
    public function getByRestaurant($restaurantId) {
        $stmt = $this->conn->prepare(
            "SELECT * FROM {$this->table}
             WHERE restaurant_id = ?
             ORDER BY created_at DESC"
        );
        $stmt->bind_param("i", $restaurantId);
        $stmt->execute();
        $result = $stmt->get_result();

        $products = [];
        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    public function create($restaurantId, $name, $description, $price, $category, $imageUrl, $isAvailable, $isPopular) {
        $stmt = $this->conn->prepare(
            "INSERT INTO {$this->table}
            (restaurant_id, name, description, price, category, image_url, is_available, is_popular)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );

        $stmt->bind_param(
            "issdssii",
            $restaurantId,
            $name,
            $description,
            $price,
            $category,
            $imageUrl,
            $isAvailable,
            $isPopular
        );

        return $stmt->execute();
    }

    public function update($id, $restaurantId, $name, $description, $price, $category, $imageUrl, $isAvailable, $isPopular) {
        $stmt = $this->conn->prepare(
            "UPDATE {$this->table}
             SET name = ?, description = ?, price = ?, category = ?, image_url = ?, is_available = ?, is_popular = ?
             WHERE id = ? AND restaurant_id = ?"
        );

        $stmt->bind_param(
            "ssdssiiii",
            $name,
            $description,
            $price,
            $category,
            $imageUrl,
            $isAvailable,
            $isPopular,
            $id,
            $restaurantId
        );

        return $stmt->execute();
    }

    public function delete($id, $restaurantId) {
        $stmt = $this->conn->prepare(
            "DELETE FROM {$this->table}
             WHERE id = ? AND restaurant_id = ?"
        );

        $stmt->bind_param("ii", $id, $restaurantId);
        return $stmt->execute();
    }

    public function toggleAvailability($id, $restaurantId, $isAvailable) {
        $stmt = $this->conn->prepare(
            "UPDATE {$this->table}
             SET is_available = ?
             WHERE id = ? AND restaurant_id = ?"
        );

        $stmt->bind_param("iii", $isAvailable, $id, $restaurantId);
        return $stmt->execute();
    }
}
?>
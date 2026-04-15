<?php
class Product {
    private $conn;
    private $table = "products";

    public function __construct($conn) {
        $this->conn = $conn;
    }

    // ===== CUSTOMER SIDE =====
    public function getAll() {
        $sql = "SELECT
                    p.*,
                    r.restaurant_name AS restaurant_name
                FROM {$this->table} p
                LEFT JOIN restaurants r ON p.restaurant_id = r.id
                WHERE p.is_available = 1
                ORDER BY p.is_popular DESC, p.id DESC";

        $result = $this->conn->query($sql);
        $products = [];

        if (!$result) {
            return $products;
        }

        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    public function getByCategory($category) {
        $stmt = $this->conn->prepare(
            "SELECT
                p.*,
                r.restaurant_name AS restaurant_name
             FROM {$this->table} p
             LEFT JOIN restaurants r ON p.restaurant_id = r.id
             WHERE p.category = ? AND p.is_available = 1
             ORDER BY p.id DESC"
        );

        if (!$stmt) {
            return [];
        }

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
        $sql = "SELECT
                    p.*,
                    r.restaurant_name AS restaurant_name
                FROM {$this->table} p
                LEFT JOIN restaurants r ON p.restaurant_id = r.id
                WHERE p.is_popular = 1 AND p.is_available = 1
                ORDER BY p.id DESC
                LIMIT 8";

        $result = $this->conn->query($sql);
        $products = [];

        if (!$result) {
            return $products;
        }

        while ($row = $result->fetch_assoc()) {
            $products[] = $row;
        }

        return $products;
    }

    public function getById($id) {
        $stmt = $this->conn->prepare(
            "SELECT
                p.*,
                r.restaurant_name AS restaurant_name
             FROM {$this->table} p
             LEFT JOIN restaurants r ON p.restaurant_id = r.id
             WHERE p.id = ?"
        );

        if (!$stmt) {
            return null;
        }

        $stmt->bind_param("i", $id);
        $stmt->execute();
        $result = $stmt->get_result();

        return $result->fetch_assoc();
    }

    public function search($keyword) {
        $keyword = "%" . $keyword . "%";

        $stmt = $this->conn->prepare(
            "SELECT
                p.*,
                r.restaurant_name AS restaurant_name
             FROM {$this->table} p
             LEFT JOIN restaurants r ON p.restaurant_id = r.id
             WHERE p.is_available = 1
             AND (
                p.name LIKE ?
                OR p.description LIKE ?
                OR p.category LIKE ?
                OR r.restaurant_name LIKE ?
             )
             ORDER BY p.id DESC"
        );

        if (!$stmt) {
            return [];
        }

        $stmt->bind_param("ssss", $keyword, $keyword, $keyword, $keyword);
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
            "SELECT
                p.*,
                r.restaurant_name AS restaurant_name
             FROM {$this->table} p
             LEFT JOIN restaurants r ON p.restaurant_id = r.id
             WHERE p.restaurant_id = ?
             ORDER BY p.id DESC"
        );

        if (!$stmt) {
            return [];
        }

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

        if (!$stmt) {
            return false;
        }

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

        if (!$stmt) {
            return false;
        }

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

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param("ii", $id, $restaurantId);
        return $stmt->execute();
    }

    public function toggleAvailability($id, $restaurantId, $isAvailable) {
        $stmt = $this->conn->prepare(
            "UPDATE {$this->table}
             SET is_available = ?
             WHERE id = ? AND restaurant_id = ?"
        );

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param("iii", $isAvailable, $id, $restaurantId);
        return $stmt->execute();
    }
}
?>
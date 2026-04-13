<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST");
header("Access-Control-Allow-Headers: Content-Type");

require "../config/db.php";
require "../models/Product.php";

$productModel = new Product($conn);

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    switch ($action) {

        // ===== CUSTOMER SIDE =====
        case 'all':
            echo json_encode([
                "success" => true,
                "data" => $productModel->getAll()
            ]);
            break;

        case 'popular':
            echo json_encode([
                "success" => true,
                "data" => $productModel->getPopular()
            ]);
            break;

        case 'category':
            $category = trim($_GET['category'] ?? '');

            if (!$category) {
                echo json_encode([
                    "success" => false,
                    "message" => "Category required"
                ]);
                break;
            }

            echo json_encode([
                "success" => true,
                "data" => $productModel->getByCategory($category)
            ]);
            break;

        case 'single':
            $id = intval($_GET['id'] ?? 0);

            if (!$id) {
                echo json_encode([
                    "success" => false,
                    "message" => "ID required"
                ]);
                break;
            }

            $item = $productModel->getById($id);

            echo json_encode([
                "success" => $item ? true : false,
                "data" => $item,
                "message" => $item ? "Product found" : "Product not found"
            ]);
            break;

        case 'search':
            $keyword = trim($_GET['q'] ?? '');

            if (!$keyword) {
                echo json_encode([
                    "success" => false,
                    "message" => "Search keyword required"
                ]);
                break;
            }

            echo json_encode([
                "success" => true,
                "data" => $productModel->search($keyword)
            ]);
            break;

        // ===== OWNER SIDE =====
        case 'owner_list':
            $restaurantId = intval($_GET['restaurant_id'] ?? 0);

            if (!$restaurantId) {
                echo json_encode([
                    "success" => false,
                    "message" => "restaurant_id required"
                ]);
                break;
            }

            echo json_encode([
                "success" => true,
                "data" => $productModel->getByRestaurant($restaurantId)
            ]);
            break;

        case 'create':
            $restaurantId = intval($_POST['restaurant_id'] ?? 0);
            $name = trim($_POST['name'] ?? '');
            $description = trim($_POST['description'] ?? '');
            $price = floatval($_POST['price'] ?? 0);
            $category = trim($_POST['category'] ?? '');
            $imageUrl = trim($_POST['image_url'] ?? '');
            $isAvailable = intval($_POST['is_available'] ?? 1);
            $isPopular = intval($_POST['is_popular'] ?? 0);

            if (!$restaurantId || !$name || !$price || !$category) {
                echo json_encode([
                    "success" => false,
                    "message" => "Required fields missing"
                ]);
                break;
            }

            $success = $productModel->create(
                $restaurantId,
                $name,
                $description,
                $price,
                $category,
                $imageUrl,
                $isAvailable,
                $isPopular
            );

            if (!$success) {
                throw new Exception("Create failed: " . $conn->error);
            }

            echo json_encode([
                "success" => true,
                "message" => "Product added successfully"
            ]);
            break;

        case 'update':
            $id = intval($_POST['id'] ?? 0);
            $restaurantId = intval($_POST['restaurant_id'] ?? 0);
            $name = trim($_POST['name'] ?? '');
            $description = trim($_POST['description'] ?? '');
            $price = floatval($_POST['price'] ?? 0);
            $category = trim($_POST['category'] ?? '');
            $imageUrl = trim($_POST['image_url'] ?? '');
            $isAvailable = intval($_POST['is_available'] ?? 1);
            $isPopular = intval($_POST['is_popular'] ?? 0);

            if (!$id || !$restaurantId || !$name || !$price || !$category) {
                echo json_encode([
                    "success" => false,
                    "message" => "Required fields missing"
                ]);
                break;
            }

            $success = $productModel->update(
                $id,
                $restaurantId,
                $name,
                $description,
                $price,
                $category,
                $imageUrl,
                $isAvailable,
                $isPopular
            );

            if (!$success) {
                throw new Exception("Update failed: " . $conn->error);
            }

            echo json_encode([
                "success" => true,
                "message" => "Product updated successfully"
            ]);
            break;

        case 'delete':
            $id = intval($_POST['id'] ?? 0);
            $restaurantId = intval($_POST['restaurant_id'] ?? 0);

            if (!$id || !$restaurantId) {
                echo json_encode([
                    "success" => false,
                    "message" => "id and restaurant_id required"
                ]);
                break;
            }

            $success = $productModel->delete($id, $restaurantId);

            if (!$success) {
                throw new Exception("Delete failed: " . $conn->error);
            }

            echo json_encode([
                "success" => true,
                "message" => "Product deleted successfully"
            ]);
            break;

        case 'toggle':
            $id = intval($_POST['id'] ?? 0);
            $restaurantId = intval($_POST['restaurant_id'] ?? 0);
            $isAvailable = intval($_POST['is_available'] ?? 0);

            if (!$id || !$restaurantId) {
                echo json_encode([
                    "success" => false,
                    "message" => "id and restaurant_id required"
                ]);
                break;
            }

            $success = $productModel->toggleAvailability($id, $restaurantId, $isAvailable);

            if (!$success) {
                throw new Exception("Toggle failed: " . $conn->error);
            }

            echo json_encode([
                "success" => true,
                "message" => "Availability updated"
            ]);
            break;

        default:
            echo json_encode([
                "success" => false,
                "message" => "Invalid action"
            ]);
            break;
    }
} catch (Throwable $e) {
    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}

$conn->close();
?>
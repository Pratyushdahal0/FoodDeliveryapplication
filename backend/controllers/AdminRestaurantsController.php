<?php
// AdminRestaurantsController.php - Admin API for managing restaurants
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../config/db.php";

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection not available."
    ]);
    exit;
}

$action = $_GET["action"] ?? "";

try {
    switch ($action) {
        case "list":
            handleListRestaurants($conn);
            break;

        case "update_status":
            handleUpdateRestaurantStatus($conn);
            break;

        default:
            http_response_code(400);
            echo json_encode([
                "success" => false,
                "message" => "Invalid action."
            ]);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage()
    ]);
}

function handleListRestaurants($conn) {
    $sql = "
        SELECT
            r.id,
            r.restaurant_name,
            r.description,
            r.cuisine_type,
            r.location,
            r.city,
            r.phone,
            r.email,
            r.logo_url,
            r.status,
            r.created_at,
            rd.owner_full_name
        FROM restaurants r
        LEFT JOIN restaurant_documents rd
            ON rd.restaurant_id = r.id
        ORDER BY r.created_at DESC
    ";

    $result = $conn->query($sql);

    if (!$result) {
        throw new Exception("Failed to fetch restaurants: " . $conn->error);
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }

    echo json_encode([
        "success" => true,
        "data" => $rows
    ]);
}

function handleUpdateRestaurantStatus($conn) {
    $input = json_decode(file_get_contents("php://input"), true);

    $id = isset($input["id"]) ? (int)$input["id"] : 0;
    $status = strtolower(trim($input["status"] ?? ""));

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "Restaurant ID is required."
        ]);
        return;
    }

    if (!in_array($status, ["pending", "approved", "rejected"], true)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "Invalid status value."
        ]);
        return;
    }

    $stmt = $conn->prepare("UPDATE restaurants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }

    $stmt->bind_param("si", $status, $id);
    $ok = $stmt->execute();

    if (!$ok) {
        throw new Exception("Failed to update restaurant status: " . $stmt->error);
    }

    echo json_encode([
        "success" => true,
        "message" => "Restaurant status updated to {$status}."
    ]);
}
?>
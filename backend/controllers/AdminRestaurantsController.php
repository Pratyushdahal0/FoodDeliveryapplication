<?php
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

        case "detail":
            handleRestaurantDetail($conn);
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
            COALESCE(rd.owner_full_name, u.name, 'No owner') AS owner_full_name
        FROM restaurants r
        LEFT JOIN restaurant_documents rd ON rd.restaurant_id = r.id
        LEFT JOIN users u ON r.owner_user_id = u.id
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

function handleRestaurantDetail($conn) {
    $id = intval($_GET["id"] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Restaurant ID required."]);
        return;
    }

    $stmt = $conn->prepare("
        SELECT
            r.*,
            COALESCE(rd.owner_full_name, u.name, 'No owner') AS owner_full_name,
            u.email AS owner_email
        FROM restaurants r
        LEFT JOIN restaurant_documents rd ON rd.restaurant_id = r.id
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.id = ?
        LIMIT 1
    ");
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $restaurant = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$restaurant) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Restaurant not found."]);
        return;
    }

    $orderCount = 0;
    $totalRevenue = 0.0;
    $countStmt = $conn->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(subtotal), 0) AS rev FROM orders WHERE restaurant_id = ? AND status NOT IN ('cancelled','rejected')");
    if ($countStmt) {
        $countStmt->bind_param("i", $id);
        $countStmt->execute();
        $row = $countStmt->get_result()->fetch_assoc();
        $orderCount = intval($row["cnt"] ?? 0);
        $totalRevenue = round((float)($row["rev"] ?? 0), 2);
        $countStmt->close();
    }

    $avgRating = null;
    $ratingCheck = $conn->query("SHOW TABLES LIKE 'order_reviews'");
    if ($ratingCheck && $ratingCheck->num_rows > 0) {
        $ratingStmt = $conn->prepare("SELECT AVG(rating) AS avg_rating FROM order_reviews WHERE restaurant_id = ?");
        if ($ratingStmt) {
            $ratingStmt->bind_param("i", $id);
            $ratingStmt->execute();
            $ratingRow = $ratingStmt->get_result()->fetch_assoc();
            $avgRating = $ratingRow["avg_rating"] !== null ? round((float)$ratingRow["avg_rating"], 1) : null;
            $ratingStmt->close();
        }
    }

    $restaurant["order_count"]   = $orderCount;
    $restaurant["total_revenue"] = $totalRevenue;
    $restaurant["avg_rating"]    = $avgRating;

    echo json_encode(["success" => true, "data" => $restaurant]);
}
?>
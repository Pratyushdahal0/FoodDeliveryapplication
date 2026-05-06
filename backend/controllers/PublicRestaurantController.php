<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

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

if ($action === "approved") {
    $sql = "
        SELECT
            id,
            restaurant_name,
            description,
            cuisine_type,
            location,
            city,
            phone,
            email,
            opening_time,
            closing_time,
            delivery_available,
            logo_url,
            cover_image_url,
            status
        FROM restaurants
        WHERE status = 'approved'
        ORDER BY restaurant_name ASC
    ";

    $result = $conn->query($sql);

    if (!$result) {
        echo json_encode([
            "success" => false,
            "message" => "Failed to fetch restaurants."
        ]);
        exit;
    }

    $restaurants = [];

    while ($row = $result->fetch_assoc()) {
        $restaurants[] = $row;
    }

    echo json_encode([
        "success" => true,
        "data" => $restaurants
    ]);
    exit;
}

/*
|--------------------------------------------------------------------------
| by_owner — return the restaurant owned by a given user_id, REGARDLESS
| of approval status. Used by the restaurant-owner login flow so we can
| show the right "pending review / rejected / approved" message.
|
| Owner login is the gate (AuthController?action=login + role check),
| so this endpoint is safe to expose: it returns minimal restaurant
| info for ONE user_id and never reveals other restaurants' data.
|--------------------------------------------------------------------------
*/

if ($action === "by_owner") {
    $userId = isset($_GET["user_id"]) ? intval($_GET["user_id"]) : 0;

    if ($userId <= 0) {
        echo json_encode([
            "success" => false,
            "message" => "Valid user_id is required."
        ]);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT
            id,
            owner_user_id,
            restaurant_name,
            description,
            cuisine_type,
            location,
            city,
            phone,
            email,
            opening_time,
            closing_time,
            delivery_available,
            is_open,
            accepting_orders,
            busy_mode,
            estimated_prep_minutes,
            logo_url,
            cover_image_url,
            status,
            created_at,
            updated_at
        FROM restaurants
        WHERE owner_user_id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        echo json_encode([
            "success" => false,
            "message" => "Failed to prepare by_owner query: " . $conn->error
        ]);
        exit;
    }

    $stmt->bind_param("i", $userId);
    $stmt->execute();

    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        echo json_encode([
            "success" => false,
            "message" => "No restaurant is registered for this owner.",
            "code" => "no_restaurant"
        ]);
        exit;
    }

    echo json_encode([
        "success" => true,
        "data" => $row
    ]);
    exit;
}

echo json_encode([
    "success" => false,
    "message" => "Invalid action."
]);
?>
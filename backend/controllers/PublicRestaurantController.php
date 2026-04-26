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

echo json_encode([
    "success" => false,
    "message" => "Invalid action."
]);
?>
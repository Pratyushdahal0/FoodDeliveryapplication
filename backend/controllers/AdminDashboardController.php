<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
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
        case "summary":
            handleDashboardSummary($conn);
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

function handleDashboardSummary($conn) {
    $summary = [
        "total_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants"),
        "pending_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE status = 'pending'"),
        "approved_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE status = 'approved'"),
        "rejected_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE status = 'rejected'"),
        "total_orders" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM orders"),
        "total_messages" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM contact_messages"),
        "recent_applications" => getRecentApplications($conn)
    ];

    echo json_encode([
        "success" => true,
        "data" => $summary
    ]);
}

function getSingleCount($conn, $sql) {
    $result = $conn->query($sql);

    if (!$result) {
        return 0;
    }

    $row = $result->fetch_assoc();
    return isset($row["total"]) ? (int)$row["total"] : 0;
}

function getRecentApplications($conn) {
    $sql = "
        SELECT
            r.id,
            r.restaurant_name,
            r.city,
            r.status,
            r.created_at,
            rd.owner_full_name
        FROM restaurants r
        LEFT JOIN restaurant_documents rd
            ON rd.restaurant_id = r.id
        ORDER BY r.created_at DESC
        LIMIT 6
    ";

    $result = $conn->query($sql);

    if (!$result) {
        return [];
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }

    return $rows;
}
?>
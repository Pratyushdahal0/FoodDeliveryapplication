<?php
// AdminUsersController.php - Admin API for managing users
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../config/db.php";

$action = $_GET["action"] ?? "";

try {
    if ($action === "list") {
        $sql = "
            SELECT 
                id, name, email, phone, address, role, status, created_at
            FROM users
            ORDER BY created_at DESC
        ";

        $result = $conn->query($sql);
        $users = [];

        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }

        echo json_encode([
            "success" => true,
            "data" => $users
        ]);
        exit;
    }

    if ($action === "update_status") {
        $input = json_decode(file_get_contents("php://input"), true);

        $id = (int)($input["id"] ?? 0);
        $status = strtolower(trim($input["status"] ?? ""));

        if ($id <= 0 || !in_array($status, ["active", "blocked"])) {
            echo json_encode([
                "success" => false,
                "message" => "Invalid user or status."
            ]);
            exit;
        }

        $stmt = $conn->prepare("UPDATE users SET status = ? WHERE id = ?");
        $stmt->bind_param("si", $status, $id);
        $stmt->execute();

        echo json_encode([
            "success" => true,
            "message" => "User status updated."
        ]);
        exit;
    }

    if ($action === "orders") {
        $userId = (int)($_GET["user_id"] ?? 0);

        $stmt = $conn->prepare("
            SELECT id, order_number, customer_name, city, total, status, created_at
            FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
        ");

        $stmt->bind_param("i", $userId);
        $stmt->execute();

        $result = $stmt->get_result();
        $orders = [];

        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        echo json_encode([
            "success" => true,
            "data" => $orders
        ]);
        exit;
    }

    echo json_encode([
        "success" => false,
        "message" => "Invalid action."
    ]);

} catch (Throwable $e) {
    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}
?>
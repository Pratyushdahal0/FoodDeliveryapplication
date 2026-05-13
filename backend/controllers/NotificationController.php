<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set("Asia/Kathmandu");

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once("../config/db.php");
require_once("../models/Notification.php");

$notificationModel = new Notification($conn);

$action = $_GET["action"] ?? "";

try {
    switch ($action) {
        case "list":
            $email = trim($_GET["email"] ?? "");
            $role = trim($_GET["role"] ?? "customer");
            $limit = intval($_GET["limit"] ?? 30);

            if (!$email) {
                echo json_encode([
                    "success" => false,
                    "message" => "email required"
                ]);
                break;
            }

            $notifications = $notificationModel->getForUser($email, $role, $limit);
            $unreadCount = $notificationModel->getUnreadCount($email, $role);

            echo json_encode([
                "success" => true,
                "data" => $notifications,
                "unread_count" => $unreadCount
            ]);
            break;

        case "mark_all_read":
            $data = json_decode(file_get_contents("php://input"), true);

            $email = trim($data["email"] ?? "");
            $role = trim($data["role"] ?? "customer");

            if (!$email) {
                echo json_encode([
                    "success" => false,
                    "message" => "email required"
                ]);
                break;
            }

            $success = $notificationModel->markAllRead($email, $role);

            echo json_encode([
                "success" => $success,
                "message" => $success ? "Notifications marked as read" : "Could not update notifications"
            ]);
            break;

        case "mark_read":
            $data = json_decode(file_get_contents("php://input"), true);

            $id = intval($data["id"] ?? 0);

            if (!$id) {
                echo json_encode([
                    "success" => false,
                    "message" => "notification id required"
                ]);
                break;
            }

            $success = $notificationModel->markOneRead($id);

            echo json_encode([
                "success" => $success,
                "message" => $success ? "Notification marked as read" : "Could not update notification"
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
        "message" => "Server error",
        "error" => $e->getMessage()
    ]);
}

$conn->close();
?>
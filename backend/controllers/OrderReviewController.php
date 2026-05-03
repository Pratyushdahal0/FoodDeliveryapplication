<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once("../config/db.php");
require_once("../models/OrderReview.php");

$reviewModel = new OrderReview($conn);
$action = $_GET["action"] ?? "";

try {
    switch ($action) {
        case "create":
            if ($_SERVER["REQUEST_METHOD"] !== "POST") {
                echo json_encode([
                    "success" => false,
                    "message" => "POST method required"
                ]);
                break;
            }

            $data = json_decode(file_get_contents("php://input"), true);

            if (!$data) {
                echo json_encode([
                    "success" => false,
                    "message" => "Invalid JSON body"
                ]);
                break;
            }

            $result = $reviewModel->create($data);
            echo json_encode($result);
            break;

        case "by_order":
            $orderNumber = trim($_GET["order_number"] ?? "");

            if (!$orderNumber) {
                echo json_encode([
                    "success" => false,
                    "message" => "order_number required"
                ]);
                break;
            }

            $review = $reviewModel->getByOrderNumber($orderNumber);

            echo json_encode([
                "success" => true,
                "data" => $review
            ]);
            break;

        case "restaurant":
            $restaurantId = intval($_GET["restaurant_id"] ?? 0);
            $limit = intval($_GET["limit"] ?? 20);

            if (!$restaurantId) {
                echo json_encode([
                    "success" => false,
                    "message" => "restaurant_id required"
                ]);
                break;
            }

            echo json_encode([
                "success" => true,
                "data" => $reviewModel->getForRestaurant($restaurantId, $limit)
            ]);
            break;

        case "rider":
            $riderId = intval($_GET["rider_id"] ?? 0);
            $limit = intval($_GET["limit"] ?? 20);

            if (!$riderId) {
                echo json_encode([
                    "success" => false,
                    "message" => "rider_id required"
                ]);
                break;
            }

            echo json_encode([
                "success" => true,
                "data" => $reviewModel->getForRider($riderId, $limit)
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
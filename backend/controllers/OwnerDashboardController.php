<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET");
header("Access-Control-Allow-Headers: Content-Type");

require "../config/db.php";
require "../models/Order.php";

$orderModel = new Order($conn);

$restaurantId = intval($_GET['restaurant_id'] ?? 0);

if (!$restaurantId) {
    echo json_encode([
        "success" => false,
        "message" => "restaurant_id required"
    ]);
    exit;
}

try {
    $data = [
        "total_orders" => $orderModel->getTotalOrdersByRestaurant($restaurantId),
        "total_earnings" => $orderModel->getTotalEarningsByRestaurant($restaurantId),
        "active_orders" => $orderModel->getActiveOrdersByRestaurant($restaurantId),
        "pending_orders" => $orderModel->getPendingOrdersByRestaurant($restaurantId),
        "weekly_earnings" => $orderModel->getWeeklyEarningsByRestaurant($restaurantId),
        "recent_orders" => $orderModel->getRecentOrdersByRestaurant($restaurantId, 5)
    ];

    echo json_encode([
        "success" => true,
        "data" => $data
    ]);
} catch (Throwable $e) {
    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}

$conn->close();
?>
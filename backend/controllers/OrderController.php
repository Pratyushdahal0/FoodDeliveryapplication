<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type");

require "../config/db.php";
require "../models/Order.php";

$order = new Order($conn);
$action = $_GET['action'] ?? '';

switch ($action) {

    // CREATE a new order
    case 'create':
        $input = json_decode(file_get_contents("php://input"), true);
        
        if (!isset($input['customer_name'], $input['phone_number'], $input['address'], $input['city'], $input['postal_code'], $input['payment_method'], $input['total'])) {
            echo json_encode([
                "success" => false,
                "message" => "Missing required fields"
            ]);
            break;
        }

        $result = $order->create($input);
        
        if ($result['success']) {
            $order_id = $result['order_id'];
            
            // Add items to order
            if (isset($input['items']) && is_array($input['items'])) {
                $order->addItems($order_id, $input['items']);
            }
        }

        echo json_encode($result);
        break;

    // GET order by ID
    case 'single':
        $order_id = $_GET['id'] ?? null;
        if (!$order_id) {
            echo json_encode(["success" => false, "message" => "Order ID required"]);
            break;
        }

        $order_data = $order->getById($order_id);
        if ($order_data) {
            $order_data['items'] = $order->getItems($order_id);
            echo json_encode([
                "success" => true,
                "data" => $order_data
            ]);
        } else {
            echo json_encode(["success" => false, "message" => "Order not found"]);
        }
        break;

    // GET order by order number
    case 'by_number':
        $order_number = $_GET['order_number'] ?? null;
        if (!$order_number) {
            echo json_encode(["success" => false, "message" => "Order number required"]);
            break;
        }

        $order_data = $order->getByOrderNumber($order_number);
        if ($order_data) {
            $order_data['items'] = $order->getItems($order_data['id']);
            echo json_encode([
                "success" => true,
                "data" => $order_data
            ]);
        } else {
            echo json_encode(["success" => false, "message" => "Order not found"]);
        }
        break;

    // GET all orders
    case 'all':
        $limit = $_GET['limit'] ?? 50;
        $offset = $_GET['offset'] ?? 0;
        $orders = $order->getAll($limit, $offset);
        
        echo json_encode([
            "success" => true,
            "data" => $orders,
            "count" => count($orders)
        ]);
        break;

    // GET orders by status
    case 'by_status':
        $status = $_GET['status'] ?? null;
        if (!$status) {
            echo json_encode(["success" => false, "message" => "Status required"]);
            break;
        }

        $orders = $order->getByStatus($status);
        echo json_encode([
            "success" => true,
            "data" => $orders,
            "count" => count($orders)
        ]);
        break;

    // UPDATE order status
    case 'update_status':
        $input = json_decode(file_get_contents("php://input"), true);
        
        if (!isset($input['order_id'], $input['status'])) {
            echo json_encode(["success" => false, "message" => "Order ID and status required"]);
            break;
        }

        $result = $order->updateStatus($input['order_id'], $input['status']);
        echo json_encode([
            "success" => $result,
            "message" => $result ? "Status updated" : "Failed to update status"
        ]);
        break;

    // GET total sales
    case 'total_sales':
        $total_sales = $order->getTotalSales();
        echo json_encode([
            "success" => true,
            "total_sales" => $total_sales
        ]);
        break;

    // GET orders count
    case 'count':
        $count = $order->getOrdersCount();
        echo json_encode([
            "success" => true,
            "count" => $count
        ]);
        break;

    default:
        echo json_encode([
            "success" => false,
            "message" => "Invalid action. Available actions: create, single, by_number, all, by_status, update_status, total_sales, count"
        ]);
        break;
}
?>

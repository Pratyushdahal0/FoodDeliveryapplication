<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function sendJsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit();
}

function sendErrorResponse($message, $statusCode = 500) {
    sendJsonResponse([
        "success" => false,
        "message" => $message
    ], $statusCode);
}

$basePath = __DIR__ . '/../';

$dbConfigPath = $basePath . 'config/db.php';
if (!file_exists($dbConfigPath)) {
    sendErrorResponse("Database configuration file not found: " . $dbConfigPath, 500);
}

include $dbConfigPath;

if (!isset($conn)) {
    sendErrorResponse("Database connection not established. Please check your database configuration.", 500);
}

if ($conn->connect_error) {
    sendErrorResponse("Database connection failed: " . $conn->connect_error, 500);
}

$orderModelPath = $basePath . 'models/Order.php';
if (!file_exists($orderModelPath)) {
    sendErrorResponse("Order model file not found: " . $orderModelPath, 500);
}

include $orderModelPath;

$order = new Order($conn);
$action = $_GET['action'] ?? '';

switch ($action) {

    // CREATE new order(s) - supports multi-restaurant cart
    case 'create':
        $input = json_decode(file_get_contents("php://input"), true);

        if (
            !isset(
                $input['customer_name'],
                $input['phone_number'],
                $input['address'],
                $input['city'],
                $input['postal_code'],
                $input['payment_method'],
                $input['items']
            )
        ) {
            echo json_encode([
                "success" => false,
                "message" => "Missing required fields"
            ]);
            break;
        }

        $items = $input['items'];

        if (!is_array($items) || count($items) === 0) {
            echo json_encode([
                "success" => false,
                "message" => "Cart is empty"
            ]);
            break;
        }

        $groupedItems = [];

        foreach ($items as $item) {
            if (!isset($item['restaurant_id'])) {
                continue;
            }

            $restaurantId = intval($item['restaurant_id']);

            if (!isset($groupedItems[$restaurantId])) {
                $groupedItems[$restaurantId] = [];
            }

            $groupedItems[$restaurantId][] = $item;
        }

        if (count($groupedItems) === 0) {
            echo json_encode([
                "success" => false,
                "message" => "No valid restaurant_id found in cart items"
            ]);
            break;
        }

        $createdOrders = [];
        $failedOrders = [];

        foreach ($groupedItems as $restaurantId => $restaurantItems) {
            $subtotal = 0;

            foreach ($restaurantItems as $item) {
                $price = isset($item['price']) ? floatval($item['price']) : 0;
                $quantity = isset($item['quantity']) ? intval($item['quantity']) : 1;
                $subtotal += $price * $quantity;
            }

            $tax = isset($input['tax_rate']) ? $subtotal * floatval($input['tax_rate']) : $subtotal * 0.10;
            $delivery_fee = isset($input['delivery_fee']) ? floatval($input['delivery_fee']) : 5.00;
            $total = $subtotal + $tax + $delivery_fee;

            $orderData = [
                "user_id" => $input['user_id'] ?? null,
                "restaurant_id" => $restaurantId,
                "customer_name" => $input['customer_name'],
                "phone_number" => $input['phone_number'],
                "address" => $input['address'],
                "city" => $input['city'],
                "postal_code" => $input['postal_code'],
                "payment_method" => $input['payment_method'],
                "subtotal" => $subtotal,
                "tax" => $tax,
                "delivery_fee" => $delivery_fee,
                "total" => $total,
                "notes" => $input['notes'] ?? null,
                "status" => $input['status'] ?? 'pending'
            ];

            $result = $order->create($orderData);

            if ($result['success']) {
                $order_id = $result['order_id'];
                $itemsAdded = $order->addItems($order_id, $restaurantItems);

                if ($itemsAdded) {
                    $createdOrders[] = [
                        "order_id" => $order_id,
                        "order_number" => $result['order_number'],
                        "restaurant_id" => $restaurantId,
                        "items_count" => count($restaurantItems),
                        "subtotal" => $subtotal,
                        "tax" => $tax,
                        "delivery_fee" => $delivery_fee,
                        "total" => $total
                    ];
                } else {
                    $failedOrders[] = [
                        "restaurant_id" => $restaurantId,
                        "message" => "Order created but failed to add items"
                    ];
                }
            } else {
                $failedOrders[] = [
                    "restaurant_id" => $restaurantId,
                    "message" => $result['message'] ?? "Failed to create order"
                ];
            }
        }

        echo json_encode([
            "success" => count($createdOrders) > 0,
            "message" => count($createdOrders) > 0
                ? "Order(s) created successfully"
                : "Failed to create order(s)",
            "orders" => $createdOrders,
            "failed_orders" => $failedOrders
        ]);
        break;

    // GET order by ID
    case 'single':
        $order_id = $_GET['id'] ?? null;

        if (!$order_id) {
            echo json_encode([
                "success" => false,
                "message" => "Order ID required"
            ]);
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
            echo json_encode([
                "success" => false,
                "message" => "Order not found"
            ]);
        }
        break;

    // GET order by order number
    case 'by_number':
        $order_number = $_GET['order_number'] ?? null;

        if (!$order_number) {
            echo json_encode([
                "success" => false,
                "message" => "Order number required"
            ]);
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
            echo json_encode([
                "success" => false,
                "message" => "Order not found"
            ]);
        }
        break;

    // GET all orders
    case 'all':
        $limit = intval($_GET['limit'] ?? 50);
        $offset = intval($_GET['offset'] ?? 0);

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
            echo json_encode([
                "success" => false,
                "message" => "Status required"
            ]);
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
            echo json_encode([
                "success" => false,
                "message" => "Order ID and status required"
            ]);
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

$conn->close();
?>
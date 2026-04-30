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

function cleanText($value) {
    return htmlspecialchars($value ?? "", ENT_QUOTES, "UTF-8");
}

function formatMoney($amount) {
    return number_format(floatval($amount), 2);
}

function formatPaymentMethod($method) {
    $map = [
        "cash" => "Cash on Delivery",
        "card" => "Card Payment",
        "digital" => "Digital Wallet"
    ];

    return $map[$method] ?? $method;
}

function queueEmail($conn, $ticketId, $toEmail, $toName, $subject, $body, $emailType = "other") {
    $stmt = $conn->prepare("
        INSERT INTO email_queue (
            ticket_id,
            to_email,
            to_name,
            subject,
            body,
            email_type,
            status,
            attempts,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NOW())
    ");

    if (!$stmt) {
        throw new Exception("Email queue prepare failed: " . $conn->error);
    }

    $stmt->bind_param(
        "isssss",
        $ticketId,
        $toEmail,
        $toName,
        $subject,
        $body,
        $emailType
    );

    return $stmt->execute();
}

function buildOrderItemsHtml($items) {
    $html = "";

    foreach ($items as $item) {
        $name = cleanText($item['name'] ?? $item['product_name'] ?? "Food item");
        $quantity = intval($item['quantity'] ?? 1);
        $price = floatval($item['price'] ?? 0);
        $lineTotal = $price * $quantity;

        $html .= "
            <tr>
                <td style='padding:10px 0; border-bottom:1px solid #eee;'>{$name}</td>
                <td style='padding:10px 0; border-bottom:1px solid #eee; text-align:center;'>x{$quantity}</td>
                <td style='padding:10px 0; border-bottom:1px solid #eee; text-align:right;'>Rs. " . formatMoney($lineTotal) . "</td>
            </tr>
        ";
    }

    return $html;
}

function queueOrderConfirmationEmail($conn, $orderId, $orderNumber, $input, $restaurantId, $restaurantItems, $subtotal, $tax, $deliveryFee, $total) {
    $customerEmail = trim($input['customer_email'] ?? "");

    if ($customerEmail === "" || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $customerName = trim($input['customer_name'] ?? "FoodExpress Customer");
    if ($customerName === "") {
        $customerName = "FoodExpress Customer";
    }

    $restaurantName = trim($input['restaurant_name'] ?? "");
    if ($restaurantName === "") {
        foreach ($restaurantItems as $item) {
            if (!empty($item['restaurant_name'])) {
                $restaurantName = $item['restaurant_name'];
                break;
            }
        }
    }

    if ($restaurantName === "") {
        $restaurantName = "Restaurant #" . $restaurantId;
    }

    $addressParts = array_filter([
        $input['address'] ?? "",
        $input['city'] ?? "",
        $input['postal_code'] ?? ""
    ]);

    $deliveryAddress = implode(", ", $addressParts);
    $deliveryNote = trim($input['delivery_note'] ?? $input['notes'] ?? "");
    $paymentMethod = formatPaymentMethod($input['payment_method'] ?? "cash");

    $safeCustomerName = cleanText($customerName);
    $safeOrderNumber = cleanText($orderNumber);
    $safeRestaurantName = cleanText($restaurantName);
    $safeDeliveryAddress = cleanText($deliveryAddress);
    $safeDeliveryNote = cleanText($deliveryNote);
    $safePaymentMethod = cleanText($paymentMethod);

    $itemsHtml = buildOrderItemsHtml($restaurantItems);

    $subject = "Your FoodExpress order has been received - {$orderNumber}";

    $body = "
        <div style='font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;'>
            <div style='max-width:680px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;'>
                <h2 style='color:#e53935; margin-top:0;'>Your FoodExpress order has been received</h2>

                <p>Hello {$safeCustomerName},</p>

                <p style='line-height:1.6;'>
                    Thank you for ordering from FoodExpress. We have received your order and it is now waiting for restaurant processing.
                </p>

                <div style='background:#fff5f5; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:20px 0;'>
                    <p style='margin:0;'><strong>Order Number:</strong> {$safeOrderNumber}</p>
                    <p style='margin:8px 0 0;'><strong>Order Status:</strong> Pending</p>
                    <p style='margin:8px 0 0;'><strong>Driver Status:</strong> Waiting for rider assignment</p>
                    <p style='margin:8px 0 0;'><strong>Restaurant:</strong> {$safeRestaurantName}</p>
                    <p style='margin:8px 0 0;'><strong>Payment Method:</strong> {$safePaymentMethod}</p>
                </div>

                <h3 style='margin-bottom:10px;'>Order Items</h3>

                <table style='width:100%; border-collapse:collapse;'>
                    <thead>
                        <tr>
                            <th style='text-align:left; padding:10px 0; border-bottom:2px solid #eee;'>Item</th>
                            <th style='text-align:center; padding:10px 0; border-bottom:2px solid #eee;'>Qty</th>
                            <th style='text-align:right; padding:10px 0; border-bottom:2px solid #eee;'>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$itemsHtml}
                    </tbody>
                </table>

                <div style='margin-top:20px; background:#f9fafb; border-radius:12px; padding:16px;'>
                    <p style='margin:0 0 8px;'><strong>Subtotal:</strong> Rs. " . formatMoney($subtotal) . "</p>
                    <p style='margin:0 0 8px;'><strong>Tax:</strong> Rs. " . formatMoney($tax) . "</p>
                    <p style='margin:0 0 8px;'><strong>Delivery Fee:</strong> Rs. " . formatMoney($deliveryFee) . "</p>
                    <p style='margin:0; font-size:18px;'><strong>Total:</strong> Rs. " . formatMoney($total) . "</p>
                </div>

                <h3 style='margin-top:22px; margin-bottom:8px;'>Delivery Details</h3>
                <p style='line-height:1.6; margin:0;'>
                    <strong>Address:</strong> {$safeDeliveryAddress}
                </p>
                " . ($safeDeliveryNote !== "" ? "<p style='line-height:1.6; margin:8px 0 0;'><strong>Delivery Note:</strong> {$safeDeliveryNote}</p>" : "") . "

                <p style='line-height:1.6; margin-top:22px;'>
                    You can track your order from your FoodExpress account.
                </p>

                <p style='margin-top:24px;'>
                    Kind regards,<br>
                    <strong>FoodExpress Team</strong><br>
                    foodexpressnp.support@gmail.com
                </p>
            </div>
        </div>
    ";

    return queueEmail(
        $conn,
        null,
        $customerEmail,
        $customerName,
        $subject,
        $body,
        "order_confirmation"
    );
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
                $input['customer_email'],
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

        if (!filter_var($input['customer_email'], FILTER_VALIDATE_EMAIL)) {
            echo json_encode([
                "success" => false,
                "message" => "Please provide a valid customer email address."
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

            $discountAmount = isset($input['discount_amount']) ? floatval($input['discount_amount']) : 0;
            $total = max(0, $subtotal + $tax + $delivery_fee - $discountAmount);

            $orderData = [
                "user_id" => $input['user_id'] ?? null,
                "restaurant_id" => $restaurantId,
                "customer_name" => $input['customer_name'],
                "customer_email" => $input['customer_email'],
                "phone_number" => $input['phone_number'],
                "address" => $input['address'],
                "city" => $input['city'],
                "postal_code" => $input['postal_code'],
                "payment_method" => $input['payment_method'],
                "subtotal" => $subtotal,
                "tax" => $tax,
                "delivery_fee" => $delivery_fee,
                "total" => $total,
                "notes" => $input['delivery_note'] ?? $input['notes'] ?? null,
                "status" => $input['status'] ?? 'pending'
            ];

            $result = $order->create($orderData);

            if ($result['success']) {
                $order_id = $result['order_id'];
                $itemsAdded = $order->addItems($order_id, $restaurantItems);

                if ($itemsAdded) {
                    $emailQueued = false;

                    try {
                        $emailQueued = queueOrderConfirmationEmail(
                            $conn,
                            $order_id,
                            $result['order_number'],
                            $input,
                            $restaurantId,
                            $restaurantItems,
                            $subtotal,
                            $tax,
                            $delivery_fee,
                            $total
                        );
                    } catch (Exception $emailException) {
                        $emailQueued = false;
                    }

                    $createdOrders[] = [
                        "order_id" => $order_id,
                        "order_number" => $result['order_number'],
                        "restaurant_id" => $restaurantId,
                        "items_count" => count($restaurantItems),
                        "subtotal" => $subtotal,
                        "tax" => $tax,
                        "delivery_fee" => $delivery_fee,
                        "total" => $total,
                        "email_queued" => $emailQueued
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

        $firstOrder = $createdOrders[0] ?? null;

        echo json_encode([
            "success" => count($createdOrders) > 0,
            "message" => count($createdOrders) > 0
                ? "Order(s) created successfully"
                : "Failed to create order(s)",
            "order_id" => $firstOrder["order_id"] ?? null,
            "order_number" => $firstOrder["order_number"] ?? null,
            "email_queued" => $firstOrder["email_queued"] ?? false,
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
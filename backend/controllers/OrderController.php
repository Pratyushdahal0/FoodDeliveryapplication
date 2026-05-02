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

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

require_once __DIR__ . "/../helpers/MailHelper.php";

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

/*
|--------------------------------------------------------------------------
| Queue Email + Send Immediately
|--------------------------------------------------------------------------
*/

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

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        throw new Exception("Email queue insert failed: " . $error);
    }

    $emailId = $stmt->insert_id;
    $stmt->close();

    try {
        if (!class_exists("MailHelper")) {
            throw new Exception("MailHelper class not found.");
        }

        $mailResult = MailHelper::sendMail(
            $toEmail,
            $toName ?: $toEmail,
            $subject,
            $body
        );

        if (!empty($mailResult["success"])) {
            $sentStmt = $conn->prepare("
                UPDATE email_queue
                SET 
                    status = 'sent',
                    attempts = attempts + 1,
                    last_error = NULL,
                    sent_at = NOW()
                WHERE id = ?
            ");

            if ($sentStmt) {
                $sentStmt->bind_param("i", $emailId);
                $sentStmt->execute();
                $sentStmt->close();
            }

            return true;
        }

        $errorMessage = $mailResult["error"] ?? "Unknown mail error";

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = attempts + 1,
                last_error = ?
            WHERE id = ?
        ");

        if ($failedStmt) {
            $failedStmt->bind_param("si", $errorMessage, $emailId);
            $failedStmt->execute();
            $failedStmt->close();
        }

        return false;
    } catch (Throwable $e) {
        $errorMessage = $e->getMessage();

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = attempts + 1,
                last_error = ?
            WHERE id = ?
        ");

        if ($failedStmt) {
            $failedStmt->bind_param("si", $errorMessage, $emailId);
            $failedStmt->execute();
            $failedStmt->close();
        }

        return false;
    }
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
                    Thank you for ordering from FoodExpress. We have received your order, sent it to the restaurant, and started looking for a nearby rider.
                </p>

                <div style='background:#fff5f5; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:20px 0;'>
                    <p style='margin:0;'><strong>Order Number:</strong> {$safeOrderNumber}</p>
                    <p style='margin:8px 0 0;'><strong>Order Status:</strong> Pending</p>
                    <p style='margin:8px 0 0;'><strong>Delivery Status:</strong> Looking for a nearby rider</p>
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

function queueOrderDeliveredEmail($conn, $orderData, $orderItems) {
    $customerEmail = trim($orderData['customer_email'] ?? "");

    if ($customerEmail === "" || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $customerName = trim($orderData['customer_name'] ?? "FoodExpress Customer");
    if ($customerName === "") {
        $customerName = "FoodExpress Customer";
    }

    $orderNumber = $orderData['order_number'] ?? "";
    $restaurantName = $orderData['restaurant_name'] ?? "Restaurant #" . ($orderData['restaurant_id'] ?? "");
    $paymentMethod = formatPaymentMethod($orderData['payment_method'] ?? "cash");
    $total = floatval($orderData['total'] ?? 0);
    $deliveredAt = date("M d, Y h:i A");

    $safeCustomerName = cleanText($customerName);
    $safeOrderNumber = cleanText($orderNumber);
    $safeRestaurantName = cleanText($restaurantName);
    $safePaymentMethod = cleanText($paymentMethod);
    $safeDeliveredAt = cleanText($deliveredAt);

    $itemsHtml = buildOrderItemsHtml($orderItems);

    $subject = "Your FoodExpress order has been delivered - {$orderNumber}";

    $body = "
        <div style='font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;'>
            <div style='max-width:680px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;'>
                <h2 style='color:#e53935; margin-top:0;'>Your FoodExpress order has been delivered</h2>

                <p>Hello {$safeCustomerName},</p>

                <p style='line-height:1.6;'>
                    Your FoodExpress order has been delivered successfully. Thank you for choosing FoodExpress.
                </p>

                <div style='background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:20px 0;'>
                    <p style='margin:0;'><strong>Order Number:</strong> {$safeOrderNumber}</p>
                    <p style='margin:8px 0 0;'><strong>Order Status:</strong> Delivered</p>
                    <p style='margin:8px 0 0;'><strong>Restaurant:</strong> {$safeRestaurantName}</p>
                    <p style='margin:8px 0 0;'><strong>Payment Method:</strong> {$safePaymentMethod}</p>
                    <p style='margin:8px 0 0;'><strong>Delivered At:</strong> {$safeDeliveredAt}</p>
                </div>

                <h3 style='margin-bottom:10px;'>Order Receipt</h3>

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
                    <p style='margin:0; font-size:18px;'>
                        <strong>Total:</strong> Rs. " . formatMoney($total) . "
                    </p>
                </div>

                <p style='line-height:1.6; margin-top:22px;'>
                    We hope you enjoyed your meal. You can view this order from your FoodExpress order history.
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
        "order_delivered"
    );
}

/*
|--------------------------------------------------------------------------
| Bootstrap DB + Model
|--------------------------------------------------------------------------
*/
function createAppNotification($notification, $data) {
    try {
        return $notification->create($data);
    } catch (Throwable $e) {
        return false;
    }
}

function createCustomerNotification($notification, $orderData, $type, $title, $message) {
    $customerEmail = trim($orderData["customer_email"] ?? "");

    if ($customerEmail === "") {
        return false;
    }

    return createAppNotification($notification, [
        "user_id" => $orderData["user_id"] ?? null,
        "user_email" => $customerEmail,
        "role" => "customer",
        "order_id" => intval($orderData["id"] ?? 0),
        "order_number" => $orderData["order_number"] ?? null,
        "type" => $type,
        "title" => $title,
        "message" => $message
    ]);
}

function createOwnerNotification($notification, $conn, $orderData, $type, $title, $message) {
    $restaurantId = intval($orderData["restaurant_id"] ?? 0);

    if (!$restaurantId) {
        return false;
    }

    $stmt = $conn->prepare("
        SELECT 
            r.owner_user_id,
            r.email AS restaurant_email,
            u.email AS owner_email
        FROM restaurants r
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        return false;
    }

    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();

    $result = $stmt->get_result();
    $restaurant = $result ? $result->fetch_assoc() : null;

    $stmt->close();

    if (!$restaurant) {
        return false;
    }

    $ownerEmail = trim($restaurant["owner_email"] ?? "");
    if ($ownerEmail === "") {
        $ownerEmail = trim($restaurant["restaurant_email"] ?? "");
    }

    if ($ownerEmail === "") {
        return false;
    }

    return createAppNotification($notification, [
        "user_id" => $restaurant["owner_user_id"] ?? null,
        "user_email" => $ownerEmail,
        "role" => "restaurant-owner",
        "order_id" => intval($orderData["id"] ?? 0),
        "order_number" => $orderData["order_number"] ?? null,
        "type" => $type,
        "title" => $title,
        "message" => $message
    ]);
}

function createRiderNotification($notification, $orderData, $type, $title, $message) {
    $riderEmail = trim($orderData["rider_email"] ?? "");

    if ($riderEmail === "") {
        return false;
    }

    return createAppNotification($notification, [
        "user_id" => $orderData["rider_id"] ?? null,
        "user_email" => $riderEmail,
        "role" => "delivery-rider",
        "order_id" => intval($orderData["id"] ?? 0),
        "order_number" => $orderData["order_number"] ?? null,
        "type" => $type,
        "title" => $title,
        "message" => $message
    ]);
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

$notificationModelPath = $basePath . 'models/Notification.php';
if (!file_exists($notificationModelPath)) {
    sendErrorResponse("Notification model file not found: " . $notificationModelPath, 500);
}

include $notificationModelPath;

$order = new Order($conn);
$notification = new Notification($conn);
$action = $_GET['action'] ?? '';

switch ($action) {

    /*
    |--------------------------------------------------------------------------
    | CREATE new order(s)
    |--------------------------------------------------------------------------
    */

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

            $tax = round($subtotal * 0.10, 2);

if ($subtotal <= 0) {
    $delivery_fee = 0.00;
} elseif ($subtotal >= 1500) {
    $delivery_fee = 0.00;
} elseif ($subtotal >= 1000) {
    $delivery_fee = 20.00;
} elseif ($subtotal >= 500) {
    $delivery_fee = 30.00;
} else {
    $delivery_fee = 50.00;
}

if (isset($input['delivery_fee'])) {
    $incomingDeliveryFee = floatval($input['delivery_fee']);

    if ($incomingDeliveryFee > 5 || $delivery_fee == 0.00) {
        $delivery_fee = round($incomingDeliveryFee, 2);
    }
}

$discountAmount = isset($input['discount_amount']) ? floatval($input['discount_amount']) : 0;
$total = round(max(0, $subtotal + $tax + $delivery_fee - $discountAmount), 2);

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
                "status" => $input['status'] ?? 'pending',
                "delivery_status" => $input['delivery_status'] ?? 'searching'
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
                    } catch (Throwable $emailException) {
                        $emailQueued = false;
                    }
                    $createdOrderData = $order->getById($order_id);

if ($createdOrderData) {
    createCustomerNotification(
        $notification,
        $createdOrderData,
        "order_placed",
        "Order placed",
        "Your order " . $result['order_number'] . " was sent to the restaurant."
    );

    createOwnerNotification(
        $notification,
        $conn,
        $createdOrderData,
        "new_order",
        "New order received",
        "A new order " . $result['order_number'] . " has been placed for your restaurant."
    );
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
                        "email_queued" => $emailQueued,
                        "delivery_status" => $result['delivery_status'] ?? 'searching'
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
            "delivery_status" => $firstOrder["delivery_status"] ?? "searching",
            "orders" => $createdOrders,
            "failed_orders" => $failedOrders
        ]);
        break;

    /*
    |--------------------------------------------------------------------------
    | GET order by ID
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | GET order by order number
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | GET all orders
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | GET orders by status
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | GET available deliveries for riders
    |--------------------------------------------------------------------------
    */

    case 'available_deliveries':
        try {
            $sql = "
                SELECT
                    o.id,
                    o.order_number,
                    o.restaurant_id,
                    r.restaurant_name,
                    r.location AS restaurant_address,
                    r.city AS restaurant_city,
                    o.customer_name,
                    o.customer_email,
                    o.phone_number,
                    o.address,
                    o.city,
                    o.postal_code,
                    o.payment_method,
                    o.subtotal,
                    o.tax,
                    o.delivery_fee,
                    o.total,
                    o.notes,
                    o.status,
                    o.delivery_status,
                    o.rider_id,
                    o.rider_name,
                    o.rider_email,
                    o.rider_phone,
                    o.created_at,
                    o.updated_at
                FROM orders o
                LEFT JOIN restaurants r ON o.restaurant_id = r.id
                WHERE 
                    o.status = 'ready_for_pickup'
                    AND (
                        o.delivery_status IS NULL
                        OR o.delivery_status = ''
                        OR o.delivery_status = 'searching'
                        OR o.delivery_status = 'unassigned'
                        OR o.delivery_status = 'pending'
                    )
                ORDER BY o.created_at ASC
            ";

            $result = $conn->query($sql);

            if (!$result) {
                echo json_encode([
                    "success" => false,
                    "message" => "Failed to load available deliveries: " . $conn->error
                ]);
                break;
            }

            $deliveries = [];

            while ($row = $result->fetch_assoc()) {
                $items = $order->getItems($row["id"]);

                $restaurantName = $row["restaurant_name"] ?: ("Restaurant #" . $row["restaurant_id"]);
                $restaurantAddress = trim(($row["restaurant_address"] ?? "") . ", " . ($row["restaurant_city"] ?? ""));
                $restaurantAddress = trim($restaurantAddress, " ,");

                $deliveries[] = [
                    "id" => intval($row["id"]),
                    "orderId" => intval($row["id"]),
                    "order_id" => intval($row["id"]),

                    "orderNumber" => $row["order_number"],
                    "order_number" => $row["order_number"],

                    "restaurantId" => intval($row["restaurant_id"]),
                    "restaurant_id" => intval($row["restaurant_id"]),
                    "restaurantName" => $restaurantName,
                    "restaurant_name" => $restaurantName,
                    "restaurantAddress" => $restaurantAddress,
                    "restaurant_address" => $restaurantAddress,

                    "customerName" => $row["customer_name"],
                    "customer_name" => $row["customer_name"],
                    "customerEmail" => $row["customer_email"],
                    "customer_email" => $row["customer_email"],
                    "phoneNumber" => $row["phone_number"],
                    "phone_number" => $row["phone_number"],

                    "address" => $row["address"],
                    "city" => $row["city"],
                    "postalCode" => $row["postal_code"],
                    "postal_code" => $row["postal_code"],

                    "paymentMethod" => $row["payment_method"],
                    "payment_method" => $row["payment_method"],
                    "subtotal" => floatval($row["subtotal"]),
                    "tax" => floatval($row["tax"]),
                    "deliveryFee" => floatval($row["delivery_fee"]),
                    "delivery_fee" => floatval($row["delivery_fee"]),
                    "total" => floatval($row["total"]),
                    "notes" => $row["notes"],

                    "status" => $row["status"],
                    "deliveryStatus" => $row["delivery_status"] ?: "searching",
                    "delivery_status" => $row["delivery_status"] ?: "searching",

                    "riderId" => $row["rider_id"],
                    "rider_id" => $row["rider_id"],
                    "riderName" => $row["rider_name"],
                    "rider_name" => $row["rider_name"],

                    "createdAt" => $row["created_at"],
                    "created_at" => $row["created_at"],
                    "updatedAt" => $row["updated_at"],
                    "updated_at" => $row["updated_at"],

                    "items" => $items
                ];
            }

            echo json_encode([
                "success" => true,
                "data" => $deliveries,
                "count" => count($deliveries)
            ]);
        } catch (Throwable $e) {
            echo json_encode([
                "success" => false,
                "message" => $e->getMessage()
            ]);
        }

        break;

    /*
    |--------------------------------------------------------------------------
    | UPDATE order status
    |--------------------------------------------------------------------------
    */

    case 'update_status':
    $input = json_decode(file_get_contents("php://input"), true);

    if (!isset($input['order_id'], $input['status'])) {
        echo json_encode([
            "success" => false,
            "message" => "Order ID and status required"
        ]);
        break;
    }

        $orderId = intval($input['order_id']);
        $newStatus = trim($input['status']);

        $existingOrder = $order->getById($orderId);

        if (!$existingOrder) {
            echo json_encode([
                "success" => false,
                "message" => "Order not found"
            ]);
            break;
        }

        $result = $order->updateStatus($orderId, $newStatus);

        $deliveredEmailQueued = false;

        if ($result && $newStatus === "delivered") {
            $alreadyQueued = intval($existingOrder['delivered_email_queued'] ?? 0) === 1;

            if (!$alreadyQueued) {
                $updatedOrder = $order->getById($orderId);
                $orderItems = $order->getItems($orderId);

                try {
                    $deliveredEmailQueued = queueOrderDeliveredEmail(
                        $conn,
                        $updatedOrder,
                        $orderItems
                    );

                    if ($deliveredEmailQueued) {
                        $markEmailStmt = $conn->prepare("
                            UPDATE orders
                            SET delivered_email_queued = 1
                            WHERE id = ?
                        ");

                        if ($markEmailStmt) {
                            $markEmailStmt->bind_param("i", $orderId);
                            $markEmailStmt->execute();
                            $markEmailStmt->close();
                        }
                    }
                } catch (Throwable $emailException) {
                    $deliveredEmailQueued = false;
                }
            }
        }

        echo json_encode([
            "success" => $result,
            "message" => $result ? "Status updated" : "Failed to update status",
            "delivered_email_queued" => $deliveredEmailQueued
        ]);
        break;

    /*
    |--------------------------------------------------------------------------
    | ASSIGN rider to order
    |--------------------------------------------------------------------------
    */

    case 'assign_rider':
    $input = json_decode(file_get_contents("php://input"), true);

    if (!isset($input['order_id'], $input['rider_id'], $input['rider_name'])) {
        echo json_encode([
            "success" => false,
            "message" => "Order ID, rider ID and rider name are required"
        ]);
        break;
    }

    $orderId = intval($input['order_id']);
    $riderId = intval($input['rider_id']);
    $riderName = trim($input['rider_name']);
    $riderEmail = trim($input['rider_email'] ?? "");
    $riderPhone = trim($input['rider_phone'] ?? "");

    $existingOrder = $order->getById($orderId);

    if (!$existingOrder) {
        echo json_encode([
            "success" => false,
            "message" => "Order not found"
        ]);
        break;
    }

    $result = $order->assignRider(
        $orderId,
        $riderId,
        $riderName,
        $riderEmail,
        $riderPhone
    );

    if ($result) {
        $updatedOrder = $order->getById($orderId);

        if ($updatedOrder) {
            $orderNumber = $updatedOrder["order_number"] ?? ("#" . $orderId);

            $riderDisplayName = trim($updatedOrder["rider_name"] ?? $riderName ?? "FoodExpress Rider");
$riderDisplayPhone = trim($updatedOrder["rider_phone"] ?? $riderPhone ?? "");

if ($riderDisplayName === "") {
    $riderDisplayName = "FoodExpress Rider";
}

$customerRiderMessage = $riderDisplayName . " is your rider for order " . $orderNumber . ". You can call or message your rider from tracking.";

if ($riderDisplayPhone !== "") {
    $customerRiderMessage = $riderDisplayName . " is your rider for order " . $orderNumber . ". Phone: " . $riderDisplayPhone . ". You can call or message your rider from tracking.";
}

createCustomerNotification(
    $notification,
    $updatedOrder,
    "rider_assigned",
    "Rider assigned",
    $customerRiderMessage
);

createOwnerNotification(
    $notification,
    $conn,
    $updatedOrder,
    "rider_assigned_owner",
    "Rider accepted pickup",
    $riderDisplayName . " accepted pickup for order " . $orderNumber . "."
);

createRiderNotification(
    $notification,
    $updatedOrder,
    "delivery_accepted",
    "Delivery accepted",
    "You accepted order " . $orderNumber . ". Pickup is from the restaurant."
);
        }
    }

    echo json_encode([
        "success" => $result,
        "message" => $result
            ? "Rider assigned successfully"
            : "Failed to assign rider"
    ]);
    break;

    /*
    |--------------------------------------------------------------------------
    | UPDATE delivery status from rider side
    |--------------------------------------------------------------------------
    */

    case 'update_delivery_status':
    $input = json_decode(file_get_contents("php://input"), true);

    if (!isset($input['order_id'], $input['delivery_status'])) {
        echo json_encode([
            "success" => false,
            "message" => "Order ID and delivery status are required"
        ]);
        break;
    }

    $orderId = intval($input['order_id']);
    $deliveryStatus = trim($input['delivery_status']);

    $allowedDeliveryStatuses = [
        "searching",
        "assigned",
        "picked_up",
        "on_the_way",
        "delivered"
    ];

    if (!in_array($deliveryStatus, $allowedDeliveryStatuses, true)) {
        echo json_encode([
            "success" => false,
            "message" => "Invalid delivery status"
        ]);
        break;
    }

    $existingOrder = $order->getById($orderId);

    if (!$existingOrder) {
        echo json_encode([
            "success" => false,
            "message" => "Order not found"
        ]);
        break;
    }

    $oldDeliveryStatus = $existingOrder["delivery_status"] ?? "";

    if ($deliveryStatus === "delivered") {
        $result = $order->markDelivered($orderId);
    } else {
        $result = $order->updateDeliveryStatus($orderId, $deliveryStatus);
    }

    if ($result && $oldDeliveryStatus !== $deliveryStatus) {
        $updatedOrder = $order->getById($orderId);

        if ($updatedOrder) {
            $orderNumber = $updatedOrder["order_number"] ?? ("#" . $orderId);
            $riderName = trim($updatedOrder["rider_name"] ?? "Your rider");

            if ($deliveryStatus === "picked_up") {
                createCustomerNotification(
                    $notification,
                    $updatedOrder,
                    "rider_picked_up",
                    "Order picked up",
                    $riderName . " picked up your order " . $orderNumber . "."
                );

                createOwnerNotification(
                    $notification,
                    $conn,
                    $updatedOrder,
                    "rider_picked_up_owner",
                    "Order picked up",
                    $riderName . " picked up order " . $orderNumber . "."
                );
            }

            if ($deliveryStatus === "on_the_way") {
                createCustomerNotification(
                    $notification,
                    $updatedOrder,
                    "rider_on_the_way",
                    "Rider on the way",
                    $riderName . " is on the way with your order " . $orderNumber . "."
                );
            }

            if ($deliveryStatus === "delivered") {
                createCustomerNotification(
                    $notification,
                    $updatedOrder,
                    "order_delivered",
                    "Order delivered",
                    "Your order " . $orderNumber . " was delivered successfully."
                );

                createOwnerNotification(
                    $notification,
                    $conn,
                    $updatedOrder,
                    "order_delivered_owner",
                    "Order delivered",
                    "Order " . $orderNumber . " was delivered successfully."
                );

                createRiderNotification(
                    $notification,
                    $updatedOrder,
                    "delivery_completed",
                    "Delivery completed",
                    "Delivery for order " . $orderNumber . " was completed. Earnings added."
                );
            }
        }
    }

    echo json_encode([
        "success" => $result,
        "message" => $result
            ? ($deliveryStatus === "delivered" ? "Delivery completed" : "Delivery status updated")
            : "Failed to update delivery status"
    ]);
    break;

        $result = $order->updateDeliveryStatus($orderId, $deliveryStatus);

        echo json_encode([
            "success" => $result,
            "message" => $result ? "Delivery status updated" : "Failed to update delivery status"
        ]);
        break;

    /*
    |--------------------------------------------------------------------------
    | GET total sales
    |--------------------------------------------------------------------------
    */

    case 'total_sales':
        $total_sales = $order->getTotalSales();

        echo json_encode([
            "success" => true,
            "total_sales" => $total_sales
        ]);
        break;

    /*
    |--------------------------------------------------------------------------
    | GET orders count
    |--------------------------------------------------------------------------
    */

    case 'count':
        $count = $order->getOrdersCount();

        echo json_encode([
            "success" => true,
            "count" => $count
        ]);
        break;
case 'active_delivery':
    $riderId = intval($_GET['rider_id'] ?? 0);

    if (!$riderId) {
        echo json_encode([
            "success" => false,
            "message" => "rider_id required"
        ]);
        break;
    }

    $activeOrder = $order->getActiveDeliveryByRider($riderId);

    if (!$activeOrder) {
        echo json_encode([
            "success" => true,
            "data" => null
        ]);
        break;
    }

    $activeOrder['items'] = $order->getItems($activeOrder['id']);

    echo json_encode([
        "success" => true,
        "data" => $activeOrder
    ]);
    break;
    default:
        echo json_encode([
            "success" => false,
            "message" => "Invalid action. Available actions: create, single, by_number, all, by_status, available_deliveries, update_status, assign_rider, update_delivery_status, total_sales, count"
        ]);
        break;
}

$conn->close();
?>
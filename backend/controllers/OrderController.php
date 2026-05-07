<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set("Asia/Kathmandu");

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
    $method = strtolower(trim($method ?? "cash"));

    $map = [
        "cash" => "Cash on Delivery",
        "cod" => "Cash on Delivery",
        "card" => "Card Payment",
        "digital" => "Digital Wallet",
        "wallet" => "Digital Wallet",
        "esewa" => "eSewa",
        "khalti" => "Khalti"
    ];

    return $map[$method] ?? ucwords(str_replace("_", " ", $method));
}

function formatStatusLabel($status) {
    $status = trim($status ?? "");
    if ($status === "") return "Pending";
    return ucwords(str_replace("_", " ", $status));
}

function getDeliveryStatusLabel($status) {
    $status = strtolower(trim($status ?? ""));

    $map = [
        "searching" => "Looking for a nearby rider",
        "unassigned" => "Looking for a nearby rider",
        "pending" => "Waiting for restaurant confirmation",
        "assigned" => "Rider assigned",
        "picked_up" => "Picked up by rider",
        "on_the_way" => "Rider is on the way",
        "delivered" => "Delivered"
    ];

    return $map[$status] ?? formatStatusLabel($status);
}

function timeToMinutesSafe($time) {
    if (!$time) {
        return null;
    }

    $parts = explode(":", $time);
    $hour = isset($parts[0]) ? intval($parts[0]) : null;
    $minute = isset($parts[1]) ? intval($parts[1]) : 0;

    if ($hour === null || $hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
        return null;
    }

    return ($hour * 60) + $minute;
}

function isRestaurantInsideOpeningHours($restaurant) {
    $openingTime = $restaurant["opening_time"] ?? null;
    $closingTime = $restaurant["closing_time"] ?? null;

    if (!$openingTime || !$closingTime) {
        return true;
    }

    $openMinutes = timeToMinutesSafe($openingTime);
    $closeMinutes = timeToMinutesSafe($closingTime);

    if ($openMinutes === null || $closeMinutes === null) {
        return true;
    }

    if ($openMinutes === $closeMinutes) {
        return true;
    }

    $currentMinutes = (intval(date("G")) * 60) + intval(date("i"));

    if ($openMinutes < $closeMinutes) {
        return $currentMinutes >= $openMinutes && $currentMinutes <= $closeMinutes;
    }

    return $currentMinutes >= $openMinutes || $currentMinutes <= $closeMinutes;
}

function formatRestaurantTimeSafe($time) {
    $minutes = timeToMinutesSafe($time);

    if ($minutes === null) {
        return "soon";
    }

    $hour24 = intdiv($minutes, 60);
    $minute = $minutes % 60;
    $suffix = $hour24 >= 12 ? "PM" : "AM";
    $hour12 = $hour24 % 12;

    if ($hour12 === 0) {
        $hour12 = 12;
    }

    return $hour12 . ":" . str_pad((string)$minute, 2, "0", STR_PAD_LEFT) . " " . $suffix;
}

function calculateBackendSmartEta($restaurant, $items) {
    $itemCount = 0;

    foreach ($items as $item) {
        $itemCount += intval($item["quantity"] ?? 1);
    }

    $basePrep = intval($restaurant["estimated_prep_minutes"] ?? 25);
    $handoff = intval($restaurant["avg_handoff_minutes"] ?? 5);
    $radius = floatval($restaurant["delivery_radius_km"] ?? 5);
    $busyExtra = intval($restaurant["busy_mode"] ?? 0) === 1 ? 8 : 0;
    $itemExtra = max(0, $itemCount - 1) * 2;
    $travelEstimate = intval(ceil($radius * 1.5));

    $min = max(15, $basePrep + $handoff + $busyExtra + $itemExtra + $travelEstimate);
    $max = $min + 12;

    return $min . "–" . $max . " min";
}

function getRestaurantCheckoutStatus($conn, $restaurantId, $items = []) {
    $stmt = $conn->prepare("
        SELECT
            id,
            restaurant_name,
            status,
            is_open,
            accepting_orders,
            delivery_available,
            busy_mode,
            opening_time,
            closing_time,
            estimated_prep_minutes,
            avg_handoff_minutes,
            delivery_radius_km,
            min_order_amount,
            packaging_fee
        FROM restaurants
        WHERE id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        return [
            "success" => false,
            "can_checkout" => false,
            "message" => "Restaurant status check failed: " . $conn->error
        ];
    }

    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();

    $result = $stmt->get_result();
    $restaurant = $result ? $result->fetch_assoc() : null;

    $stmt->close();

    if (!$restaurant) {
        return [
            "success" => false,
            "can_checkout" => false,
            "message" => "Restaurant not found."
        ];
    }

    if (($restaurant["status"] ?? "") !== "approved") {
        return [
            "success" => true,
            "can_checkout" => false,
            "key" => "not_approved",
            "label" => "Restaurant unavailable",
            "message" => "This restaurant is not available for orders right now."
        ];
    }

    $isOpen = intval($restaurant["is_open"] ?? 1) === 1;
    $acceptingOrders = intval($restaurant["accepting_orders"] ?? 1) === 1;
    $deliveryAvailable = intval($restaurant["delivery_available"] ?? 1) === 1;
    $insideHours = isRestaurantInsideOpeningHours($restaurant);

    if (!$isOpen || !$insideHours) {
        return [
            "success" => true,
            "can_checkout" => false,
            "key" => "closed",
            "label" => "Restaurant closed",
            "restaurant" => $restaurant,
            "message" => "This restaurant is closed. Opens at " . formatRestaurantTimeSafe($restaurant["opening_time"] ?? "09:00:00") . "."
        ];
    }

    if (!$acceptingOrders) {
        return [
            "success" => true,
            "can_checkout" => false,
            "key" => "paused",
            "label" => "Not accepting orders",
            "restaurant" => $restaurant,
            "message" => "This restaurant is not accepting new orders right now."
        ];
    }

    if (!$deliveryAvailable) {
        return [
            "success" => true,
            "can_checkout" => false,
            "key" => "delivery_off",
            "label" => "Delivery unavailable",
            "restaurant" => $restaurant,
            "message" => "Delivery is unavailable for this restaurant right now."
        ];
    }

    $etaLabel = calculateBackendSmartEta($restaurant, $items);

    if (intval($restaurant["busy_mode"] ?? 0) === 1) {
        return [
            "success" => true,
            "can_checkout" => true,
            "key" => "busy",
            "label" => "Kitchen busy",
            "restaurant" => $restaurant,
            "eta_label" => $etaLabel,
            "message" => "Restaurant is accepting orders, but ETA is longer than usual: " . $etaLabel . "."
        ];
    }

    return [
        "success" => true,
        "can_checkout" => true,
        "key" => "open",
        "label" => "Restaurant open",
        "restaurant" => $restaurant,
        "eta_label" => $etaLabel,
        "message" => "Restaurant is open. Estimated delivery " . $etaLabel . "."
    ];
}

function buildEmailHeader($subtitle, $variant = "coral") {
    if ($variant === "dark") {
        return "
            <div style='background:#12203A; padding:34px 38px; color:#ffffff;'>
                <div style='font-size:30px; line-height:1; font-weight:900; letter-spacing:-0.7px;'>
                    <span style='display:inline-block; width:15px; height:10px; background:#F2644C; border-radius:4px; margin-right:10px; vertical-align:middle;'></span>
                    FoodExpress
                </div>
                <p style='margin:12px 0 0; color:#dbe3ef; font-size:15px; line-height:1.6;'>{$subtitle}</p>
            </div>
        ";
    }

    return "
        <div style='background:linear-gradient(135deg,#F2644C,#F58A5C); padding:34px 38px; color:#ffffff;'>
            <div style='font-size:30px; line-height:1; font-weight:900; letter-spacing:-0.7px;'>
                FoodExpress
            </div>
            <p style='margin:12px 0 0; color:#fff4ef; font-size:15px; line-height:1.6;'>{$subtitle}</p>
        </div>
    ";
}

function buildEmailFooter() {
    return "
        <div style='background:#12203A; color:#dbe3ef; padding:24px 38px; text-align:center; font-size:13px; line-height:1.6;'>
            <p style='margin:0 0 6px; font-weight:800; color:#ffffff;'>FoodExpress</p>
            <p style='margin:0 0 6px;'>Fast delivery, reliable support.</p>
            <p style='margin:0;'>foodexpressnp.support@gmail.com</p>
        </div>
    ";
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
                <td style='padding:16px 0; border-bottom:1px solid #E9E2DC;'>
                    <div style='font-weight:800; color:#12203A; font-size:15px;'>{$name}</div>
                    <div style='color:#6B7280; font-size:13px; margin-top:4px;'>Rs. " . formatMoney($price) . " each</div>
                </td>
                <td style='padding:16px 0; border-bottom:1px solid #E9E2DC; text-align:center; color:#12203A; font-weight:700;'>x{$quantity}</td>
                <td style='padding:16px 0; border-bottom:1px solid #E9E2DC; text-align:right; color:#12203A; font-weight:800;'>Rs. " . formatMoney($lineTotal) . "</td>
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

    $subject = "FoodExpress order received - {$orderNumber}";

    $body = "
<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <title>FoodExpress Order Received</title>
</head>
<body style='margin:0; padding:0; background:#f6f7fb; font-family:Arial, Helvetica, sans-serif; color:#12203A;'>
  <div style='width:100%; background:#f6f7fb; padding:34px 14px;'>
    <div style='max-width:720px; margin:0 auto; background:#ffffff; border-radius:26px; overflow:hidden; box-shadow:0 18px 45px rgba(18,32,58,0.10);'>

      " . buildEmailHeader("Your order has been received and sent to the restaurant.", "coral") . "

      <div style='padding:38px;'>
        <div style='display:inline-block; background:#ECFDF3; color:#15803D; border:1px solid #BBF7D0; border-radius:999px; padding:9px 14px; font-size:13px; font-weight:800; margin-bottom:18px;'>
          Order received
        </div>

        <h1 style='margin:0 0 14px; font-size:30px; line-height:1.25; letter-spacing:-0.7px; color:#12203A;'>
          Thanks, {$safeCustomerName}. Your order is in progress.
        </h1>

        <p style='font-size:16px; line-height:1.75; margin:0 0 24px; color:#4B5563;'>
          We received your FoodExpress order, sent it to <strong>{$safeRestaurantName}</strong>, and started preparing your live tracking updates.
        </p>

        <div style='background:#fff7f5; border:1px solid #ffd2c8; border-radius:20px; padding:24px; margin:26px 0;'>
          <table style='width:100%; border-collapse:collapse;'>
            <tr>
              <td style='padding:0 0 14px; color:#6B7280; font-size:13px; font-weight:700;'>ORDER NUMBER</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:900;'>{$safeOrderNumber}</td>
            </tr>
            <tr>
              <td style='padding:0 0 14px; color:#6B7280; font-size:13px; font-weight:700;'>RESTAURANT</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:800;'>{$safeRestaurantName}</td>
            </tr>
            <tr>
              <td style='padding:0 0 14px; color:#6B7280; font-size:13px; font-weight:700;'>PAYMENT</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:800;'>{$safePaymentMethod}</td>
            </tr>
            <tr>
              <td style='padding:0; color:#6B7280; font-size:13px; font-weight:700;'>TOTAL</td>
              <td style='padding:0; text-align:right; color:#12203A; font-size:22px; font-weight:900;'>Rs. " . formatMoney($total) . "</td>
            </tr>
          </table>
        </div>

        <div style='margin:28px 0;'>
          <h2 style='font-size:20px; margin:0 0 16px; color:#12203A;'>Order progress</h2>

          <table style='width:100%; border-collapse:collapse;'>
            <tr>
              <td style='width:28px; vertical-align:top; padding:0 0 16px;'>
                <span style='display:inline-block; width:14px; height:14px; background:#22C55E; border-radius:50%; margin-top:4px;'></span>
              </td>
              <td style='padding:0 0 16px;'>
                <div style='font-weight:900; color:#12203A;'>Order received</div>
                <div style='font-size:14px; color:#6B7280; margin-top:4px;'>We saved your order details securely.</div>
              </td>
            </tr>
            <tr>
              <td style='width:28px; vertical-align:top; padding:0 0 16px;'>
                <span style='display:inline-block; width:14px; height:14px; background:#F2644C; border-radius:50%; margin-top:4px;'></span>
              </td>
              <td style='padding:0 0 16px;'>
                <div style='font-weight:900; color:#12203A;'>Sent to restaurant</div>
                <div style='font-size:14px; color:#6B7280; margin-top:4px;'>The restaurant will confirm and start preparing your food.</div>
              </td>
            </tr>
            <tr>
              <td style='width:28px; vertical-align:top; padding:0;'>
                <span style='display:inline-block; width:14px; height:14px; background:#CBD5E1; border-radius:50%; margin-top:4px;'></span>
              </td>
              <td style='padding:0;'>
                <div style='font-weight:900; color:#12203A;'>Rider matching</div>
                <div style='font-size:14px; color:#6B7280; margin-top:4px;'>A nearby rider will be assigned when your order is ready.</div>
              </td>
            </tr>
          </table>
        </div>

        <div style='border:1px solid #E9E2DC; border-radius:20px; padding:24px; margin:28px 0;'>
          <h2 style='font-size:20px; margin:0 0 14px; color:#12203A;'>Order items</h2>

          <table style='width:100%; border-collapse:collapse;'>
            <thead>
              <tr>
                <th style='text-align:left; padding:0 0 12px; border-bottom:2px solid #E9E2DC; color:#6B7280; font-size:13px;'>Item</th>
                <th style='text-align:center; padding:0 0 12px; border-bottom:2px solid #E9E2DC; color:#6B7280; font-size:13px;'>Qty</th>
                <th style='text-align:right; padding:0 0 12px; border-bottom:2px solid #E9E2DC; color:#6B7280; font-size:13px;'>Total</th>
              </tr>
            </thead>
            <tbody>
              {$itemsHtml}
            </tbody>
          </table>

          <div style='background:#F9FAFB; border-radius:18px; padding:20px; margin-top:22px;'>
            <table style='width:100%; border-collapse:collapse;'>
              <tr>
                <td style='padding:6px 0; color:#6B7280;'>Subtotal</td>
                <td style='padding:6px 0; text-align:right; font-weight:800; color:#12203A;'>Rs. " . formatMoney($subtotal) . "</td>
              </tr>
              <tr>
                <td style='padding:6px 0; color:#6B7280;'>Tax</td>
                <td style='padding:6px 0; text-align:right; font-weight:800; color:#12203A;'>Rs. " . formatMoney($tax) . "</td>
              </tr>
              <tr>
                <td style='padding:6px 0; color:#6B7280;'>Delivery fee</td>
                <td style='padding:6px 0; text-align:right; font-weight:800; color:#12203A;'>Rs. " . formatMoney($deliveryFee) . "</td>
              </tr>
              <tr>
                <td style='padding:14px 0 0; color:#12203A; font-size:18px; font-weight:900;'>Total</td>
                <td style='padding:14px 0 0; text-align:right; color:#12203A; font-size:22px; font-weight:900;'>Rs. " . formatMoney($total) . "</td>
              </tr>
            </table>
          </div>
        </div>

        <div style='background:#F9FAFB; border:1px solid #E5E7EB; border-radius:20px; padding:22px; margin:28px 0;'>
          <h2 style='font-size:20px; margin:0 0 12px; color:#12203A;'>Delivery details</h2>
          <p style='margin:0; font-size:15px; line-height:1.7; color:#374151;'>
            <strong>Address:</strong> {$safeDeliveryAddress}
          </p>
          " . ($safeDeliveryNote !== "" ? "<p style='margin:10px 0 0; font-size:15px; line-height:1.7; color:#374151;'><strong>Delivery note:</strong> {$safeDeliveryNote}</p>" : "") . "
        </div>

        <div style='text-align:center; margin:30px 0 8px;'>
          <div style='display:inline-block; background:#12203A; color:#ffffff; border-radius:999px; padding:14px 28px; font-weight:900; font-size:15px;'>
            Track your order from your FoodExpress account
          </div>
        </div>

        <p style='margin:24px 0 0; font-size:14px; line-height:1.7; color:#6B7280; text-align:center;'>
          This is an automated order confirmation email. Keep this email for your records.
        </p>
      </div>

      " . buildEmailFooter() . "

    </div>
  </div>
</body>
</html>
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

    $subject = "FoodExpress delivered your order - {$orderNumber}";

    $body = "
<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <title>FoodExpress Order Delivered</title>
</head>
<body style='margin:0; padding:0; background:#f6f7fb; font-family:Arial, Helvetica, sans-serif; color:#12203A;'>
  <div style='width:100%; background:#f6f7fb; padding:34px 14px;'>
    <div style='max-width:720px; margin:0 auto; background:#ffffff; border-radius:26px; overflow:hidden; box-shadow:0 18px 45px rgba(18,32,58,0.10);'>

      " . buildEmailHeader("Your order has arrived. Enjoy your meal!", "dark") . "

      <div style='padding:38px;'>
        <div style='display:inline-block; background:#ECFDF3; color:#15803D; border:1px solid #BBF7D0; border-radius:999px; padding:9px 14px; font-size:13px; font-weight:900; margin-bottom:18px;'>
          Delivered successfully
        </div>

        <h1 style='margin:0 0 14px; font-size:30px; line-height:1.25; letter-spacing:-0.7px; color:#12203A;'>
          Your FoodExpress order has arrived
        </h1>

        <p style='font-size:16px; line-height:1.75; margin:0 0 24px; color:#4B5563;'>
          Hi {$safeCustomerName}, your order from <strong>{$safeRestaurantName}</strong> has been delivered successfully.
        </p>

        <div style='background:#ECFDF3; border:1px solid #BBF7D0; border-radius:20px; padding:24px; margin:26px 0;'>
          <table style='width:100%; border-collapse:collapse;'>
            <tr>
              <td style='padding:0 0 14px; color:#166534; font-size:13px; font-weight:800;'>ORDER NUMBER</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:900;'>{$safeOrderNumber}</td>
            </tr>
            <tr>
              <td style='padding:0 0 14px; color:#166534; font-size:13px; font-weight:800;'>RESTAURANT</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:800;'>{$safeRestaurantName}</td>
            </tr>
            <tr>
              <td style='padding:0 0 14px; color:#166534; font-size:13px; font-weight:800;'>PAYMENT</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:800;'>{$safePaymentMethod}</td>
            </tr>
            <tr>
              <td style='padding:0 0 14px; color:#166534; font-size:13px; font-weight:800;'>DELIVERED AT</td>
              <td style='padding:0 0 14px; text-align:right; color:#12203A; font-size:15px; font-weight:800;'>{$safeDeliveredAt}</td>
            </tr>
            <tr>
              <td style='padding:0; color:#166534; font-size:13px; font-weight:800;'>TOTAL</td>
              <td style='padding:0; text-align:right; color:#12203A; font-size:22px; font-weight:900;'>Rs. " . formatMoney($total) . "</td>
            </tr>
          </table>
        </div>

        <div style='border:1px solid #E9E2DC; border-radius:20px; padding:24px; margin:28px 0;'>
          <h2 style='font-size:20px; margin:0 0 14px; color:#12203A;'>Order receipt</h2>

          <table style='width:100%; border-collapse:collapse;'>
            <thead>
              <tr>
                <th style='text-align:left; padding:0 0 12px; border-bottom:2px solid #E9E2DC; color:#6B7280; font-size:13px;'>Item</th>
                <th style='text-align:center; padding:0 0 12px; border-bottom:2px solid #E9E2DC; color:#6B7280; font-size:13px;'>Qty</th>
                <th style='text-align:right; padding:0 0 12px; border-bottom:2px solid #E9E2DC; color:#6B7280; font-size:13px;'>Total</th>
              </tr>
            </thead>
            <tbody>
              {$itemsHtml}
            </tbody>
          </table>
        </div>

        <div style='background:#fff7f5; border:1px solid #ffd2c8; border-radius:20px; padding:24px; margin:28px 0;'>
          <h2 style='font-size:20px; margin:0 0 10px; color:#12203A;'>How was your order?</h2>
          <p style='margin:0; font-size:15px; line-height:1.7; color:#4B5563;'>
            Your feedback helps FoodExpress improve restaurant quality and rider experience. You can review this order from your FoodExpress account.
          </p>
        </div>

        <p style='margin:24px 0 0; font-size:15px; line-height:1.7; color:#4B5563; text-align:center;'>
          Thank you for choosing FoodExpress. We hope to deliver to you again soon.
        </p>
      </div>

      " . buildEmailFooter() . "

    </div>
  </div>
</body>
</html>
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
        if (count($groupedItems) > 1) {
    echo json_encode([
        "success" => false,
        "message" => "Please order from one restaurant at a time."
    ]);
    break;
}

        $createdOrders = [];
        $failedOrders = [];

        foreach ($groupedItems as $restaurantId => $restaurantItems) {
            $restaurantCheckoutStatus = getRestaurantCheckoutStatus($conn, intval($restaurantId), $restaurantItems);

if (
    empty($restaurantCheckoutStatus["success"]) ||
    empty($restaurantCheckoutStatus["can_checkout"])
) {
    $failedOrders[] = [
        "restaurant_id" => intval($restaurantId),
        "message" => $restaurantCheckoutStatus["message"] ?? "Restaurant is not accepting orders right now.",
        "restaurant_status" => $restaurantCheckoutStatus["key"] ?? "unavailable"
    ];

    continue;
}



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
                        "delivery_status" => $result['delivery_status'] ?? 'searching',
                        "estimated_delivery" => $restaurantCheckoutStatus["eta_label"] ?? null,
                        "restaurant_operation_status" => $restaurantCheckoutStatus["key"] ?? "open",
                        "restaurant_operation_message" => $restaurantCheckoutStatus["message"] ?? "",
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
        ? "Order created successfully"
        : ($failedOrders[0]["message"] ?? "Failed to create order"),

    "order_id" => $firstOrder["order_id"] ?? null,
    "order_number" => $firstOrder["order_number"] ?? null,
    "email_queued" => $firstOrder["email_queued"] ?? false,
    "delivery_status" => $firstOrder["delivery_status"] ?? "searching",

    "estimated_delivery" => $firstOrder["estimated_delivery"] ?? null,
    "restaurant_operation_status" => $firstOrder["restaurant_operation_status"] ?? null,
    "restaurant_operation_message" => $firstOrder["restaurant_operation_message"] ?? null,

    "orders" => $createdOrders,
    "failed_orders" => $failedOrders
]);
        break;

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

            case 'customer_orders':
        $email = trim($_GET['email'] ?? '');
        $limit = intval($_GET['limit'] ?? 30);

        if ($limit <= 0 || $limit > 100) {
            $limit = 30;
        }

        if ($email === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            echo json_encode([
                "success" => false,
                "message" => "Valid customer email is required.",
                "data" => []
            ]);
            break;
        }

        try {
            $stmt = $conn->prepare("
                SELECT
                    o.id,
                    o.order_number,
                    o.user_id,
                    o.restaurant_id,
                    r.restaurant_name,
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
                    o.updated_at,
                    o.confirmed_at,
                    o.preparing_at,
                    o.ready_for_pickup_at,
                    o.picked_up_at,
                    o.on_the_way_at,
                    o.delivered_at,
                    o.cancel_reason
                FROM orders o
                LEFT JOIN restaurants r ON o.restaurant_id = r.id
                WHERE LOWER(o.customer_email) = LOWER(?)
                ORDER BY o.created_at DESC
                LIMIT ?
            ");

            if (!$stmt) {
                echo json_encode([
                    "success" => false,
                    "message" => "Failed to prepare customer orders query: " . $conn->error,
                    "data" => []
                ]);
                break;
            }

            $stmt->bind_param("si", $email, $limit);
            $stmt->execute();

            $result = $stmt->get_result();
            $orders = [];

            while ($row = $result->fetch_assoc()) {
                $items = $order->getItems($row["id"]);

                $orders[] = [
                    "id" => intval($row["id"]),
                    "orderId" => intval($row["id"]),
                    "order_id" => intval($row["id"]),

                    "orderNumber" => $row["order_number"],
                    "order_number" => $row["order_number"],

                    "user_id" => $row["user_id"],
                    "restaurantId" => intval($row["restaurant_id"]),
                    "restaurant_id" => intval($row["restaurant_id"]),
                    "restaurantName" => $row["restaurant_name"] ?: ("Restaurant #" . $row["restaurant_id"]),
                    "restaurant_name" => $row["restaurant_name"] ?: ("Restaurant #" . $row["restaurant_id"]),

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
                    "deliveryStatus" => $row["delivery_status"],
                    "delivery_status" => $row["delivery_status"],

                    "riderId" => $row["rider_id"],
                    "rider_id" => $row["rider_id"],
                    "riderName" => $row["rider_name"],
                    "rider_name" => $row["rider_name"],
                    "riderEmail" => $row["rider_email"],
                    "rider_email" => $row["rider_email"],
                    "riderPhone" => $row["rider_phone"],
                    "rider_phone" => $row["rider_phone"],

                    "createdAt" => $row["created_at"],
                    "created_at" => $row["created_at"],
                    "updatedAt" => $row["updated_at"],
                    "updated_at" => $row["updated_at"],
                    "timestamp" => $row["created_at"],

                    "confirmedAt" => $row["confirmed_at"],
                    "confirmed_at" => $row["confirmed_at"],
                    "preparingAt" => $row["preparing_at"],
                    "preparing_at" => $row["preparing_at"],
                    "readyForPickupAt" => $row["ready_for_pickup_at"],
                    "ready_for_pickup_at" => $row["ready_for_pickup_at"],
                    "pickedUpAt" => $row["picked_up_at"],
                    "picked_up_at" => $row["picked_up_at"],
                    "onTheWayAt" => $row["on_the_way_at"],
                    "on_the_way_at" => $row["on_the_way_at"],
                    "deliveredAt" => $row["delivered_at"],
                    "delivered_at" => $row["delivered_at"],

                    "cancelReason" => $row["cancel_reason"],
                    "cancel_reason" => $row["cancel_reason"],

                    "items" => $items,
                    "itemCount" => count($items)
                ];
            }

            $stmt->close();

            $deliveredOrders = array_filter($orders, function ($item) {
                return strtolower($item["status"] ?? "") === "delivered"
                    || strtolower($item["delivery_status"] ?? "") === "delivered";
            });

            $points = count($deliveredOrders) * 100;

            $savings = 0;
            foreach ($orders as $customerOrder) {
                $savings += floatval($customerOrder["discount_amount"] ?? 0);
            }

            echo json_encode([
                "success" => true,
                "data" => $orders,
                "count" => count($orders),
                "stats" => [
                    "total_orders" => count($orders),
                    "delivered_orders" => count($deliveredOrders),
                    "points" => $points,
                    "savings" => $savings
                ]
            ]);
        } catch (Throwable $e) {
            echo json_encode([
                "success" => false,
                "message" => "Failed to load customer orders: " . $e->getMessage(),
                "data" => []
            ]);
        }

        break;
        
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

    case 'total_sales':
        $total_sales = $order->getTotalSales();

        echo json_encode([
            "success" => true,
            "total_sales" => $total_sales
        ]);
        break;

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
            "message" => "Invalid action. Available actions: create, single, by_number, all, by_status, available_deliveries, update_status, assign_rider, update_delivery_status, total_sales, count, active_delivery"
        ]);
        break;
}

$conn->close();
?>
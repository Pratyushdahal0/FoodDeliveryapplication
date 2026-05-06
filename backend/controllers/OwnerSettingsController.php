<?php
header("Content-Type: application/json");

require_once __DIR__ . "/../config/db.php";

$action = $_GET["action"] ?? $_POST["action"] ?? "";

if (!$conn) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed."
    ]);
    exit;
}

function sendJson($success, $message, $data = null) {
    echo json_encode([
        "success" => $success,
        "message" => $message,
        "data" => $data
    ]);
    exit;
}

function cleanValue($value) {
    return trim((string)($value ?? ""));
}

function intFlag($value) {
    return (int)((string)$value === "1" || $value === 1 || $value === true);
}

if ($action === "get") {
    $restaurantId = (int)($_GET["restaurant_id"] ?? 0);

    if ($restaurantId <= 0) {
        sendJson(false, "Restaurant ID is required.");
    }

    $sql = "
        SELECT
    id,
    owner_user_id,
    restaurant_name,
    description,
    cuisine_type,
    location,
    city,
    phone,
    email,
    opening_time,
    closing_time,
    delivery_available,
    is_open,
    accepting_orders,
    busy_mode,
    estimated_prep_minutes,
    pickup_available,
    auto_pause_overload,
    avg_handoff_minutes,
    delivery_radius_km,
    min_order_amount,
    packaging_fee,
    show_on_shop,
    show_busy_banner,
    preorder_allowed,
    out_of_stock_policy,
    notify_new_orders,
    notify_cancellations,
    notify_low_stock,
    notify_support,
    logo_url,
    cover_image_url,
    status,
    created_at,
    updated_at
FROM restaurants
WHERE id = ?
LIMIT 1
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();
    $result = $stmt->get_result();
    $restaurant = $result->fetch_assoc();
    $stmt->close();

    if (!$restaurant) {
        sendJson(false, "Restaurant not found.");
    }

    sendJson(true, "Restaurant settings loaded.", $restaurant);
}

if ($action === "update") {
    $restaurantId = (int)($_POST["restaurant_id"] ?? 0);

    if ($restaurantId <= 0) {
        sendJson(false, "Restaurant ID is required.");
    }

    $restaurantName = cleanValue($_POST["restaurant_name"] ?? "");
    $description = cleanValue($_POST["description"] ?? "");
    $cuisineType = cleanValue($_POST["cuisine_type"] ?? "");
    $location = cleanValue($_POST["location"] ?? "");
    $city = cleanValue($_POST["city"] ?? "");
    $phone = cleanValue($_POST["phone"] ?? "");
    $email = cleanValue($_POST["email"] ?? "");
    $openingTime = cleanValue($_POST["opening_time"] ?? "09:00");
    $closingTime = cleanValue($_POST["closing_time"] ?? "22:00");
    $deliveryAvailable = intFlag($_POST["delivery_available"] ?? 1);
    $isOpen = intFlag($_POST["is_open"] ?? 1);
    $acceptingOrders = intFlag($_POST["accepting_orders"] ?? 1);
    $busyMode = intFlag($_POST["busy_mode"] ?? 0);
    $estimatedPrepMinutes = (int)($_POST["estimated_prep_minutes"] ?? 25);
    $logoUrl = cleanValue($_POST["logo_url"] ?? "");
    $coverImageUrl = cleanValue($_POST["cover_image_url"] ?? "");
    $pickupAvailable = intFlag($_POST["pickup_available"] ?? 1);
$autoPauseOverload = intFlag($_POST["auto_pause_overload"] ?? 0);
$avgHandoffMinutes = (int)($_POST["avg_handoff_minutes"] ?? 5);
$deliveryRadiusKm = (float)($_POST["delivery_radius_km"] ?? 5);
$minOrderAmount = (float)($_POST["min_order_amount"] ?? 0);
$packagingFee = (float)($_POST["packaging_fee"] ?? 0);
$showOnShop = intFlag($_POST["show_on_shop"] ?? 1);
$showBusyBanner = intFlag($_POST["show_busy_banner"] ?? 1);
$preorderAllowed = intFlag($_POST["preorder_allowed"] ?? 0);
$outOfStockPolicy = cleanValue($_POST["out_of_stock_policy"] ?? "hide");
$notifyNewOrders = intFlag($_POST["notify_new_orders"] ?? 1);
$notifyCancellations = intFlag($_POST["notify_cancellations"] ?? 1);
$notifyLowStock = intFlag($_POST["notify_low_stock"] ?? 1);
$notifySupport = intFlag($_POST["notify_support"] ?? 1);

if ($avgHandoffMinutes < 1) $avgHandoffMinutes = 1;
if ($avgHandoffMinutes > 60) $avgHandoffMinutes = 60;

if ($deliveryRadiusKm < 1) $deliveryRadiusKm = 1;
if ($deliveryRadiusKm > 50) $deliveryRadiusKm = 50;

if ($minOrderAmount < 0) $minOrderAmount = 0;
if ($packagingFee < 0) $packagingFee = 0;

if (!in_array($outOfStockPolicy, ["hide", "show_unavailable"], true)) {
    $outOfStockPolicy = "hide";
}


    if ($restaurantName === "") {
        sendJson(false, "Restaurant name is required.");
    }

    if ($cuisineType === "") {
        sendJson(false, "Cuisine type is required.");
    }

    if ($location === "") {
        sendJson(false, "Restaurant location is required.");
    }

    if ($estimatedPrepMinutes < 5) {
        $estimatedPrepMinutes = 5;
    }

    if ($estimatedPrepMinutes > 120) {
        $estimatedPrepMinutes = 120;
    }

    $sql = "
       UPDATE restaurants
    SET
        restaurant_name = ?,
        description = ?,
        cuisine_type = ?,
        location = ?,
        city = ?,
        phone = ?,
        email = ?,
        opening_time = ?,
        closing_time = ?,
        delivery_available = ?,
        is_open = ?,
        accepting_orders = ?,
        busy_mode = ?,
        estimated_prep_minutes = ?,
        logo_url = ?,
        cover_image_url = ?,
        pickup_available = ?,
        auto_pause_overload = ?,
        avg_handoff_minutes = ?,
        delivery_radius_km = ?,
        min_order_amount = ?,
        packaging_fee = ?,
        show_on_shop = ?,
        show_busy_banner = ?,
        preorder_allowed = ?,
        out_of_stock_policy = ?,
        notify_new_orders = ?,
        notify_cancellations = ?,
        notify_low_stock = ?,
        notify_support = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    LIMIT 1
    ";

    $stmt = $conn->prepare($sql);

  $stmt->bind_param(
    "sssssssssiiiiissiiidddiiisiiiii",
    $restaurantName,
    $description,
    $cuisineType,
    $location,
    $city,
    $phone,
    $email,
    $openingTime,
    $closingTime,
    $deliveryAvailable,
    $isOpen,
    $acceptingOrders,
    $busyMode,
    $estimatedPrepMinutes,
    $logoUrl,
    $coverImageUrl,
    $pickupAvailable,
    $autoPauseOverload,
    $avgHandoffMinutes,
    $deliveryRadiusKm,
    $minOrderAmount,
    $packagingFee,
    $showOnShop,
    $showBusyBanner,
    $preorderAllowed,
    $outOfStockPolicy,
    $notifyNewOrders,
    $notifyCancellations,
    $notifyLowStock,
    $notifySupport,
    $restaurantId
);

    $success = $stmt->execute();
    $stmt->close();

    if (!$success) {
        sendJson(false, "Failed to update restaurant settings.");
    }

    sendJson(true, "Restaurant settings updated successfully.");
}

sendJson(false, "Invalid action.");
?>
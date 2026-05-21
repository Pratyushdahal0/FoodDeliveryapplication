<?php
header("Content-Type: application/json");

require_once __DIR__ . "/../config/db.php";

// Parse JSON body if sent as application/json
$jsonInput = json_decode(file_get_contents("php://input"), true) ?? [];
if (!empty($jsonInput)) {
    $_POST = array_merge($_POST, $jsonInput);
}

$action = $_GET["action"] ?? $_POST["action"] ?? "";

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

function cleanValue($value) {
    return trim(strip_tags($value ?? ""));
}

function sendJson($success, $message, $data = null) {
    echo json_encode(["success" => $success, "message" => $message, "data" => $data]);
    exit;
}

function intFlag($value) {
    return (int)((string)$value === "1" || $value === 1 || $value === true);
}

/* ── CREATE ── */
if ($action === "create") {
    $ownerUserId    = (int)($_POST["owner_user_id"] ?? 0);
    $restaurantName = cleanValue($_POST["restaurant_name"] ?? "");
    $location       = cleanValue($_POST["location"] ?? "");
    $phone          = cleanValue($_POST["phone"] ?? "");
    $email          = cleanValue($_POST["email"] ?? "");
    $description    = cleanValue($_POST["description"] ?? "");
    $cuisineType    = cleanValue($_POST["cuisine_type"] ?? "");
    $openingTime    = cleanValue($_POST["opening_time"] ?? "09:00");
    $closingTime    = cleanValue($_POST["closing_time"] ?? "22:00");

    if ($ownerUserId <= 0 || $restaurantName === "") {
        sendJson(false, "Owner user ID and restaurant name are required.");
    }

    $stmt = $conn->prepare("SELECT id, approval_status FROM users WHERE id = ? AND role = 'restaurant-owner'");
    $stmt->bind_param("i", $ownerUserId);
    $stmt->execute();
    $ownerResult = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$ownerResult) {
        sendJson(false, "Invalid owner user ID or user is not a restaurant owner.");
    }

    if (($ownerResult['approval_status'] ?? 'approved') !== 'approved') {
        sendJson(false, "Owner account must be approved before creating a restaurant.");
    }

    $stmt = $conn->prepare("SELECT id FROM restaurants WHERE owner_user_id = ?");
    $stmt->bind_param("i", $ownerUserId);
    $stmt->execute();
    $existingRestaurant = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($existingRestaurant) {
        sendJson(false, "Owner already has a restaurant registered.");
    }

    // ✅ FIX Bug #3 — all defaults set so restaurant never shows NULL/closed
    $sql = "
        INSERT INTO restaurants 
        (owner_user_id, restaurant_name, description, cuisine_type, location, phone, email,
         opening_time, closing_time, is_open, accepting_orders, delivery_available,
         show_on_shop, pickup_available, estimated_prep_minutes, avg_handoff_minutes,
         delivery_radius_km, min_order_amount, packaging_fee, out_of_stock_policy,
         notify_new_orders, notify_cancellations, notify_low_stock, notify_support,
         show_busy_banner, preorder_allowed, auto_pause_overload, busy_mode,
         approval_status, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?,
                ?, ?, 1, 1, 1,
                0, 1, 25, 5,
                5, 0, 0, 'hide',
                1, 1, 1, 1,
                1, 0, 0, 0,
                'pending', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param(
        "issssssss",
        $ownerUserId, $restaurantName, $description, $cuisineType,
        $location, $phone, $email, $openingTime, $closingTime
    );
    $success = $stmt->execute();
    $restaurantId = $conn->insert_id;
    $stmt->close();

    if (!$success) {
        sendJson(false, "Failed to create restaurant.");
    }

    sendJson(true, "Restaurant created successfully and is pending admin approval.", ["restaurant_id" => $restaurantId]);
}

/* ── GET ── */
if ($action === "get") {
    $restaurantId = (int)($_GET["restaurant_id"] ?? 0);

    if ($restaurantId <= 0) {
        sendJson(false, "Restaurant ID is required.");
    }

    $sql = "
        SELECT
            id, owner_user_id, restaurant_name, description, cuisine_type,
            location, city, phone, email,
            COALESCE(opening_time, '09:00') AS opening_time,
            COALESCE(closing_time, '22:00') AS closing_time,
            COALESCE(delivery_available, 1) AS delivery_available,
            COALESCE(is_open, 1) AS is_open,
            COALESCE(accepting_orders, 1) AS accepting_orders,
            COALESCE(busy_mode, 0) AS busy_mode,
            COALESCE(estimated_prep_minutes, 25) AS estimated_prep_minutes,
            COALESCE(pickup_available, 1) AS pickup_available,
            COALESCE(auto_pause_overload, 0) AS auto_pause_overload,
            COALESCE(avg_handoff_minutes, 5) AS avg_handoff_minutes,
            COALESCE(delivery_radius_km, 5) AS delivery_radius_km,
            COALESCE(min_order_amount, 0) AS min_order_amount,
            COALESCE(packaging_fee, 0) AS packaging_fee,
            COALESCE(show_on_shop, 1) AS show_on_shop,
            COALESCE(show_busy_banner, 1) AS show_busy_banner,
            COALESCE(preorder_allowed, 0) AS preorder_allowed,
            COALESCE(out_of_stock_policy, 'hide') AS out_of_stock_policy,
            COALESCE(notify_new_orders, 1) AS notify_new_orders,
            COALESCE(notify_cancellations, 1) AS notify_cancellations,
            COALESCE(notify_low_stock, 1) AS notify_low_stock,
            COALESCE(notify_support, 1) AS notify_support,
            logo_url, cover_image_url, status, created_at, updated_at
        FROM restaurants
        WHERE id = ?
        LIMIT 1
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();
    $restaurant = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$restaurant) {
        sendJson(false, "Restaurant not found.");
    }

    sendJson(true, "Restaurant settings loaded.", $restaurant);
}

/* ── UPDATE ── */
if ($action === "update") {
    $restaurantId = (int)($_POST["restaurant_id"] ?? 0);

    if ($restaurantId <= 0) {
        sendJson(false, "Restaurant ID is required.");
    }

    $restaurantName       = cleanValue($_POST["restaurant_name"] ?? "");
    $description          = cleanValue($_POST["description"] ?? "");
    $cuisineType          = cleanValue($_POST["cuisine_type"] ?? "");
    $location             = cleanValue($_POST["location"] ?? "");
    $city                 = cleanValue($_POST["city"] ?? "");
    $phone                = cleanValue($_POST["phone"] ?? "");
    $email                = cleanValue($_POST["email"] ?? "");
    $openingTime          = cleanValue($_POST["opening_time"] ?? "09:00");
    $closingTime          = cleanValue($_POST["closing_time"] ?? "22:00");
    $deliveryAvailable    = intFlag($_POST["delivery_available"] ?? 1);
    $isOpen               = intFlag($_POST["is_open"] ?? 1);
    $acceptingOrders      = intFlag($_POST["accepting_orders"] ?? 1);
    $busyMode             = intFlag($_POST["busy_mode"] ?? 0);
    $estimatedPrepMinutes = (int)($_POST["estimated_prep_minutes"] ?? 25);
    $logoUrl              = cleanValue($_POST["logo_url"] ?? "");
    $coverImageUrl        = cleanValue($_POST["cover_image_url"] ?? "");
    $pickupAvailable      = intFlag($_POST["pickup_available"] ?? 1);
    $autoPauseOverload    = intFlag($_POST["auto_pause_overload"] ?? 0);
    $avgHandoffMinutes    = (int)($_POST["avg_handoff_minutes"] ?? 5);
    $deliveryRadiusKm     = (float)($_POST["delivery_radius_km"] ?? 5);
    $minOrderAmount       = (float)($_POST["min_order_amount"] ?? 0);
    $packagingFee         = (float)($_POST["packaging_fee"] ?? 0);
    $showOnShop           = intFlag($_POST["show_on_shop"] ?? 1);
    $showBusyBanner       = intFlag($_POST["show_busy_banner"] ?? 1);
    $preorderAllowed      = intFlag($_POST["preorder_allowed"] ?? 0);
    $outOfStockPolicy     = cleanValue($_POST["out_of_stock_policy"] ?? "hide");
    $notifyNewOrders      = intFlag($_POST["notify_new_orders"] ?? 1);
    $notifyCancellations  = intFlag($_POST["notify_cancellations"] ?? 1);
    $notifyLowStock       = intFlag($_POST["notify_low_stock"] ?? 1);
    $notifySupport        = intFlag($_POST["notify_support"] ?? 1);

    if ($avgHandoffMinutes < 1)      $avgHandoffMinutes = 1;
    if ($avgHandoffMinutes > 60)     $avgHandoffMinutes = 60;
    if ($deliveryRadiusKm < 1)       $deliveryRadiusKm = 1;
    if ($deliveryRadiusKm > 50)      $deliveryRadiusKm = 50;
    if ($minOrderAmount < 0)         $minOrderAmount = 0;
    if ($packagingFee < 0)           $packagingFee = 0;
    if ($estimatedPrepMinutes < 5)   $estimatedPrepMinutes = 5;
    if ($estimatedPrepMinutes > 120) $estimatedPrepMinutes = 120;

    if (!in_array($outOfStockPolicy, ["hide", "show_unavailable"], true)) {
        $outOfStockPolicy = "hide";
    }

    // ✅ FIX Bug #4 — defaults prevent NULL crash
    if ($openingTime === "") $openingTime = "09:00";
    if ($closingTime === "") $closingTime = "22:00";

    if ($restaurantName === "") sendJson(false, "Restaurant name is required.");
    if ($cuisineType === "")    sendJson(false, "Cuisine type is required.");
    if ($location === "")       sendJson(false, "Restaurant location is required.");

    $sql = "
        UPDATE restaurants
        SET
            restaurant_name        = ?,
            description            = ?,
            cuisine_type           = ?,
            location               = ?,
            city                   = ?,
            phone                  = ?,
            email                  = ?,
            opening_time           = ?,
            closing_time           = ?,
            delivery_available     = ?,
            is_open                = ?,
            accepting_orders       = ?,
            busy_mode              = ?,
            estimated_prep_minutes = ?,
            logo_url               = ?,
            cover_image_url        = ?,
            pickup_available       = ?,
            auto_pause_overload    = ?,
            avg_handoff_minutes    = ?,
            delivery_radius_km     = ?,
            min_order_amount       = ?,
            packaging_fee          = ?,
            show_on_shop           = ?,
            show_busy_banner       = ?,
            preorder_allowed       = ?,
            out_of_stock_policy    = ?,
            notify_new_orders      = ?,
            notify_cancellations   = ?,
            notify_low_stock       = ?,
            notify_support         = ?,
            updated_at             = CURRENT_TIMESTAMP
        WHERE id = ?
        LIMIT 1
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param(
        "sssssssssiiiiissiiidddiiisiiiii",
        $restaurantName, $description, $cuisineType, $location, $city,
        $phone, $email, $openingTime, $closingTime,
        $deliveryAvailable, $isOpen, $acceptingOrders, $busyMode, $estimatedPrepMinutes,
        $logoUrl, $coverImageUrl, $pickupAvailable, $autoPauseOverload, $avgHandoffMinutes,
        $deliveryRadiusKm, $minOrderAmount, $packagingFee,
        $showOnShop, $showBusyBanner, $preorderAllowed, $outOfStockPolicy,
        $notifyNewOrders, $notifyCancellations, $notifyLowStock, $notifySupport,
        $restaurantId
    );

    $success = $stmt->execute();
    $stmt->close();

    if (!$success) {
        sendJson(false, "Failed to update restaurant settings.");
    }

    sendJson(true, "Restaurant settings updated successfully.");
}

/* ── SAVE DOCUMENTS ── */
// ✅ FIX — moved BEFORE sendJson("Invalid action") so it actually executes!
if ($action === "save_documents") {
    $restaurantId      = (int)($_POST["restaurant_id"] ?? 0);
    $ownerFullName     = cleanValue($_POST["owner_full_name"] ?? "");
    $panNumber         = cleanValue($_POST["pan_number"] ?? "");
    $businessRegNumber = cleanValue($_POST["business_registration_number"] ?? "");

    if ($restaurantId <= 0) {
        sendJson(false, "Restaurant ID required.");
    }

    $uploadDir = __DIR__ . "/../../frontend/assets/uploads/";
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);

    $panImageUrl         = "";
    $citizenshipImageUrl = "";

    if (!empty($_FILES["pan_image"]["tmp_name"])) {
        $ext      = strtolower(pathinfo($_FILES["pan_image"]["name"], PATHINFO_EXTENSION));
        $filename = "pan_{$restaurantId}_" . time() . "." . $ext;
        move_uploaded_file($_FILES["pan_image"]["tmp_name"], $uploadDir . $filename);
        $panImageUrl = "/fooddeliveryapp/frontend/assets/uploads/" . $filename;
    }

    if (!empty($_FILES["citizenship_image"]["tmp_name"])) {
        $ext      = strtolower(pathinfo($_FILES["citizenship_image"]["name"], PATHINFO_EXTENSION));
        $filename = "citizenship_{$restaurantId}_" . time() . "." . $ext;
        move_uploaded_file($_FILES["citizenship_image"]["tmp_name"], $uploadDir . $filename);
        $citizenshipImageUrl = "/fooddeliveryapp/frontend/assets/uploads/" . $filename;
    }

    if (!empty($_FILES["logo"]["tmp_name"])) {
        $ext      = strtolower(pathinfo($_FILES["logo"]["name"], PATHINFO_EXTENSION));
        $filename = "logo_{$restaurantId}_" . time() . "." . $ext;
        move_uploaded_file($_FILES["logo"]["tmp_name"], $uploadDir . $filename);
        $logoUrl  = "/fooddeliveryapp/frontend/assets/uploads/" . $filename;
        $logoStmt = $conn->prepare("UPDATE restaurants SET logo_url = ? WHERE id = ?");
        $logoStmt->bind_param("si", $logoUrl, $restaurantId);
        $logoStmt->execute();
        $logoStmt->close();
    }

    $check = $conn->prepare("SELECT id FROM restaurant_documents WHERE restaurant_id = ?");
    $check->bind_param("i", $restaurantId);
    $check->execute();
    $exists = $check->get_result()->fetch_assoc();
    $check->close();

    if ($exists) {
        $stmt = $conn->prepare("
            UPDATE restaurant_documents
            SET owner_full_name = ?, pan_number = ?, pan_image = ?,
                business_registration_number = ?, citizenship_image = ?
            WHERE restaurant_id = ?
        ");
        $stmt->bind_param("sssssi",
            $ownerFullName, $panNumber, $panImageUrl,
            $businessRegNumber, $citizenshipImageUrl, $restaurantId
        );
    } else {
        $stmt = $conn->prepare("
            INSERT INTO restaurant_documents
            (restaurant_id, owner_full_name, pan_number, pan_image, business_registration_number, citizenship_image)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->bind_param("isssss",
            $restaurantId, $ownerFullName, $panNumber,
            $panImageUrl, $businessRegNumber, $citizenshipImageUrl
        );
    }

    $stmt->execute();
    $stmt->close();

    sendJson(true, "Documents saved successfully.");
}

sendJson(false, "Invalid action.");
?>
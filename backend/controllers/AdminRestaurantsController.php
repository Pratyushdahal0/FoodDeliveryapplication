<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../config/db.php";
require_once __DIR__ . "/../middleware/authMiddleware.php";
require_once __DIR__ . "/../helpers/MailHelper.php";

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection not available."]);
    exit;
}

$payload = requireRole('admin', $conn);

$action = $_GET["action"] ?? "";

try {
    switch ($action) {
        case "list":
            handleListRestaurants($conn);
            break;
        case "update_status":
            handleUpdateRestaurantStatus($conn, $payload);
            break;
        case "detail":
            handleRestaurantDetail($conn);
            break;
        default:
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Invalid action."]);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
}

function handleListRestaurants($conn) {
    $sql = "
        SELECT
            r.id,
            r.restaurant_name,
            r.description,
            r.cuisine_type,
            r.location,
            r.city,
            r.phone,
            r.email,
            r.logo_url,
            r.status,
            r.approval_status,
            r.approved_at,
            r.rejection_reason,
            r.admin_notes,
            r.created_at,
            COALESCE(rd.owner_full_name, u.name, 'No owner') AS owner_full_name
        FROM restaurants r
        LEFT JOIN restaurant_documents rd ON rd.restaurant_id = r.id
        LEFT JOIN users u ON r.owner_user_id = u.id
        ORDER BY r.created_at DESC
    ";

    $result = $conn->query($sql);
    if (!$result) {
        throw new Exception("Failed to fetch restaurants: " . $conn->error);
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }

    echo json_encode(["success" => true, "data" => $rows]);
}

function handleUpdateRestaurantStatus($conn, $payload) {
    $input          = json_decode(file_get_contents("php://input"), true);
    $id             = isset($input["id"]) ? (int)$input["id"] : 0;
    $approvalStatus = strtolower(trim($input["approval_status"] ?? ""));
    $reason         = trim($input["reason"] ?? "");
    $notes          = trim($input["notes"] ?? "");
    $adminId        = (int)($payload['user_id'] ?? 0);

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Restaurant ID is required."]);
        return;
    }

    if (!in_array($approvalStatus, ["pending", "approved", "rejected", "suspended"], true)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Invalid approval status value."]);
        return;
    }

    $stmt = $conn->prepare("
        SELECT r.approval_status, r.restaurant_name, u.email, u.name
        FROM restaurants r
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.id = ?
    ");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $currentData = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$currentData) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Restaurant not found."]);
        return;
    }

    $previousStatus = $currentData['approval_status'];

    $sql = "
    UPDATE restaurants
    SET
        approval_status = ?,
        status = CASE
            WHEN ? = 'approved' THEN 'approved'
            WHEN ? IN ('rejected', 'suspended') THEN 'rejected'
            ELSE status
        END,
        is_open = CASE WHEN ? = 'approved' THEN 1 ELSE is_open END,
        show_on_shop = CASE WHEN ? = 'approved' THEN 1 ELSE show_on_shop END,
        accepting_orders = CASE WHEN ? = 'approved' THEN 1 ELSE accepting_orders END,
        approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
        approved_by_admin_id = CASE WHEN ? = 'approved' THEN ? ELSE approved_by_admin_id END,
        rejection_reason = CASE WHEN ? IN ('rejected', 'suspended') THEN ? ELSE rejection_reason END,
        admin_notes = ?,
        approval_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
";

$stmt->bind_param(
    "ssssssssissi",
    $approvalStatus,  // approval_status = ?
    $approvalStatus,  // status CASE first ?
    $approvalStatus,  // status CASE second ?
    $approvalStatus,  // is_open CASE ?
    $approvalStatus,  // show_on_shop CASE ?
    $approvalStatus,  // accepting_orders CASE ?
    $approvalStatus,  // approved_at CASE ?
    $approvalStatus,  // approved_by_admin_id CASE first ?
    $adminId,         // approved_by_admin_id CASE second ?
    $approvalStatus,  // rejection_reason CASE first ?
    $reason,          // rejection_reason CASE second ?
    $notes,           // admin_notes = ?
    $id               // WHERE id = ?
);

    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        throw new Exception("Failed to update restaurant approval status.");
    }

    logRestaurantApprovalAction($conn, $id, $approvalStatus, $adminId, $previousStatus, $reason, $notes);
    sendRestaurantApprovalNotification($currentData, $approvalStatus, $reason);

    echo json_encode([
        "success" => true,
        "message" => "Restaurant approval status updated to {$approvalStatus}."
    ]);
}

function handleRestaurantDetail($conn) {
    $id = intval($_GET["id"] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Restaurant ID required."]);
        return;
    }

    $stmt = $conn->prepare("
        SELECT
            r.id,
            r.restaurant_name,
            r.description,
            r.cuisine_type,
            r.location,
            r.city,
            r.phone,
            r.email,
            r.logo_url,
            r.cover_image_url,
            r.status,
            r.approval_status,
            r.approved_at,
            r.rejection_reason,
            r.admin_notes,
            r.opening_time,
            r.closing_time,
            r.delivery_available,
            r.is_open,
            r.owner_user_id,
            r.created_at,
            r.updated_at,
            COALESCE(rd.owner_full_name, u.name, 'No owner') AS owner_full_name,
            u.email  AS owner_email,
            u.phone  AS owner_phone,
            rd.citizenship_image,
            rd.pan_number,
            rd.pan_image,
            rd.business_registration_number,
            rd.verification_code,
            rd.approval_status AS doc_approval_status
        FROM restaurants r
        LEFT JOIN restaurant_documents rd ON rd.restaurant_id = r.id
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }

    $stmt->bind_param("i", $id);
    $stmt->execute();
    $restaurant = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$restaurant) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Restaurant not found."]);
        return;
    }

    // Order count + revenue
    $orderCount   = 0;
    $totalRevenue = 0.0;
    $countStmt    = $conn->prepare("
        SELECT COUNT(*) AS cnt, COALESCE(SUM(subtotal), 0) AS rev
        FROM orders
        WHERE restaurant_id = ? AND status NOT IN ('cancelled','rejected')
    ");
    if ($countStmt) {
        $countStmt->bind_param("i", $id);
        $countStmt->execute();
        $row          = $countStmt->get_result()->fetch_assoc();
        $orderCount   = intval($row["cnt"] ?? 0);
        $totalRevenue = round((float)($row["rev"] ?? 0), 2);
        $countStmt->close();
    }

    // Average rating (safe check)
    $avgRating   = null;
    $ratingCheck = $conn->query("SHOW TABLES LIKE 'order_reviews'");
    if ($ratingCheck && $ratingCheck->num_rows > 0) {
        $colCheck = $conn->query("SHOW COLUMNS FROM order_reviews LIKE 'rating'");
        if ($colCheck && $colCheck->num_rows > 0) {
            $ratingStmt = $conn->prepare("SELECT AVG(rating) AS avg_rating FROM order_reviews WHERE restaurant_id = ?");
            if ($ratingStmt) {
                $ratingStmt->bind_param("i", $id);
                $ratingStmt->execute();
                $ratingRow = $ratingStmt->get_result()->fetch_assoc();
                $avgRating = $ratingRow["avg_rating"] !== null ? round((float)$ratingRow["avg_rating"], 1) : null;
                $ratingStmt->close();
            }
        }
    }

    $restaurant["order_count"]   = $orderCount;
    $restaurant["total_revenue"] = $totalRevenue;
    $restaurant["avg_rating"]    = $avgRating;

    echo json_encode(["success" => true, "data" => $restaurant]);
}

function logRestaurantApprovalAction($conn, $restaurantId, $action, $adminId, $previousStatus, $reason, $notes) {
    $sql = "
        INSERT INTO approval_audit_log
        (entity_type, entity_id, action, admin_id, previous_status, new_status, reason, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ";
    $stmt = $conn->prepare($sql);
    if ($stmt) {
        $entityType = 'restaurant';
        $stmt->bind_param(
            "sisissss",
            $entityType,
            $restaurantId,
            $action,
            $adminId,
            $previousStatus,
            $action,
            $reason,
            $notes
        );
        $stmt->execute();
        $stmt->close();
    }
}

function sendRestaurantApprovalNotification($restaurantData, $status, $reason = null) {
    $subject = "";
    $message = "";

    switch ($status) {
        case 'approved':
            $subject = "Congratulations - Your Restaurant is Approved!";
            $message = "
                <h2>Congratulations!</h2>
                <p>Your restaurant <strong>{$restaurantData['restaurant_name']}</strong> has been approved and is now live on FoodExpress.</p>
                <p>You can now log in to your dashboard and start receiving orders.</p>
                <p>Welcome to the FoodExpress partner network!</p>
            ";
            break;
        case 'rejected':
            $subject = "FoodExpress Restaurant Application Update";
            $message = "
                <h2>Restaurant Application Update</h2>
                <p>Dear Restaurant Owner,</p>
                <p>After reviewing your application for <strong>{$restaurantData['restaurant_name']}</strong>, we regret to inform you that it cannot be approved at this time.</p>
                " . ($reason ? "<p><strong>Reason:</strong> {$reason}</p>" : "") . "
                <p>You may reapply after addressing the issues mentioned.</p>
            ";
            break;
        case 'suspended':
            $subject = "FoodExpress Restaurant Account Suspended";
            $message = "
                <h2>Restaurant Account Suspended</h2>
                <p>Your restaurant <strong>{$restaurantData['restaurant_name']}</strong> has been temporarily suspended.</p>
                " . ($reason ? "<p><strong>Reason:</strong> {$reason}</p>" : "") . "
                <p>Please contact support for assistance with reactivation.</p>
            ";
            break;
        default:
            return;
    }

    try {
    MailHelper::sendMail(
        $restaurantData['email'],
        $restaurantData['name'] ?? 'Restaurant Owner',
        $subject,
        $message
    );
} catch (Throwable $e) {
    error_log("Failed to send restaurant approval notification: " . $e->getMessage());
}
}
?>
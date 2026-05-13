<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set("Asia/Kathmandu");

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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

function sendErrorResponse($message, $statusCode = 400) {
    sendJsonResponse([
        "success" => false,
        "message" => $message
    ], $statusCode);
}

$basePath = __DIR__ . '/../';

$dbConfigPath = $basePath . 'config/db.php';
if (!file_exists($dbConfigPath)) {
    sendErrorResponse("Database configuration file not found.", 500);
}
include $dbConfigPath;
if (!isset($conn) || !($conn instanceof mysqli)) {
    sendErrorResponse("Database connection not established.", 500);
}
if ($conn->connect_error) {
    sendErrorResponse("Database connection failed: " . $conn->connect_error, 500);
}

$couponModelPath = $basePath . 'models/Coupon.php';
if (!file_exists($couponModelPath)) {
    sendErrorResponse("Coupon model file not found.", 500);
}
include $couponModelPath;

$couponModel = new Coupon($conn);
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'preview':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            sendErrorResponse("Use POST for preview.", 405);
        }

        $input = json_decode(file_get_contents("php://input"), true);
        if (!is_array($input)) {
            sendErrorResponse("Invalid JSON request body.");
        }

        $code = strtoupper(trim((string)($input['code'] ?? '')));
        if ($code === '') {
            sendErrorResponse("Coupon code is required.");
        }

        if (!isset($input['subtotal']) || !is_numeric($input['subtotal'])) {
            sendErrorResponse("Subtotal must be numeric and greater than 0.");
        }
        $subtotal = floatval($input['subtotal']);
        if ($subtotal <= 0) {
            sendErrorResponse("Subtotal must be numeric and greater than 0.");
        }

        $userId = $input['user_id'] ?? null;
        if ($userId !== null && $userId !== '') {
            $userId = intval($userId);
            if ($userId <= 0) {
                $userId = null;
            }
        } else {
            $userId = null;
        }

        $customerEmail = trim((string)($input['customer_email'] ?? ''));
        if ($customerEmail !== '' && !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
            // Keep error message generic (avoid leaking validation details).
            sendErrorResponse("Invalid customer_email.");
        }

        $coupon = $couponModel->getByCode($code);
        if (!$coupon) {
            sendErrorResponse("Invalid coupon code.");
        }

        if (intval($coupon['is_active'] ?? 0) !== 1) {
            sendErrorResponse("This coupon is not active.");
        }

        if ($couponModel->isExpired($coupon)) {
            sendErrorResponse("This coupon has expired.");
        }

        $minOrder = floatval($coupon['min_order_amount'] ?? 0);
        if ($subtotal < $minOrder) {
            sendErrorResponse("Subtotal does not meet the minimum order amount for this coupon.");
        }

        $usageLimit = $coupon['usage_limit'] ?? null;
        if ($usageLimit !== null && $usageLimit !== '') {
            $usageLimit = intval($usageLimit);
            if ($usageLimit > 0) {
                $totalUsed = $couponModel->getTotalRedemptionsCount($coupon['id']);
                if ($totalUsed >= $usageLimit) {
                    sendErrorResponse("This coupon usage limit has been reached.");
                }
            }
        }

        $perUserLimit = $coupon['per_user_limit'] ?? null;
        if ($perUserLimit !== null && $perUserLimit !== '') {
            $perUserLimit = intval($perUserLimit);
            if ($perUserLimit > 0) {
                $usedByUser = $couponModel->getUserRedemptionsCount($coupon['id'], $userId, $customerEmail);
                if ($usedByUser >= $perUserLimit) {
                    sendErrorResponse("You have already used this coupon the maximum number of times.");
                }
            }
        }

        $discountAmount = $couponModel->calculateDiscountAmount($coupon, $subtotal);

        sendJsonResponse([
            "success" => true,
            "coupon" => [
                "id" => intval($coupon['id']),
                "code" => $coupon['code'],
                "discount_type" => $coupon['discount_type'],
                "discount_value" => floatval($coupon['discount_value']),
                "discount_amount" => $discountAmount,
                "message" => "Coupon applied successfully."
            ]
        ]);

        break;

    default:
        sendErrorResponse("Invalid action. Available actions: preview", 404);
}

$conn->close();
?>


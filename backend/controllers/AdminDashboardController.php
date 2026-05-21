<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../config/db.php";
require_once __DIR__ . "/../middleware/authMiddleware.php";

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection not available."]);
    exit;
}

// Require admin auth for all actions
$payload = requireRole('admin', $conn);

$action = $_GET["action"] ?? "";

try {
    switch ($action) {
        case "dashboard_stats":
            handleDashboardStats($conn);
            break;

        case "revenue_stats":
            handleRevenueStats($conn);
            break;

        case "pending_approvals":
            handlePendingApprovals($conn);
            break;

        case "summary":
            handleDashboardSummary($conn);
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

/* ── DASHBOARD STATS ── */
function handleDashboardStats($conn) {
    $today = date('Y-m-d');

    echo json_encode([
        "success" => true,
        "data" => [
            "total_orders"        => getSingleCount($conn, "SELECT COUNT(*) AS total FROM orders"),
            "total_revenue"       => getRevenueSum($conn),
            "total_users"         => getSingleCount($conn, "SELECT COUNT(*) AS total FROM users"),
            "pending_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE approval_status = 'pending'"),
            "active_restaurants"  => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE approval_status = 'approved'"),
            "active_riders"       => getSingleCount($conn, "SELECT COUNT(*) AS total FROM users WHERE role = 'delivery-rider' AND approval_status = 'approved'"),
            "cancelled_today"     => getSingleCount($conn, "SELECT COUNT(*) AS total FROM orders WHERE status = 'cancelled' AND DATE(created_at) = '{$today}'"),
            "pending_users"       => getSingleCount($conn, "SELECT COUNT(*) AS total FROM users WHERE approval_status = 'pending' AND role IN ('restaurant-owner','delivery-rider')"),
            "recent_orders"       => getRecentOrders($conn),
        ]
    ]);
}

/* ── REVENUE STATS ── */
function handleRevenueStats($conn) {
    $sql = "
        SELECT
            DATE(created_at) AS day,
            COALESCE(SUM(subtotal), 0) AS revenue
        FROM orders
        WHERE status NOT IN ('cancelled', 'rejected')
            AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC
    ";

    $result = $conn->query($sql);
    $rows   = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $rows[] = ["day" => $row["day"], "revenue" => round((float)$row["revenue"], 2)];
        }
    }

    echo json_encode(["success" => true, "data" => $rows]);
}

/* ── PENDING APPROVALS ── */
function handlePendingApprovals($conn) {
    // Pending restaurants
    $rSql = "
        SELECT r.id, r.restaurant_name, r.location, r.city, r.created_at,
               COALESCE(u.name, 'Unknown') AS owner_name
        FROM restaurants r
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.approval_status = 'pending'
        ORDER BY r.created_at ASC
        LIMIT 10
    ";

    $rResult = $conn->query($rSql);
    $pendingRestaurants = [];
    if ($rResult) {
        while ($row = $rResult->fetch_assoc()) {
            $pendingRestaurants[] = $row;
        }
    }

    // Pending users (owners + riders)
    $uSql = "
        SELECT id, name, email, role, created_at
        FROM users
        WHERE approval_status = 'pending'
          AND role IN ('restaurant-owner', 'delivery-rider')
        ORDER BY created_at ASC
        LIMIT 10
    ";

    $uResult = $conn->query($uSql);
    $pendingUsers = [];
    if ($uResult) {
        while ($row = $uResult->fetch_assoc()) {
            $pendingUsers[] = $row;
        }
    }

    echo json_encode([
        "success" => true,
        "data" => [
            "pending_restaurants" => $pendingRestaurants,
            "pending_users"       => $pendingUsers,
        ]
    ]);
}

/* ── DASHBOARD SUMMARY (legacy) ── */
function handleDashboardSummary($conn) {
    echo json_encode([
        "success" => true,
        "data" => [
            "total_restaurants"    => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants"),
            "pending_restaurants"  => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE approval_status = 'pending'"),
            "approved_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE approval_status = 'approved'"),
            "rejected_restaurants" => getSingleCount($conn, "SELECT COUNT(*) AS total FROM restaurants WHERE approval_status = 'rejected'"),
            "total_orders"         => getSingleCount($conn, "SELECT COUNT(*) AS total FROM orders"),
            "total_messages"       => getSingleCount($conn, "SELECT COUNT(*) AS total FROM contact_messages"),
            "recent_applications"  => getRecentApplications($conn),
        ]
    ]);
}

/* ── HELPERS ── */
function getRevenueSum($conn) {
    $result = $conn->query("SELECT COALESCE(SUM(subtotal), 0) AS total FROM orders WHERE status NOT IN ('cancelled','rejected')");
    if (!$result) return 0;
    $row = $result->fetch_assoc();
    return round((float)($row["total"] ?? 0), 2);
}

function getRecentOrders($conn) {
    $sql = "
        SELECT
            o.id,
            o.order_number,
            o.customer_name,
            o.customer_email,
            r.restaurant_name,
            o.status,
            o.total,
            o.created_at
        FROM orders o
        LEFT JOIN restaurants r ON o.restaurant_id = r.id
        ORDER BY o.created_at DESC
        LIMIT 10
    ";

    $result = $conn->query($sql);
    if (!$result) return [];

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    return $rows;
}

function getSingleCount($conn, $sql) {
    $result = $conn->query($sql);
    if (!$result) return 0;
    $row = $result->fetch_assoc();
    return isset($row["total"]) ? (int)$row["total"] : 0;
}

function getRecentApplications($conn) {
    $sql = "
        SELECT r.id, r.restaurant_name, r.city, r.approval_status, r.created_at,
               COALESCE(rd.owner_full_name, u.name, 'Unknown') AS owner_full_name
        FROM restaurants r
        LEFT JOIN restaurant_documents rd ON rd.restaurant_id = r.id
        LEFT JOIN users u ON r.owner_user_id = u.id
        ORDER BY r.created_at DESC
        LIMIT 6
    ";

    $result = $conn->query($sql);
    if (!$result) return [];

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    return $rows;
}
?>
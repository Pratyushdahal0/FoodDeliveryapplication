<?php
/**
 * FoodExpress - OwnerDashboardController.php
 * Smart restaurant dashboard metrics + AI delay prediction
 *
 * Replace:
 * backend/controllers/OwnerDashboardController.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

function sendJson($payload, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($payload);
    exit();
}

function failJson($message, $statusCode = 500) {
    sendJson([
        "success" => false,
        "message" => $message
    ], $statusCode);
}

$basePath = __DIR__ . "/../";
$dbPath = $basePath . "config/db.php";

if (!file_exists($dbPath)) {
    failJson("Database config file not found.", 500);
}

require_once $dbPath;

if (!isset($conn)) {
    failJson("Database connection variable \$conn not found.", 500);
}

if ($conn->connect_error) {
    failJson("Database connection failed: " . $conn->connect_error, 500);
}

$conn->set_charset("utf8mb4");

$restaurantId = isset($_GET["restaurant_id"]) ? (int) $_GET["restaurant_id"] : 1;

if ($restaurantId <= 0) {
    $restaurantId = 1;
}

try {
    $restaurant = getRestaurantState($conn, $restaurantId);
    $metrics = getDashboardMetrics($conn, $restaurantId);
    $recentOrders = getRecentOrders($conn, $restaurantId);
    $urgentOrders = getUrgentOrders($conn, $restaurantId);
    $mostOrderedItems = getMostOrderedItems($conn, $restaurantId);
    $aiPrediction = buildSmartDelayPrediction($conn, $restaurantId, $metrics, $restaurant, $urgentOrders);
    $healthScore = buildRestaurantHealthScore($metrics, $restaurant, $aiPrediction);

    sendJson([
        "success" => true,
        "data" => [
            "restaurant_id" => $restaurantId,
            "restaurant_state" => $restaurant,

            "total_orders" => (int) $metrics["total_orders"],
            "today_orders" => (int) $metrics["today_orders"],
            "pending_orders" => (int) $metrics["pending_orders"],
            "confirmed_orders" => (int) $metrics["confirmed_orders"],
            "preparing_orders" => (int) $metrics["preparing_orders"],
            "ready_for_pickup_orders" => (int) $metrics["ready_for_pickup_orders"],
            "completed_orders" => (int) $metrics["completed_orders"],
            "cancelled_orders" => (int) $metrics["cancelled_orders"],
            "active_orders" => (int) $metrics["active_orders"],

            "today_revenue" => (float) $metrics["today_revenue"],
            "weekly_earnings" => (float) $metrics["weekly_earnings"],
            "average_prep_minutes" => (int) $metrics["average_prep_minutes"],

            "recent_orders" => $recentOrders,
            "urgent_orders" => $urgentOrders,
            "most_ordered_items" => $mostOrderedItems,

            "ai_delay_prediction" => $aiPrediction,
            "restaurant_health_score" => $healthScore
        ]
    ]);
} catch (Throwable $e) {
    failJson("Owner dashboard error: " . $e->getMessage(), 500);
}

/**
 * Restaurant state
 */
function getRestaurantState($conn, $restaurantId) {
    $sql = "
        SELECT
            id,
            restaurant_name,
            status,
            delivery_available,
            COALESCE(is_open, 1) AS is_open,
            COALESCE(accepting_orders, 1) AS accepting_orders,
            COALESCE(busy_mode, 0) AS busy_mode,
            COALESCE(estimated_prep_minutes, 25) AS estimated_prep_minutes
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
        return [
            "id" => $restaurantId,
            "restaurant_name" => "Restaurant",
            "status" => "active",
            "delivery_available" => 1,
            "is_open" => 1,
            "accepting_orders" => 1,
            "busy_mode" => 0,
            "estimated_prep_minutes" => 25
        ];
    }

    return [
        "id" => (int) $restaurant["id"],
        "restaurant_name" => $restaurant["restaurant_name"] ?? "Restaurant",
        "status" => $restaurant["status"] ?? "active",
        "delivery_available" => (int) ($restaurant["delivery_available"] ?? 1),
        "is_open" => (int) ($restaurant["is_open"] ?? 1),
        "accepting_orders" => (int) ($restaurant["accepting_orders"] ?? 1),
        "busy_mode" => (int) ($restaurant["busy_mode"] ?? 0),
        "estimated_prep_minutes" => (int) ($restaurant["estimated_prep_minutes"] ?? 25)
    ];
}

/**
 * Main dashboard metrics
 */
function getDashboardMetrics($conn, $restaurantId) {
    $sql = "
        SELECT
            COUNT(*) AS total_orders,

            SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_orders,

            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_orders,
            SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) AS preparing_orders,
            SUM(CASE WHEN status = 'ready_for_pickup' THEN 1 ELSE 0 END) AS ready_for_pickup_orders,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS completed_orders,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,

            SUM(CASE WHEN status IN ('pending','confirmed','preparing','ready_for_pickup') THEN 1 ELSE 0 END) AS active_orders,

            COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status != 'cancelled' THEN total ELSE 0 END), 0) AS today_revenue,

            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status != 'cancelled' THEN total ELSE 0 END), 0) AS weekly_earnings,

            COALESCE(AVG(
                CASE
                    WHEN ready_for_pickup_at IS NOT NULL AND confirmed_at IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, confirmed_at, ready_for_pickup_at)
                    ELSE NULL
                END
            ), 0) AS average_prep_minutes

        FROM orders
        WHERE restaurant_id = ?
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();

    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return [
        "total_orders" => (int) ($row["total_orders"] ?? 0),
        "today_orders" => (int) ($row["today_orders"] ?? 0),
        "pending_orders" => (int) ($row["pending_orders"] ?? 0),
        "confirmed_orders" => (int) ($row["confirmed_orders"] ?? 0),
        "preparing_orders" => (int) ($row["preparing_orders"] ?? 0),
        "ready_for_pickup_orders" => (int) ($row["ready_for_pickup_orders"] ?? 0),
        "completed_orders" => (int) ($row["completed_orders"] ?? 0),
        "cancelled_orders" => (int) ($row["cancelled_orders"] ?? 0),
        "active_orders" => (int) ($row["active_orders"] ?? 0),
        "today_revenue" => (float) ($row["today_revenue"] ?? 0),
        "weekly_earnings" => (float) ($row["weekly_earnings"] ?? 0),
        "average_prep_minutes" => (int) round((float) ($row["average_prep_minutes"] ?? 0))
    ];
}

/**
 * Recent orders for dashboard table
 */
function getRecentOrders($conn, $restaurantId) {
    $sql = "
        SELECT
            id,
            order_number,
            customer_name,
            total,
            status,
            delivery_status,
            rider_name,
            created_at,
            updated_at
        FROM orders
        WHERE restaurant_id = ?
        ORDER BY created_at DESC
        LIMIT 8
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();

    $result = $stmt->get_result();
    $orders = [];

    while ($row = $result->fetch_assoc()) {
        $orders[] = [
            "id" => (int) $row["id"],
            "order_number" => $row["order_number"],
            "customer_name" => $row["customer_name"],
            "total" => (float) $row["total"],
            "status" => $row["status"],
            "delivery_status" => $row["delivery_status"],
            "rider_name" => $row["rider_name"],
            "created_at" => $row["created_at"],
            "updated_at" => $row["updated_at"]
        ];
    }

    $stmt->close();
    return $orders;
}

/**
 * Urgent orders for smarter AI prediction
 */
function getUrgentOrders($conn, $restaurantId) {
    $sql = "
        SELECT
            id,
            order_number,
            customer_name,
            status,
            delivery_status,
            total,
            created_at,
            confirmed_at,
            preparing_at,
            ready_for_pickup_at,

            CASE
                WHEN status = 'pending'
                    THEN TIMESTAMPDIFF(MINUTE, created_at, NOW())
                WHEN status = 'confirmed'
                    THEN TIMESTAMPDIFF(MINUTE, COALESCE(confirmed_at, updated_at, created_at), NOW())
                WHEN status = 'preparing'
                    THEN TIMESTAMPDIFF(MINUTE, COALESCE(preparing_at, confirmed_at, updated_at, created_at), NOW())
                WHEN status = 'ready_for_pickup'
                    THEN TIMESTAMPDIFF(MINUTE, COALESCE(ready_for_pickup_at, updated_at, created_at), NOW())
                ELSE 0
            END AS wait_minutes

        FROM orders
        WHERE restaurant_id = ?
          AND status IN ('pending','confirmed','preparing','ready_for_pickup')
        ORDER BY wait_minutes DESC, created_at ASC
        LIMIT 10
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();

    $result = $stmt->get_result();
    $orders = [];

    while ($row = $result->fetch_assoc()) {
        $waitMinutes = max(0, (int) ($row["wait_minutes"] ?? 0));

        $orders[] = [
            "id" => (int) $row["id"],
            "order_number" => $row["order_number"],
            "customer_name" => $row["customer_name"],
            "status" => $row["status"],
            "delivery_status" => $row["delivery_status"],
            "total" => (float) $row["total"],
            "created_at" => $row["created_at"],
            "confirmed_at" => $row["confirmed_at"],
            "preparing_at" => $row["preparing_at"],
            "ready_for_pickup_at" => $row["ready_for_pickup_at"],
            "wait_minutes" => $waitMinutes
        ];
    }

    $stmt->close();
    return $orders;
}

/**
 * Most ordered items
 */
function getMostOrderedItems($conn, $restaurantId) {
    $sql = "
        SELECT
            oi.product_name AS item_name,
            SUM(oi.quantity) AS total_qty,
            COUNT(DISTINCT oi.order_id) AS order_count
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        WHERE o.restaurant_id = ?
        GROUP BY oi.product_name
        ORDER BY total_qty DESC, order_count DESC
        LIMIT 6
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $restaurantId);
    $stmt->execute();

    $result = $stmt->get_result();
    $items = [];

    while ($row = $result->fetch_assoc()) {
        $items[] = [
            "item_name" => $row["item_name"] ?? "Food item",
            "total_qty" => (int) ($row["total_qty"] ?? 0),
            "order_count" => (int) ($row["order_count"] ?? 0)
        ];
    }

    $stmt->close();
    return $items;
}

/**
 * Smarter AI-style delay prediction
 *
 * This is rule-based AI logic for now.
 * It gives futuristic demo value without needing paid API keys.
 */
function buildSmartDelayPrediction($conn, $restaurantId, $metrics, $restaurant, $urgentOrders) {
    $score = 0;
    $reasons = [];
    $recommendations = [];

    $pending = (int) $metrics["pending_orders"];
    $confirmed = (int) $metrics["confirmed_orders"];
    $preparing = (int) $metrics["preparing_orders"];
    $ready = (int) $metrics["ready_for_pickup_orders"];
    $active = (int) $metrics["active_orders"];
    $avgPrep = (int) $metrics["average_prep_minutes"];

    $isOpen = (int) ($restaurant["is_open"] ?? 1);
    $accepting = (int) ($restaurant["accepting_orders"] ?? 1);
    $busyMode = (int) ($restaurant["busy_mode"] ?? 0);
    $estimatedPrep = (int) ($restaurant["estimated_prep_minutes"] ?? 25);

    $oldestWait = 0;
    $oldestPending = 0;
    $oldestConfirmed = 0;
    $oldestPreparing = 0;
    $oldestReady = 0;

    foreach ($urgentOrders as $order) {
        $status = $order["status"];
        $wait = (int) $order["wait_minutes"];

        $oldestWait = max($oldestWait, $wait);

        if ($status === "pending") {
            $oldestPending = max($oldestPending, $wait);
        }

        if ($status === "confirmed") {
            $oldestConfirmed = max($oldestConfirmed, $wait);
        }

        if ($status === "preparing") {
            $oldestPreparing = max($oldestPreparing, $wait);
        }

        if ($status === "ready_for_pickup") {
            $oldestReady = max($oldestReady, $wait);
        }
    }

    /**
     * Pending order risk
     */
    if ($pending >= 1) {
        $score += min(18, $pending * 6);
        $reasons[] = "{$pending} pending order" . ($pending > 1 ? "s need" : " needs") . " restaurant confirmation.";
        $recommendations[] = "Confirm or reject pending orders quickly.";
    }

    if ($oldestPending >= 8) {
        $score += 18;
        $reasons[] = "Oldest pending order has waited {$oldestPending} minutes.";
        $recommendations[] = "Prioritize the oldest pending order first.";
    }

    if ($oldestPending >= 15) {
        $score += 14;
        $reasons[] = "A pending order has crossed 15 minutes, which may frustrate the customer.";
        $recommendations[] = "Use busy mode if the kitchen cannot accept more orders.";
    }

    /**
     * Confirmed order risk
     */
    if ($confirmed >= 2) {
        $score += min(12, $confirmed * 4);
        $reasons[] = "{$confirmed} confirmed orders are waiting to start preparation.";
        $recommendations[] = "Move confirmed orders into preparation.";
    }

    if ($oldestConfirmed >= 10) {
        $score += 12;
        $reasons[] = "A confirmed order has not started preparation for {$oldestConfirmed} minutes.";
        $recommendations[] = "Start preparation or update kitchen ETA.";
    }

    /**
     * Preparing order risk
     */
    if ($preparing >= 3) {
        $score += min(18, $preparing * 5);
        $reasons[] = "{$preparing} orders are preparing at the same time.";
        $recommendations[] = "Batch similar items and clear the oldest preparation first.";
    }

    if ($oldestPreparing >= max(25, $estimatedPrep)) {
        $score += 20;
        $reasons[] = "A preparing order has exceeded the estimated prep time of {$estimatedPrep} minutes.";
        $recommendations[] = "Mark ready if complete, or increase estimated prep time.";
    } elseif ($oldestPreparing >= 18) {
        $score += 10;
        $reasons[] = "A preparing order has been active for {$oldestPreparing} minutes.";
        $recommendations[] = "Check kitchen queue and avoid delay before rider pickup.";
    }

    /**
     * Ready-for-pickup rider handoff risk
     */
    if ($ready >= 1) {
        $score += min(16, $ready * 8);
        $reasons[] = "{$ready} order" . ($ready > 1 ? "s are" : " is") . " ready for pickup and waiting for rider handoff.";
        $recommendations[] = "Monitor rider assignment for ready orders.";
    }

    if ($oldestReady >= 10) {
        $score += 18;
        $reasons[] = "A ready-for-pickup order has been waiting {$oldestReady} minutes for rider assignment.";
        $recommendations[] = "Escalate rider handoff or notify delivery operations.";
    }

    if ($oldestReady >= 20) {
        $score += 16;
        $reasons[] = "Ready order waiting time is above 20 minutes, increasing cold-food risk.";
        $recommendations[] = "Prioritize rider dispatch immediately.";
    }

    /**
     * Overall pressure risk
     */
    if ($active >= 4) {
        $score += 14;
        $reasons[] = "{$active} active restaurant orders are currently open.";
        $recommendations[] = "Consider enabling busy mode temporarily.";
    }

    if ($active >= 7) {
        $score += 18;
        $reasons[] = "Kitchen pressure is high with {$active} active orders.";
        $recommendations[] = "Pause new orders or increase prep time estimate.";
    }

    /**
     * Restaurant state risk
     */
    if ($busyMode === 1) {
        $score += 8;
        $reasons[] = "Busy mode is active, meaning kitchen load is already high.";
        $recommendations[] = "Keep prep time estimate realistic while busy mode is on.";
    }

    if ($isOpen !== 1) {
        $score += 12;
        $reasons[] = "Restaurant is currently marked closed.";
        $recommendations[] = "Do not accept new orders while closed.";
    }

    if ($accepting !== 1) {
        $score += 10;
        $reasons[] = "Restaurant is not accepting new orders.";
        $recommendations[] = "Resume accepting only after active orders are under control.";
    }

    /**
     * Historical prep performance risk
     */
    if ($avgPrep >= 35) {
        $score += 10;
        $reasons[] = "Average preparation time is {$avgPrep} minutes.";
        $recommendations[] = "Review slow items and kitchen bottlenecks.";
    }

    $score = max(0, min(100, $score));

    if ($score >= 80) {
        $risk = "critical";
        $label = "Critical delay risk";
    } elseif ($score >= 55) {
        $risk = "high";
        $label = "High delay risk";
    } elseif ($score >= 25) {
        $risk = "medium";
        $label = "Medium delay risk";
    } else {
        $risk = "low";
        $label = "Low delay risk";
    }

    if (empty($reasons)) {
        $reasons[] = "No major delay signals detected right now.";
    }

    $suggestion = buildAiSuggestion($risk, $recommendations, $pending, $preparing, $ready, $oldestReady);

    return [
        "score" => $score,
        "risk" => $risk,
        "label" => $label,
        "reasons" => array_values(array_unique($reasons)),
        "suggestion" => $suggestion,
        "oldest_wait_minutes" => $oldestWait,
        "oldest_pending_minutes" => $oldestPending,
        "oldest_preparing_minutes" => $oldestPreparing,
        "oldest_ready_for_pickup_minutes" => $oldestReady,
        "active_orders" => $active,
        "recommended_actions" => array_values(array_unique($recommendations))
    ];
}

function buildAiSuggestion($risk, $recommendations, $pending, $preparing, $ready, $oldestReady) {
    if (!empty($recommendations)) {
        return $recommendations[0];
    }

    if ($risk === "critical") {
        return "Pause new orders, clear the oldest active order, and escalate rider handoff immediately.";
    }

    if ($risk === "high") {
        return "Prioritize delayed orders and consider enabling busy mode for the next 30 minutes.";
    }

    if ($risk === "medium") {
        if ($ready > 0 && $oldestReady >= 10) {
            return "Monitor rider assignment because a ready order is waiting too long.";
        }

        if ($pending > 0) {
            return "Confirm pending orders quickly to avoid customer waiting time.";
        }

        if ($preparing > 0) {
            return "Keep kitchen queue moving and mark completed food as ready for pickup.";
        }

        return "Monitor active orders and keep the estimated prep time realistic.";
    }

    return "Kitchen flow looks healthy. Keep monitoring pending orders and rider handoff.";
}

/**
 * Health score for future dashboard use.
 * Existing frontend can ignore this safely.
 */
function buildRestaurantHealthScore($metrics, $restaurant, $aiPrediction) {
    $score = 100;

    $score -= (int) round($aiPrediction["score"] * 0.45);
    $score -= min(12, (int) $metrics["pending_orders"] * 3);
    $score -= min(12, (int) $metrics["ready_for_pickup_orders"] * 4);
    $score -= min(10, (int) $metrics["cancelled_orders"]);

    if ((int) ($restaurant["busy_mode"] ?? 0) === 1) {
        $score -= 5;
    }

    if ((int) ($restaurant["is_open"] ?? 1) !== 1) {
        $score -= 10;
    }

    $score = max(0, min(100, $score));

    if ($score >= 85) {
        $label = "Excellent";
    } elseif ($score >= 70) {
        $label = "Healthy";
    } elseif ($score >= 50) {
        $label = "Needs attention";
    } else {
        $label = "Critical";
    }

    return [
        "score" => $score,
        "label" => $label
    ];
}
?>
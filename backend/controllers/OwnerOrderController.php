<?php
/*
|--------------------------------------------------------------------------
| FoodExpress - Restaurant Owner Order Controller
|--------------------------------------------------------------------------
| Safe restaurant-owner-only controller. It does not replace customer checkout,
| customer tracking, rider delivery, reward, review, or support endpoints.
|
| Actions:
| GET  ?action=list&restaurant_id=1
| GET  ?action=single&order_id=1&restaurant_id=1
| POST ?action=update_status
|      JSON: { order_id, restaurant_id, status, cancel_reason?, owner_user_id? }
*/

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../models/Notification.php';

function ownerJson($payload, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function ownerFail($message, $statusCode = 400, $extra = []) {
    ownerJson(array_merge([
        'success' => false,
        'message' => $message
    ], $extra), $statusCode);
}

function ownerInput() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function tableHasColumn($conn, $table, $column) {
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) return $cache[$key];

    $sql = "SELECT COUNT(*) AS count_cols
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : ['count_cols' => 0];
    $stmt->close();

    $cache[$key] = intval($row['count_cols'] ?? 0) > 0;
    return $cache[$key];
}

function tableExists($conn, $table) {
    static $cache = [];
    if (array_key_exists($table, $cache)) return $cache[$table];

    $sql = "SELECT COUNT(*) AS count_tables
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : ['count_tables' => 0];
    $stmt->close();

    $cache[$table] = intval($row['count_tables'] ?? 0) > 0;
    return $cache[$table];
}

function selectOrderFields($conn) {
    $fields = [
        'o.id',
        'o.order_number',
        tableHasColumn($conn, 'orders', 'user_id') ? 'o.user_id' : 'NULL AS user_id',
        tableHasColumn($conn, 'orders', 'restaurant_id') ? 'o.restaurant_id' : 'NULL AS restaurant_id',
        'o.customer_name',
        tableHasColumn($conn, 'orders', 'customer_email') ? 'o.customer_email' : 'NULL AS customer_email',
        'o.phone_number',
        'o.address',
        'o.city',
        'o.postal_code',
        'o.payment_method',
        'o.subtotal',
        'o.tax',
        'o.delivery_fee',
        'o.total',
        'o.status',
        tableHasColumn($conn, 'orders', 'delivery_status') ? 'o.delivery_status' : "'pending' AS delivery_status",
        tableHasColumn($conn, 'orders', 'rider_id') ? 'o.rider_id' : 'NULL AS rider_id',
        tableHasColumn($conn, 'orders', 'rider_name') ? 'o.rider_name' : 'NULL AS rider_name',
        tableHasColumn($conn, 'orders', 'rider_email') ? 'o.rider_email' : 'NULL AS rider_email',
        tableHasColumn($conn, 'orders', 'rider_phone') ? 'o.rider_phone' : 'NULL AS rider_phone',
        'o.notes',
        tableHasColumn($conn, 'orders', 'cancel_reason') ? 'o.cancel_reason' : 'NULL AS cancel_reason',
        tableHasColumn($conn, 'orders', 'confirmed_at') ? 'o.confirmed_at' : 'NULL AS confirmed_at',
        tableHasColumn($conn, 'orders', 'preparing_at') ? 'o.preparing_at' : 'NULL AS preparing_at',
        tableHasColumn($conn, 'orders', 'ready_for_pickup_at') ? 'o.ready_for_pickup_at' : 'NULL AS ready_for_pickup_at',
        tableHasColumn($conn, 'orders', 'picked_up_at') ? 'o.picked_up_at' : 'NULL AS picked_up_at',
        tableHasColumn($conn, 'orders', 'on_the_way_at') ? 'o.on_the_way_at' : 'NULL AS on_the_way_at',
        tableHasColumn($conn, 'orders', 'delivered_at') ? 'o.delivered_at' : 'NULL AS delivered_at',
        tableHasColumn($conn, 'orders', 'estimated_prep_minutes') ? 'o.estimated_prep_minutes' : 'NULL AS estimated_prep_minutes',
        'o.created_at',
        'o.updated_at'
    ];

    if (tableExists($conn, 'restaurants')) {
        $fields[] = tableHasColumn($conn, 'restaurants', 'restaurant_name') ? 'r.restaurant_name' : 'NULL AS restaurant_name';
    } else {
        $fields[] = 'NULL AS restaurant_name';
    }

    return implode(', ', $fields);
}

function restaurantJoinSql($conn) {
    if (tableExists($conn, 'restaurants') && tableHasColumn($conn, 'orders', 'restaurant_id')) {
        return ' LEFT JOIN restaurants r ON r.id = o.restaurant_id ';
    }
    return ' ';
}

function fetchOrderItems($conn, $orderId) {
    if (!tableExists($conn, 'order_items')) return [];

    $stmt = $conn->prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC");
    if (!$stmt) return [];
    $stmt->bind_param('i', $orderId);
    $stmt->execute();
    $result = $stmt->get_result();
    $items = [];
    while ($result && ($row = $result->fetch_assoc())) {
        $items[] = $row;
    }
    $stmt->close();
    return $items;
}

function fetchStatusHistory($conn, $orderId) {
    if (!tableExists($conn, 'order_status_history')) return [];

    $stmt = $conn->prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC");
    if (!$stmt) return [];
    $stmt->bind_param('i', $orderId);
    $stmt->execute();
    $result = $stmt->get_result();
    $history = [];
    while ($result && ($row = $result->fetch_assoc())) {
        $history[] = $row;
    }
    $stmt->close();
    return $history;
}

function hydrateOrder($conn, $order, $withHistory = false) {
    if (!$order) return null;
    $order['items'] = fetchOrderItems($conn, intval($order['id']));
    if ($withHistory) {
        $order['status_history'] = fetchStatusHistory($conn, intval($order['id']));
    }
    return $order;
}

function fetchOrderById($conn, $orderId, $restaurantId = 0, $withHistory = false) {
    $fields = selectOrderFields($conn);
    $join = restaurantJoinSql($conn);

    $where = ' WHERE o.id = ? ';
    $types = 'i';
    $params = [$orderId];

    if ($restaurantId > 0 && tableHasColumn($conn, 'orders', 'restaurant_id')) {
        $where .= ' AND o.restaurant_id = ? ';
        $types .= 'i';
        $params[] = $restaurantId;
    }

    $sql = "SELECT {$fields} FROM orders o {$join} {$where} LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) return null;

    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $order = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    return hydrateOrder($conn, $order, $withHistory);
}

function insertHistory($conn, $order, $oldStatus, $newStatus, $note = '', $ownerUserId = null) {
    if (!tableExists($conn, 'order_status_history')) return true;

    $orderId = intval($order['id'] ?? 0);
    $orderNumber = $order['order_number'] ?? null;
    $restaurantId = isset($order['restaurant_id']) ? intval($order['restaurant_id']) : null;
    $changedByRole = 'restaurant-owner';

    $stmt = $conn->prepare("INSERT INTO order_status_history
        (order_id, order_number, restaurant_id, changed_by_user_id, changed_by_role, old_status, new_status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    if (!$stmt) return false;

    $stmt->bind_param(
        'isiissss',
        $orderId,
        $orderNumber,
        $restaurantId,
        $ownerUserId,
        $changedByRole,
        $oldStatus,
        $newStatus,
        $note
    );
    $success = $stmt->execute();
    $stmt->close();
    return $success;
}

function notifyCustomer($conn, $order, $type, $title, $message) {
    if (!tableExists($conn, 'notifications')) return true;

    $notification = new Notification($conn);
    return $notification->create([
        'user_id' => isset($order['user_id']) ? intval($order['user_id']) : null,
        'user_email' => trim($order['customer_email'] ?? ''),
        'role' => 'customer',
        'order_id' => intval($order['id']),
        'order_number' => $order['order_number'] ?? null,
        'type' => $type,
        'title' => $title,
        'message' => $message
    ]);
}

function notificationForStatus($status, $order, $reason = '') {
    $number = $order['order_number'] ?? ('#' . ($order['id'] ?? ''));

    $map = [
        'confirmed' => [
            'restaurant_confirmed',
            'Restaurant confirmed your order',
            "Your order {$number} has been confirmed by the restaurant."
        ],
        'preparing' => [
            'restaurant_preparing',
            'Your food is being prepared',
            "The restaurant has started preparing your order {$number}."
        ],
        'ready_for_pickup' => [
            'ready_for_pickup',
            'Order ready for pickup',
            "Your order {$number} is ready. We are finding a rider for pickup."
        ],
        'cancelled' => [
            'restaurant_cancelled',
            'Order cancelled by restaurant',
            trim($reason) !== ''
                ? "Your order {$number} was cancelled by the restaurant. Reason: {$reason}"
                : "Your order {$number} was cancelled by the restaurant."
        ]
    ];

    return $map[$status] ?? null;
}

function updateRestaurantStatus($conn, $orderId, $restaurantId, $nextStatus, $cancelReason = '', $ownerUserId = null) {
    $allowedTransitions = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['preparing', 'cancelled'],
        'preparing' => ['ready_for_pickup'],
        'ready_for_pickup' => [],
        'picked_up' => [],
        'on_the_way' => [],
        'delivered' => [],
        'cancelled' => []
    ];

    $validStatuses = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'picked_up', 'on_the_way', 'delivered', 'cancelled'];
    if (!in_array($nextStatus, $validStatuses, true)) {
        return ['success' => false, 'message' => 'Invalid order status.'];
    }

    $current = fetchOrderById($conn, $orderId, $restaurantId, false);
    if (!$current) {
        return ['success' => false, 'message' => 'Order not found for this restaurant.'];
    }

    $oldStatus = strtolower(trim($current['status'] ?? 'pending'));
    if ($oldStatus === $nextStatus) {
        return ['success' => true, 'message' => 'Order already has this status.', 'data' => hydrateOrder($conn, $current, true)];
    }

    if (!in_array($nextStatus, $allowedTransitions[$oldStatus] ?? [], true)) {
        return [
            'success' => false,
            'message' => "Restaurant owner cannot move order from {$oldStatus} to {$nextStatus}."
        ];
    }

    if ($nextStatus === 'cancelled' && trim($cancelReason) === '') {
        return ['success' => false, 'message' => 'Cancellation reason is required.'];
    }

    $set = ['status = ?', 'updated_at = NOW()'];
    $types = 's';
    $params = [$nextStatus];

    if ($nextStatus === 'confirmed' && tableHasColumn($conn, 'orders', 'confirmed_at')) {
        $set[] = 'confirmed_at = COALESCE(confirmed_at, NOW())';
    }

    if ($nextStatus === 'preparing' && tableHasColumn($conn, 'orders', 'preparing_at')) {
        $set[] = 'preparing_at = COALESCE(preparing_at, NOW())';
    }

    if ($nextStatus === 'ready_for_pickup') {
        if (tableHasColumn($conn, 'orders', 'ready_for_pickup_at')) {
            $set[] = 'ready_for_pickup_at = COALESCE(ready_for_pickup_at, NOW())';
        }
        if (tableHasColumn($conn, 'orders', 'delivery_status')) {
            $set[] = "delivery_status = 'searching'";
        }
        if (tableHasColumn($conn, 'orders', 'rider_id')) $set[] = 'rider_id = NULL';
        if (tableHasColumn($conn, 'orders', 'rider_name')) $set[] = 'rider_name = NULL';
        if (tableHasColumn($conn, 'orders', 'rider_email')) $set[] = 'rider_email = NULL';
        if (tableHasColumn($conn, 'orders', 'rider_phone')) $set[] = 'rider_phone = NULL';
    }

    if ($nextStatus === 'cancelled') {
        if (tableHasColumn($conn, 'orders', 'cancel_reason')) {
            $set[] = 'cancel_reason = ?';
            $types .= 's';
            $params[] = $cancelReason;
        }
        if (tableHasColumn($conn, 'orders', 'cancelled_at')) $set[] = 'cancelled_at = NOW()';
        if (tableHasColumn($conn, 'orders', 'cancelled_by')) $set[] = "cancelled_by = 'restaurant-owner'";
        if (tableHasColumn($conn, 'orders', 'delivery_status')) $set[] = "delivery_status = 'unassigned'";
    }

    $where = ' WHERE id = ? ';
    $types .= 'i';
    $params[] = $orderId;

    if ($restaurantId > 0 && tableHasColumn($conn, 'orders', 'restaurant_id')) {
        $where .= ' AND restaurant_id = ? ';
        $types .= 'i';
        $params[] = $restaurantId;
    }

    $sql = 'UPDATE orders SET ' . implode(', ', $set) . $where;
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return ['success' => false, 'message' => 'Database prepare failed: ' . $conn->error];
    }

    $stmt->bind_param($types, ...$params);
    $success = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if (!$success || $affected < 1) {
        return ['success' => false, 'message' => 'Status update failed or no rows changed.'];
    }

    insertHistory($conn, $current, $oldStatus, $nextStatus, $cancelReason, $ownerUserId);

    $updated = fetchOrderById($conn, $orderId, $restaurantId, true);

    $notice = notificationForStatus($nextStatus, $updated ?: $current, $cancelReason);
    if ($notice) {
        notifyCustomer($conn, $updated ?: $current, $notice[0], $notice[1], $notice[2]);
    }

    return [
        'success' => true,
        'message' => 'Order status updated successfully.',
        'data' => $updated
    ];
}

$action = $_GET['action'] ?? '';

try {
    if ($action === 'list') {
        $restaurantId = intval($_GET['restaurant_id'] ?? 0);
        $limit = max(1, min(200, intval($_GET['limit'] ?? 100)));

        if ($restaurantId <= 0) {
            ownerFail('restaurant_id is required.');
        }

        $fields = selectOrderFields($conn);
        $join = restaurantJoinSql($conn);
        $where = tableHasColumn($conn, 'orders', 'restaurant_id')
            ? 'WHERE o.restaurant_id = ?'
            : 'WHERE 1 = 1';

        $sql = "SELECT {$fields}
                FROM orders o
                {$join}
                {$where}
                ORDER BY o.created_at DESC
                LIMIT ?";

        $stmt = $conn->prepare($sql);
        if (!$stmt) ownerFail('Could not load owner orders: ' . $conn->error, 500);

        if (tableHasColumn($conn, 'orders', 'restaurant_id')) {
            $stmt->bind_param('ii', $restaurantId, $limit);
        } else {
            $stmt->bind_param('i', $limit);
        }

        $stmt->execute();
        $result = $stmt->get_result();
        $orders = [];
        while ($result && ($row = $result->fetch_assoc())) {
            $orders[] = hydrateOrder($conn, $row, false);
        }
        $stmt->close();

        ownerJson([
            'success' => true,
            'data' => $orders
        ]);
    }

    if ($action === 'single') {
        $orderId = intval($_GET['order_id'] ?? 0);
        $restaurantId = intval($_GET['restaurant_id'] ?? 0);

        if ($orderId <= 0) ownerFail('order_id is required.');
        if ($restaurantId <= 0) ownerFail('restaurant_id is required.');

        $order = fetchOrderById($conn, $orderId, $restaurantId, true);
        if (!$order) ownerFail('Order not found for this restaurant.', 404);

        ownerJson([
            'success' => true,
            'data' => $order
        ]);
    }

    if ($action === 'update_status') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            ownerFail('Use POST for update_status.', 405);
        }

        $input = ownerInput();
        $orderId = intval($input['order_id'] ?? 0);
        $restaurantId = intval($input['restaurant_id'] ?? 0);
        $nextStatus = strtolower(trim($input['status'] ?? ''));
        $cancelReason = trim($input['cancel_reason'] ?? '');
        $ownerUserId = isset($input['owner_user_id']) ? intval($input['owner_user_id']) : null;

        if ($orderId <= 0) ownerFail('order_id is required.');
        if ($restaurantId <= 0) ownerFail('restaurant_id is required.');
        if ($nextStatus === '') ownerFail('status is required.');

        $result = updateRestaurantStatus($conn, $orderId, $restaurantId, $nextStatus, $cancelReason, $ownerUserId);
        ownerJson($result, !empty($result['success']) ? 200 : 400);
    }

    ownerFail('Invalid action. Use list, single, or update_status.', 404);
} catch (Throwable $e) {
    ownerFail('Owner order controller error: ' . $e->getMessage(), 500);
} finally {
    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }
}

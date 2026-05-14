<?php
/**
 * FoodExpress — Cancellation & Refund Controller
 *
 * Actions:
 *  cancel_order    – Customer / Owner / Rider / Admin cancels
 *  refund_request  – Admin creates refund record
 *  refund_update   – Admin updates refund status (approve/reject/process)
 *  cancellation_log – Admin view all cancellations
 *
 * Business rules:
 *  Customer  → can cancel ONLY while status = 'pending'
 *  Owner     → can cancel while status IN ('pending','confirmed','preparing')
 *  Rider     → can cancel while status IN ('ready_for_pickup','picked_up') — with mandatory reason
 *  Admin     → can cancel any non-delivered order
 *
 * Refund eligibility:
 *  Digital payment (eSewa / Khalti / card) + cancelled before 'preparing' → FULL refund eligible
 *  Digital payment + cancelled during 'preparing'                         → PARTIAL refund eligible
 *  Digital payment + cancelled after 'preparing'                          → NOT eligible
 *  COD / Cash                                                             → NOT applicable
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('Asia/Kathmandu');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../models/Notification.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

function jsonResp(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function getInput(): array
{
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/* ── Refund eligibility resolver ─────────────────────────────────────────── */
function resolveRefundEligibility(array $order): array
{
    $paymentMethod  = strtolower($order['payment_method']  ?? 'cash');
    $paymentStatus  = strtolower($order['payment_status']  ?? 'pending');
    $orderStatus    = strtolower($order['status']          ?? 'pending');
    $total          = floatval($order['total']             ?? 0);

    $digitalMethods = ['digital', 'esewa', 'khalti', 'card'];
    $isDigital      = in_array($paymentMethod, $digitalMethods, true);
    $isPaid         = ($paymentStatus === 'paid');

    if (!$isDigital || !$isPaid) {
        return [
            'eligible'     => false,
            'amount'       => 0.00,
            'type'         => 'not_applicable',
            'reason'       => $isDigital ? 'Order was not paid digitally.' : 'Cash on Delivery — no refund applicable.',
        ];
    }

    // Before preparing = full refund
    $beforePrep = in_array($orderStatus, ['pending', 'confirmed'], true);
    if ($beforePrep) {
        return [
            'eligible' => true,
            'amount'   => $total,
            'type'     => 'full',
            'reason'   => 'Cancelled before preparation — full refund eligible.',
        ];
    }

    // During preparing = partial refund (50%)
    if ($orderStatus === 'preparing') {
        return [
            'eligible' => true,
            'amount'   => round($total * 0.5, 2),
            'type'     => 'partial',
            'reason'   => 'Cancelled during preparation — partial refund (50%) eligible.',
        ];
    }

    // After preparing = no refund
    return [
        'eligible' => false,
        'amount'   => 0.00,
        'type'     => 'none',
        'reason'   => 'Cancelled after preparation started — no refund applicable.',
    ];
}

/* ── Notification helper ─────────────────────────────────────────────────── */
function notifyUser(Notification $notification, array $order, string $type, string $title, string $message): void
{
    try {
        $notification->create([
            'user_id'      => $order['user_id']         ?? null,
            'user_email'   => $order['customer_email']  ?? '',
            'role'         => 'customer',
            'order_id'     => intval($order['id']       ?? 0),
            'order_number' => $order['order_number']    ?? null,
            'type'         => $type,
            'title'        => $title,
            'message'      => $message,
        ]);
    } catch (Throwable $e) {
        error_log('[CancellationController] Notification error: ' . $e->getMessage());
    }
}

function notifyOwner(Notification $notification, mysqli $conn, array $order, string $type, string $title, string $message): void
{
    $restaurantId = intval($order['restaurant_id'] ?? 0);
    if (!$restaurantId) return;

    $stmt = $conn->prepare("
        SELECT r.owner_user_id, u.email AS owner_email
        FROM restaurants r
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.id = ? LIMIT 1
    ");
    if (!$stmt) return;

    $stmt->bind_param('i', $restaurantId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row || empty($row['owner_email'])) return;

    try {
        $notification->create([
            'user_id'      => $row['owner_user_id'] ?? null,
            'user_email'   => $row['owner_email'],
            'role'         => 'restaurant-owner',
            'order_id'     => intval($order['id'] ?? 0),
            'order_number' => $order['order_number'] ?? null,
            'type'         => $type,
            'title'        => $title,
            'message'      => $message,
        ]);
    } catch (Throwable $e) {
        error_log('[CancellationController] Owner notification error: ' . $e->getMessage());
    }
}

function notifyRider(Notification $notification, array $order, string $type, string $title, string $message): void
{
    $riderId    = intval($order['rider_id']    ?? 0);
    $riderEmail = trim($order['rider_email']   ?? '');
    if (!$riderId && !$riderEmail) return;

    try {
        $notification->create([
            'user_id'      => $riderId ?: null,
            'user_email'   => $riderEmail,
            'role'         => 'delivery-rider',
            'order_id'     => intval($order['id'] ?? 0),
            'order_number' => $order['order_number'] ?? null,
            'type'         => $type,
            'title'        => $title,
            'message'      => $message,
        ]);
    } catch (Throwable $e) {
        error_log('[CancellationController] Rider notification error: ' . $e->getMessage());
    }
}

function notifyAdmins(Notification $notification, mysqli $conn, array $order, string $type, string $title, string $message): void
{
    $stmt = $conn->prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 20");
    if (!$stmt) return;

    $stmt->execute();
    $result = $stmt->get_result();
    while ($admin = $result->fetch_assoc()) {
        if (empty($admin['email'])) continue;
        try {
            $notification->create([
                'user_id'      => $admin['id'],
                'user_email'   => $admin['email'],
                'role'         => 'admin',
                'order_id'     => intval($order['id'] ?? 0),
                'order_number' => $order['order_number'] ?? null,
                'type'         => $type,
                'title'        => $title,
                'message'      => $message,
            ]);
        } catch (Throwable $e) {
            error_log('[CancellationController] Admin notification error: ' . $e->getMessage());
        }
    }
    $stmt->close();
}

/* ─────────────────────────────────────────────────────────────────────────── */

$notification = new Notification($conn);
$action       = $_GET['action'] ?? '';

try {

    /* ══════════════════════════════════════════════════════════════════════
     * cancel_order
     * POST body: {
     *   order_id, cancelled_by (customer|restaurant-owner|delivery-rider|admin),
     *   canceller_id, canceller_email, reason
     * }
     * ═════════════════════════════════════════════════════════════════════ */
    if ($action === 'cancel_order') {

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResp(['success' => false, 'message' => 'POST required.'], 405);
        }

        $jwtPayload = checkAuth($conn); // soft: logs warning if no token, continues either way
        $input       = getInput();
        $orderId     = intval($input['order_id']        ?? 0);
        $cancelledBy = trim($input['cancelled_by']      ?? '');
        $cancellerId = $input['canceller_id']           ?? null;
        $cancellerEmail = trim($input['canceller_email'] ?? '');
        $reason      = trim($input['reason']            ?? '');

        $allowedRoles = ['customer', 'restaurant-owner', 'delivery-rider', 'admin'];
        if ($orderId <= 0 || !in_array($cancelledBy, $allowedRoles, true)) {
            jsonResp(['success' => false, 'message' => 'order_id and valid cancelled_by are required.'], 400);
        }

        if ($cancelledBy === 'delivery-rider' && $reason === '') {
            jsonResp(['success' => false, 'message' => 'Riders must provide a cancellation reason.'], 400);
        }

        // Fetch the order
        $stmt = $conn->prepare("
            SELECT id, order_number, status, payment_method, payment_status,
                   payment_gateway, total, user_id, customer_email,
                   customer_name, restaurant_id, rider_id, rider_email
            FROM orders
            WHERE id = ? LIMIT 1
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error: ' . $conn->error], 500);
        }
        $stmt->bind_param('i', $orderId);
        $stmt->execute();
        $order = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$order) {
            jsonResp(['success' => false, 'message' => 'Order not found.'], 404);
        }

        $currentStatus = strtolower($order['status'] ?? '');

        // Already cancelled or delivered?
        if ($currentStatus === 'cancelled') {
            jsonResp(['success' => false, 'message' => 'Order is already cancelled.'], 409);
        }
        if ($currentStatus === 'delivered') {
            jsonResp(['success' => false, 'message' => 'Cannot cancel a delivered order.'], 409);
        }

        /* ── Role-based permission check ─────────────────────────────── */
        $allowed = false;
        switch ($cancelledBy) {
            case 'customer':
                $allowed = ($currentStatus === 'pending');
                if (!$allowed) {
                    jsonResp([
                        'success' => false,
                        'message' => 'You can only cancel before the restaurant confirms your order.'
                    ], 403);
                }
                break;

            case 'restaurant-owner':
                $allowed = in_array($currentStatus, ['pending', 'confirmed', 'preparing'], true);
                if (!$allowed) {
                    jsonResp([
                        'success' => false,
                        'message' => 'Restaurant can only cancel orders that are pending, confirmed, or in preparation.'
                    ], 403);
                }
                break;

            case 'delivery-rider':
                $allowed = in_array($currentStatus, ['ready_for_pickup', 'picked_up'], true);
                if (!$allowed) {
                    jsonResp([
                        'success' => false,
                        'message' => 'Riders can only cancel orders that are ready for pickup or just picked up.'
                    ], 403);
                }
                break;

            case 'admin':
                $allowed = true;
                break;
        }

        /* ── Refund eligibility ───────────────────────────────────────── */
        $refundInfo = resolveRefundEligibility($order);

        /* ── Cancel the order (atomic) ───────────────────────────────── */
        $cancelledAt   = date('Y-m-d H:i:s');
        $refundStatus  = $refundInfo['eligible'] ? 'pending' : 'not_applicable';
        $refundAmount  = $refundInfo['amount'];
        $refundEligible = $refundInfo['eligible'] ? 1 : 0;

        $updateStmt = $conn->prepare("
            UPDATE orders
            SET
                status         = 'cancelled',
                cancel_reason  = ?,
                cancelled_at   = ?,
                cancelled_by   = ?,
                refund_eligible = ?,
                refund_amount  = ?,
                refund_status  = ?
            WHERE id = ? AND status != 'cancelled' AND status != 'delivered'
        ");
        if (!$updateStmt) {
            jsonResp(['success' => false, 'message' => 'DB update prepare error: ' . $conn->error], 500);
        }
        $updateStmt->bind_param(
            'sssidsi',
            $reason, $cancelledAt, $cancelledBy,
            $refundEligible, $refundAmount, $refundStatus,
            $orderId
        );
        $updateStmt->execute();
        $affected = $updateStmt->affected_rows;
        $updateStmt->close();

        if ($affected === 0) {
            jsonResp(['success' => false, 'message' => 'Could not cancel order. It may have already changed state.'], 409);
        }

        /* ── Write cancellation log ──────────────────────────────────── */
        $logStmt = $conn->prepare("
            INSERT INTO order_cancellations
              (order_id, order_number, cancelled_by, canceller_id, canceller_email,
               reason, order_status_at_cancel, payment_method, payment_status_at_cancel,
               refund_eligible, refund_amount, refund_status, cancelled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        if ($logStmt) {
            $orderNumber  = $order['order_number'];
            $payMethod    = $order['payment_method'];
            $payStatus    = $order['payment_status'];
            // canceller_id must be int or null — cast safely
            $cancellerIdInt = ($cancellerId !== null && $cancellerId !== '') ? intval($cancellerId) : null;
            $logStmt->bind_param(
                'ississsssidss',
                $orderId, $orderNumber, $cancelledBy,
                $cancellerIdInt, $cancellerEmail,
                $reason, $currentStatus, $payMethod, $payStatus,
                $refundEligible, $refundAmount, $refundStatus,
                $cancelledAt
            );
            $logStmt->execute();
            $logStmt->close();
        }

        /* ── Create refund log if eligible ───────────────────────────── */
        if ($refundInfo['eligible']) {
            $refundLogStmt = $conn->prepare("
                INSERT INTO refund_logs
                  (order_id, order_number, amount, payment_gateway, refund_type, status, reason)
                VALUES (?, ?, ?, ?, ?, 'pending', ?)
            ");
            if ($refundLogStmt) {
                $orderNumber    = $order['order_number'];
                $gateway        = $order['payment_gateway'] ?? null;
                $refundType     = $refundInfo['type'];
                $refundReason   = $refundInfo['reason'];
                $refundLogStmt->bind_param(
                    'isdsss',
                    $orderId, $orderNumber, $refundAmount,
                    $gateway, $refundType, $refundReason
                );
                $refundLogStmt->execute();
                $refundLogStmt->close();
            }
        }

        /* ── Notifications ───────────────────────────────────────────── */
        $orderNum = $order['order_number'];
        $orderName = $order['customer_name'] ?? 'Customer';

        if ($cancelledBy !== 'customer') {
            $whoLabel = match ($cancelledBy) {
                'restaurant-owner' => 'The restaurant',
                'delivery-rider'   => 'Your rider',
                'admin'            => 'FoodExpress',
                default            => 'The system',
            };
            $customerMsg = "{$whoLabel} cancelled order {$orderNum}."
                         . ($reason ? " Reason: {$reason}." : '')
                         . ($refundInfo['eligible'] ? " A refund of Rs. {$refundAmount} is being processed." : '');

            notifyUser($notification, $order, 'order_cancelled', 'Order cancelled', $customerMsg);
        } else {
            // Notify customer that their own cancellation was successful
            $selfCancelMsg = "Your order {$orderNum} has been cancelled."
                           . ($refundInfo['eligible'] ? " Refund of Rs. {$refundAmount} will be processed." : '');
            notifyUser($notification, $order, 'order_cancelled', 'Order cancelled', $selfCancelMsg);

            // Notify owner
            notifyOwner($notification, $conn, $order, 'order_cancelled_by_customer', 'Order cancelled',
                "Customer cancelled order {$orderNum}."
                . ($reason ? " Reason: {$reason}." : '')
            );
        }

        // Notify rider if one is assigned and they didn't cancel themselves
        if ($cancelledBy !== 'delivery-rider'
            && (!empty($order['rider_id']) || !empty($order['rider_email']))) {
            $riderCancellerLabel = match ($cancelledBy) {
                'customer'         => 'The customer',
                'restaurant-owner' => 'The restaurant',
                'admin'            => 'FoodExpress',
                default            => 'The system',
            };
            notifyRider($notification, $order, 'order_cancelled', 'Order cancelled',
                "{$riderCancellerLabel} cancelled order {$orderNum}."
                . ($reason ? " Reason: {$reason}." : '')
            );
        }

        // Notify all admins
        $adminCancellerLabel = match ($cancelledBy) {
            'customer'         => 'Customer',
            'restaurant-owner' => 'Restaurant owner',
            'delivery-rider'   => 'Delivery rider',
            'admin'            => 'Admin',
            default            => 'System',
        };
        notifyAdmins($notification, $conn, $order, 'order_cancelled', 'Order cancelled',
            "{$adminCancellerLabel} cancelled order {$orderNum}."
            . ($reason ? " Reason: {$reason}." : '')
        );

        jsonResp([
            'success'          => true,
            'message'          => 'Order cancelled successfully.',
            'order_number'     => $order['order_number'],
            'refund_eligible'  => $refundInfo['eligible'],
            'refund_amount'    => $refundAmount,
            'refund_type'      => $refundInfo['type'],
            'refund_reason'    => $refundInfo['reason'],
            'refund_status'    => $refundStatus,
        ]);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * refund_update  (Admin only)
     * POST body: { refund_log_id, status (approved|rejected|processed),
     *              processed_by, notes }
     * ═════════════════════════════════════════════════════════════════════ */
    if ($action === 'refund_update') {

        $input       = getInput();
        $refundId    = intval($input['refund_log_id'] ?? 0);
        $newStatus   = trim($input['status']          ?? '');
        $processedBy = $input['processed_by']         ?? null;
        $notes       = trim($input['notes']           ?? '');

        $allowed = ['approved', 'rejected', 'processed'];
        if ($refundId <= 0 || !in_array($newStatus, $allowed, true)) {
            jsonResp(['success' => false, 'message' => 'refund_log_id and valid status are required.'], 400);
        }

        $processedAt = date('Y-m-d H:i:s');
        $stmt = $conn->prepare("
            UPDATE refund_logs
            SET status = ?, processed_by = ?, processed_at = ?, notes = ?
            WHERE id = ?
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error.'], 500);
        }
        $stmt->bind_param('sissi', $newStatus, $processedBy, $processedAt, $notes, $refundId);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        // Sync refund_status in orders table
        if ($affected > 0) {
    // Get refund log details
    $rowStmt = $conn->prepare("
        SELECT rl.order_id, rl.amount, rl.refund_type, o.customer_name, 
               o.customer_email, o.order_number, o.payment_gateway
        FROM refund_logs rl
        LEFT JOIN orders o ON rl.order_id = o.id
        WHERE rl.id = ?
    ");
    if ($rowStmt) {
        $rowStmt->bind_param('i', $refundId);
        $rowStmt->execute();
        $refundRow = $rowStmt->get_result()->fetch_assoc();
        $rowStmt->close();

        if ($refundRow) {
            // Sync refund_status in orders
            $syncStmt = $conn->prepare("UPDATE orders SET refund_status = ? WHERE id = ?");
            if ($syncStmt) {
                $syncStmt->bind_param('si', $newStatus, $refundRow['order_id']);
                $syncStmt->execute();
                $syncStmt->close();
            }

            // Send email notification to customer
            sendRefundNotificationEmail(
                $refundRow['customer_email'],
                $refundRow['customer_name'],
                $refundRow['order_number'],
                $refundRow['amount'],
                $refundRow['refund_type'],
                $newStatus,
                $notes
            );
        }
    }
}

        jsonResp([
            'success' => $affected > 0,
            'message' => $affected > 0 ? "Refund status updated to {$newStatus}." : 'Refund record not found.',
        ]);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * cancellation_log  (Admin — GET)
     * ═════════════════════════════════════════════════════════════════════ */
    if ($action === 'cancellation_log') {

        $limit  = min(intval($_GET['limit']  ?? 50), 200);
        $offset = intval($_GET['offset']     ?? 0);

        $result = $conn->query("
            SELECT
                oc.*,
                o.customer_name,
                o.customer_email,
                o.total,
                o.payment_gateway,
                rl.status AS refund_log_status,
                rl.id     AS refund_log_id
            FROM order_cancellations oc
            LEFT JOIN orders o ON oc.order_id = o.id
            LEFT JOIN refund_logs rl ON rl.order_id = oc.order_id
            ORDER BY oc.cancelled_at DESC
            LIMIT {$limit} OFFSET {$offset}
        ");

        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }

        jsonResp(['success' => true, 'data' => $rows, 'count' => count($rows)]);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * refund_log  (Admin — GET)
     * ═════════════════════════════════════════════════════════════════════ */
    if ($action === 'refund_log') {

        $status = trim($_GET['status'] ?? '');
        $limit  = min(intval($_GET['limit']  ?? 50), 200);

        $where = $status ? "WHERE status = '" . $conn->real_escape_string($status) . "'" : '';

        $result = $conn->query("
            SELECT rl.*, o.customer_name, o.customer_email, o.payment_method
            FROM refund_logs rl
            LEFT JOIN orders o ON rl.order_id = o.id
            {$where}
            ORDER BY rl.created_at DESC
            LIMIT {$limit}
        ");

        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }

        jsonResp(['success' => true, 'data' => $rows, 'count' => count($rows)]);
    }

    jsonResp(['success' => false, 'message' => 'Invalid action.'], 404);

} catch (Throwable $e) {
    $file = basename($e->getFile());
    $line = $e->getLine();
    error_log("[CancellationController] FATAL {$file}:{$line} — " . $e->getMessage());
    jsonResp(['success' => false, 'message' => 'Server error. Check server logs.'], 500);


    function sendRefundNotificationEmail($toEmail, $customerName, $orderNumber, $amount, $refundType, $status, $notes = "") {
    if (!$toEmail || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) return;

    require_once __DIR__ . '/../helpers/MailHelper.php';

    $name       = $customerName ?: "Customer";
    $amountFmt  = "Rs. " . number_format((float)$amount, 2);
    $typeLabel  = $refundType === "partial" ? "Partial" : "Full";

    switch ($status) {
        case 'approved':
            $subject = "Your Refund Has Been Approved — FoodExpress";
            $color   = "#16a34a";
            $icon    = "✅";
            $heading = "Refund Approved";
            $body    = "
                <p>Great news! Your {$typeLabel} refund of <strong>{$amountFmt}</strong> 
                for order <strong>#{$orderNumber}</strong> has been approved.</p>
                <p>The refund will be processed to your original payment method within 
                <strong>5–7 business days</strong>.</p>
            ";
            break;

        case 'rejected':
            $subject = "Refund Request Update — FoodExpress";
            $color   = "#dc2626";
            $icon    = "❌";
            $heading = "Refund Not Approved";
            $body    = "
                <p>Unfortunately, your refund request of <strong>{$amountFmt}</strong> 
                for order <strong>#{$orderNumber}</strong> could not be approved.</p>
                " . ($notes ? "<p><strong>Reason:</strong> {$notes}</p>" : "") . "
                <p>If you believe this is an error, please contact our support team.</p>
            ";
            break;

        case 'processed':
            $subject = "Your Refund Has Been Processed — FoodExpress";
            $color   = "#2563eb";
            $icon    = "💸";
            $heading = "Refund Processed";
            $body    = "
                <p>Your {$typeLabel} refund of <strong>{$amountFmt}</strong> 
                for order <strong>#{$orderNumber}</strong> has been successfully processed.</p>
                <p>The amount should reflect in your account within <strong>2–3 business days</strong> 
                depending on your bank or payment provider.</p>
            ";
            break;

        default:
            return;
    }

    $html = "
        <div style='font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px'>
            <div style='background:{$color};padding:24px;border-radius:12px 12px 0 0;text-align:center'>
                <div style='font-size:2.5rem'>{$icon}</div>
                <h1 style='color:white;margin:10px 0 0;font-size:1.4rem'>{$heading}</h1>
            </div>
            <div style='background:#fff;border:1px solid #e5e7eb;border-top:none;
                        border-radius:0 0 12px 12px;padding:28px'>
                <p style='font-size:1rem;color:#111827'>Hi {$name},</p>
                {$body}
                <div style='background:#f4f5f7;border-radius:10px;padding:16px;margin:20px 0'>
                    <table style='width:100%;font-size:0.875rem;color:#374151'>
                        <tr>
                            <td style='padding:4px 0;color:#6b7280'>Order Number</td>
                            <td style='padding:4px 0;text-align:right;font-weight:600'>#{$orderNumber}</td>
                        </tr>
                        <tr>
                            <td style='padding:4px 0;color:#6b7280'>Refund Amount</td>
                            <td style='padding:4px 0;text-align:right;font-weight:600'>{$amountFmt}</td>
                        </tr>
                        <tr>
                            <td style='padding:4px 0;color:#6b7280'>Refund Type</td>
                            <td style='padding:4px 0;text-align:right;font-weight:600'>{$typeLabel}</td>
                        </tr>
                        <tr>
                            <td style='padding:4px 0;color:#6b7280'>Status</td>
                            <td style='padding:4px 0;text-align:right;font-weight:700;color:{$color}'>
                                " . ucfirst($status) . "
                            </td>
                        </tr>
                    </table>
                </div>
                <p style='font-size:0.875rem;color:#6b7280'>
                    If you have any questions, reply to this email or contact 
                    FoodExpress support.
                </p>
                <p style='font-size:0.875rem;color:#111827;margin-top:20px'>
                    Thank you,<br><strong>FoodExpress Team</strong>
                </p>
            </div>
        </div>
    ";

    try {
        MailHelper::sendMail($toEmail, $name, $subject, $html);
    } catch (Throwable $e) {
        error_log("[CancellationController] Refund email failed: " . $e->getMessage());
    }
}
}
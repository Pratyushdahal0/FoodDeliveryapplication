<?php
/**
 * FoodExpress — eSewa Payment Controller (Sandbox v2)
 *
 * Fixes applied vs original:
 *  1. cURL replaces file_get_contents for verify (works even when allow_url_fopen=0)
 *  2. amount/tax/delivery breakdown sent correctly so eSewa equation holds
 *  3. Replay-attack guard: order already paid → return success immediately
 *  4. Idempotent verify: checks DB first before hitting eSewa API
 *  5. Missing order columns fetched (subtotal, tax, delivery_fee)
 *  6. All DB errors logged with full details
 *  7. Terminal vs retryable failure statuses handled correctly
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('Asia/Kathmandu');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';

/* ─── eSewa Credentials ──────────────────────────────────────────────────
 *
 * To move these out of source control, set environment variables in your
 * server config (Apache SetEnv, .env loader, or php.ini) and remove the
 * hardcoded fallback strings before going to production:
 *
 *   SetEnv ESEWA_PRODUCT_CODE   "your-live-merchant-code"
 *   SetEnv ESEWA_SECRET_KEY     "your-live-secret-key"
 *
 * The getenv() call reads the env variable; the ?: fallback keeps local
 * XAMPP development working without requiring any env setup.
 * DELETE the fallback strings before deploying to a public server.
 */
define('ESEWA_PRODUCT_CODE',     getenv('ESEWA_PRODUCT_CODE')  ?: 'EPAYTEST');
define('ESEWA_SECRET_KEY',       getenv('ESEWA_SECRET_KEY')    ?: '8gBm/:&EnhH.1/q');
define('ESEWA_SANDBOX_FORM_URL', 'https://rc-epay.esewa.com.np/api/epay/main/v2/form');
define('ESEWA_STATUS_URL',       'https://rc.esewa.com.np/api/epay/transaction/status/');

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function jsonResponse(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function getJsonInput(): array
{
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function makeEsewaSignature(string $totalAmount, string $transactionUuid, string $productCode): string
{
    $message = "total_amount={$totalAmount},transaction_uuid={$transactionUuid},product_code={$productCode}";
    return base64_encode(hash_hmac('sha256', $message, ESEWA_SECRET_KEY, true));
}

function getBaseFrontendUrl(): string
{
    $scheme    = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
    $parts     = explode('/backend/', $scriptDir);
    $appBase   = rtrim($parts[0] ?? '', '/');
    return "{$scheme}://{$host}{$appBase}/frontend/pages";
}

function esewaStatusCheck(string $transactionUuid, string $totalAmount): ?array
{
    $url = ESEWA_STATUS_URL
         . '?product_code='     . urlencode(ESEWA_PRODUCT_CODE)
         . '&total_amount='     . urlencode($totalAmount)
         . '&transaction_uuid=' . urlencode($transactionUuid);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_USERAGENT      => 'FoodExpress/1.0',
        ]);
        $raw     = curl_exec($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            error_log("[EsewaController][verify] cURL error: {$curlErr}");
        }
        if ($raw !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) return $decoded;
            error_log("[EsewaController][verify] Non-JSON from eSewa: " . substr($raw, 0, 200));
        }
        return null;
    }

    // Fallback to file_get_contents
    $ctx = stream_context_create([
        'http' => ['timeout' => 15, 'header' => "Accept: application/json\r\n"],
        'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        error_log('[EsewaController][verify] Both cURL and file_get_contents failed. Check PHP config.');
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

/* ─── Router ─────────────────────────────────────────────────────────────── */
$action = $_GET['action'] ?? '';

try {

    /* ══════════════════════════════════════════════════════════════════════
     * ACTION: initiate
     * ═════════════════════════════════════════════════════════════════════ */
    if ($action === 'initiate') {

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => 'POST method required.'], 405);
        }

        $data    = getJsonInput();
        $orderId = intval($data['order_id'] ?? 0);

        if ($orderId <= 0) {
            jsonResponse(['success' => false, 'message' => 'Valid order_id is required.'], 400);
        }

        $stmt = $conn->prepare("
            SELECT
                id, order_number, subtotal, tax, delivery_fee, total,
                payment_method, payment_status, payment_transaction_uuid
            FROM orders
            WHERE id = ?
            LIMIT 1
        ");

        if (!$stmt) {
            error_log('[EsewaController][initiate] Prepare failed: ' . $conn->error);
            jsonResponse(['success' => false, 'message' => 'Database prepare error.'], 500);
        }

        $stmt->bind_param('i', $orderId);
        $stmt->execute();
        $order = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$order) {
            jsonResponse(['success' => false, 'message' => 'Order not found.'], 404);
        }

        if ($order['payment_method'] !== 'digital') {
            jsonResponse(['success' => false, 'message' => 'Order payment method is not digital wallet.'], 400);
        }

        // Replay-attack guard
        if ($order['payment_status'] === 'paid') {
            jsonResponse([
                'success'          => true,
                'message'          => 'This order has already been paid.',
                'already_paid'     => true,
                'transaction_uuid' => $order['payment_transaction_uuid'],
            ]);
        }

        /* Build eSewa v2 amount breakdown
         * RULE: amount + tax_amount + product_service_charge + product_delivery_charge = total_amount
         */
        $storedTotal = round(floatval($order['total']),        2);
        $taxAmt      = round(floatval($order['tax']),          2);
        $deliveryFee = round(floatval($order['delivery_fee']), 2);
        $itemAmount  = round($storedTotal - $taxAmt - $deliveryFee, 2);

        if ($itemAmount < 0) {
            $itemAmount = 0.00;
        }

        // Verify equation; if rounding breaks it, flatten to total/0/0
        $equationCheck = round($itemAmount + $taxAmt + $deliveryFee, 2);
        if ($equationCheck !== $storedTotal) {
            $itemAmount  = $storedTotal;
            $taxAmt      = 0.00;
            $deliveryFee = 0.00;
        }

        $fTotal    = number_format($storedTotal,  2, '.', '');
        $fAmount   = number_format($itemAmount,   2, '.', '');
        $fTax      = number_format($taxAmt,       2, '.', '');
        $fDelivery = number_format($deliveryFee,  2, '.', '');

        $transactionUuid = 'FE-' . $order['id'] . '-' . time();
        $productCode     = ESEWA_PRODUCT_CODE;
        $signature       = makeEsewaSignature($fTotal, $transactionUuid, $productCode);

        // Persist UUID and initiated status
        $update = $conn->prepare("
            UPDATE orders
            SET payment_status = 'initiated',
                payment_gateway = 'esewa',
                payment_transaction_uuid = ?
            WHERE id = ?
        ");

        if (!$update) {
            error_log('[EsewaController][initiate] Update prepare failed: ' . $conn->error);
            jsonResponse(['success' => false, 'message' => 'Database error saving payment state.'], 500);
        }

        $update->bind_param('si', $transactionUuid, $orderId);
        $update->execute();
        $update->close();

        $frontendBase = getBaseFrontendUrl();

        jsonResponse([
            'success'  => true,
            'message'  => 'eSewa payment initiated.',
            'form_url' => ESEWA_SANDBOX_FORM_URL,
            'fields'   => [
                'amount'                  => $fAmount,
                'tax_amount'              => $fTax,
                'total_amount'            => $fTotal,
                'transaction_uuid'        => $transactionUuid,
                'product_code'            => $productCode,
                'product_service_charge'  => '0',
                'product_delivery_charge' => $fDelivery,
                'success_url'             => "{$frontendBase}/esewa-success.html",
                'failure_url'             => "{$frontendBase}/esewa-failure.html",
                'signed_field_names'      => 'total_amount,transaction_uuid,product_code',
                'signature'               => $signature,
            ],
        ]);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ACTION: verify
     * ═════════════════════════════════════════════════════════════════════ */
    if ($action === 'verify') {

        $transactionUuid = trim($_GET['transaction_uuid'] ?? '');
        $totalAmount     = trim($_GET['total_amount']     ?? '');

        if (!$transactionUuid || !$totalAmount) {
            jsonResponse(['success' => false, 'message' => 'transaction_uuid and total_amount are required.'], 400);
        }

        // Idempotency: check if already verified in DB
        $checkStmt = $conn->prepare("
            SELECT id, order_number, payment_status, payment_reference_id
            FROM orders
            WHERE payment_transaction_uuid = ?
            LIMIT 1
        ");

        if ($checkStmt) {
            $checkStmt->bind_param('s', $transactionUuid);
            $checkStmt->execute();
            $existingOrder = $checkStmt->get_result()->fetch_assoc();
            $checkStmt->close();

            if ($existingOrder && $existingOrder['payment_status'] === 'paid') {
                jsonResponse([
                    'success'          => true,
                    'message'          => 'Payment already verified.',
                    'already_verified' => true,
                    'order_number'     => $existingOrder['order_number'],
                    'ref_id'           => $existingOrder['payment_reference_id'],
                ]);
            }
        }

        // Hit eSewa status API
        $statusData = esewaStatusCheck($transactionUuid, $totalAmount);

        if ($statusData === null) {
            error_log("[EsewaController][verify] Could not reach eSewa for UUID: {$transactionUuid}");
            jsonResponse([
                'success'   => false,
                'message'   => 'Could not reach eSewa to verify. Please wait and try again.',
                'retryable' => true,
            ], 502);
        }

        $status = strtoupper($statusData['status'] ?? '');
        $refId  = $statusData['ref_id'] ?? ($statusData['refId'] ?? null);

        if ($status === 'COMPLETE') {
            $paidAt = date('Y-m-d H:i:s');

            $updateStmt = $conn->prepare("
                UPDATE orders
                SET
                    payment_status       = 'paid',
                    payment_gateway      = 'esewa',
                    payment_reference_id = ?,
                    paid_at              = ?
                WHERE payment_transaction_uuid = ?
                  AND payment_status != 'paid'
            ");

            if (!$updateStmt) {
                error_log('[EsewaController][verify] Update prepare failed: ' . $conn->error);
                jsonResponse(['success' => false, 'message' => 'Database error recording payment.'], 500);
            }

            $updateStmt->bind_param('sss', $refId, $paidAt, $transactionUuid);
            $updateStmt->execute();
            $updateStmt->close();

            // Fetch order_number for redirect
            $numStmt = $conn->prepare("
                SELECT order_number FROM orders WHERE payment_transaction_uuid = ? LIMIT 1
            ");
            $orderNumber = null;
            if ($numStmt) {
                $numStmt->bind_param('s', $transactionUuid);
                $numStmt->execute();
                $row = $numStmt->get_result()->fetch_assoc();
                $orderNumber = $row['order_number'] ?? null;
                $numStmt->close();
            }

            // Send confirmation email now that payment is confirmed
            try {
                require_once __DIR__ . '/../helpers/MailHelper.php';
                $orderFull = $conn->query("
                    SELECT o.*, r.restaurant_name
                    FROM orders o
                    LEFT JOIN restaurants r ON o.restaurant_id = r.id
                    WHERE o.payment_transaction_uuid = '" . $conn->real_escape_string($transactionUuid) . "'
                    LIMIT 1
                ")->fetch_assoc();

                if ($orderFull && $orderFull['customer_email']) {
                    $itemsResult = $conn->query("SELECT * FROM order_items WHERE order_id = " . intval($orderFull['id']));
                    $items = [];
                    while ($item = $itemsResult->fetch_assoc()) { $items[] = $item; }

                    $subject = "FoodExpress order confirmed - " . $orderFull['order_number'];
                    $customerName = $orderFull['customer_name'] ?? 'Customer';
                    $restName = $orderFull['restaurant_name'] ?? 'Restaurant';
                    $total = number_format(floatval($orderFull['total']), 2);

                    $body = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto'>"
                          . "<div style='background:linear-gradient(135deg,#F2644C,#F58A5C);padding:30px;color:#fff'>"
                          . "<h2 style='margin:0'>FoodExpress</h2>"
                          . "<p style='margin:8px 0 0'>Payment confirmed via eSewa</p></div>"
                          . "<div style='padding:30px'>"
                          . "<h3>Hi {$customerName}, your payment is confirmed!</h3>"
                          . "<p>Order <strong>{$orderFull['order_number']}</strong> from <strong>{$restName}</strong> is being prepared.</p>"
                          . "<p><strong>Total paid via eSewa:</strong> Rs. {$total}</p>"
                          . "<p><strong>eSewa Reference:</strong> {$refId}</p>"
                          . "</div></div>";

                    MailHelper::sendMail($orderFull['customer_email'], $customerName, $subject, $body);
                }
            } catch (Throwable $mailErr) {
                error_log('[EsewaController] Email after verify failed: ' . $mailErr->getMessage());
            }

            jsonResponse([
                'success'      => true,
                'message'      => 'eSewa payment verified successfully.',
                'status'       => $status,
                'ref_id'       => $refId,
                'order_number' => $orderNumber,
            ]);
        }

        // Terminal failures: update DB
        $statusLower      = strtolower($status ?: 'failed');
        $terminalStatuses = ['failed', 'cancelled', 'expired'];

        if (in_array($statusLower, $terminalStatuses, true)) {
            $failStmt = $conn->prepare("
                UPDATE orders
                SET payment_status = ?
                WHERE payment_transaction_uuid = ?
                  AND payment_status != 'paid'
            ");
            if ($failStmt) {
                $failStmt->bind_param('ss', $statusLower, $transactionUuid);
                $failStmt->execute();
                $failStmt->close();
            }
        }

        jsonResponse([
            'success' => false,
            'message' => 'Payment not completed. Status: ' . ($status ?: 'UNKNOWN'),
            'status'  => $status ?: 'UNKNOWN',
            'ref_id'  => $refId,
        ]);
    }

    jsonResponse(['success' => false, 'message' => 'Invalid action. Allowed: initiate, verify'], 404);

} catch (Throwable $e) {
    $file = basename($e->getFile());
    $line = $e->getLine();
    $msg  = $e->getMessage();
    error_log("[EsewaController] FATAL {$file}:{$line} — {$msg}");
    jsonResponse(['success' => false, 'message' => 'Server error processing eSewa payment. Check server logs.'], 500);
}
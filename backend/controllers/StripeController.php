<?php
/**
 * FoodExpress — Stripe Card Payment Controller
 * 
 * Actions:
 *  create_intent  — creates a PaymentIntent for an order
 *  verify         — confirms payment status after frontend confirms
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

define('STRIPE_SECRET_KEY', getenv('STRIPE_SECRET_KEY') ?: 'key');
define('STRIPE_PUBLISHABLE_KEY', getenv('STRIPE_PUBLISHABLE_KEY') ?: 'key');

function jsonResp(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function stripeRequest(string $endpoint, array $data = [], string $method = 'POST'): array {
    $ch = curl_init('https://api.stripe.com/v1/' . $endpoint);
    
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_USERPWD        => STRIPE_SECRET_KEY . ':',
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    }

    $raw  = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($err) {
        throw new Exception('Stripe cURL error: ' . $err);
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new Exception('Invalid Stripe response: ' . substr($raw, 0, 200));
    }

    return $decoded;
}

$action = $_GET['action'] ?? '';

try {

    /* ══════════════════════════════════════════════════════
     * create_intent
     * POST body: { order_id: 49 }
     * Returns: { client_secret, publishable_key }
     * ═════════════════════════════════════════════════════ */
    if ($action === 'create_intent') {

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResp(['success' => false, 'message' => 'POST required.'], 405);
        }

        $input   = json_decode(file_get_contents('php://input'), true) ?? [];
        $orderId = intval($input['order_id'] ?? 0);

        if ($orderId <= 0) {
            jsonResp(['success' => false, 'message' => 'Valid order_id required.'], 400);
        }

        // Fetch order
        $stmt = $conn->prepare("
            SELECT id, order_number, total, payment_method, payment_status
            FROM orders WHERE id = ? LIMIT 1
        ");
        $stmt->bind_param('i', $orderId);
        $stmt->execute();
        $order = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$order) {
            jsonResp(['success' => false, 'message' => 'Order not found.'], 404);
        }

        if ($order['payment_status'] === 'paid') {
            jsonResp(['success' => true, 'already_paid' => true, 'message' => 'Order already paid.']);
        }

        // Amount in paisa (NPR * 100)
        $amountPaisa = intval(round(floatval($order['total']) * 100));

        // Create Stripe PaymentIntent
        $intent = stripeRequest('payment_intents', [
            'amount'   => $amountPaisa,
            'currency' => 'npr',
            'metadata' => [
                'order_id'     => $orderId,
                'order_number' => $order['order_number'],
            ],
            'automatic_payment_methods' => ['enabled' => 'true'],
        ]);

        if (isset($intent['error'])) {
            error_log('[StripeController] Intent error: ' . json_encode($intent['error']));
            jsonResp(['success' => false, 'message' => $intent['error']['message'] ?? 'Stripe error.'], 500);
        }

        // Save intent ID to order
        $update = $conn->prepare("
            UPDATE orders
            SET payment_status = 'initiated',
                payment_gateway = 'stripe',
                payment_transaction_uuid = ?
            WHERE id = ?
        ");
        $intentId = $intent['id'];
        $update->bind_param('si', $intentId, $orderId);
        $update->execute();
        $update->close();

        jsonResp([
            'success'         => true,
            'client_secret'   => $intent['client_secret'],
            'publishable_key' => STRIPE_PUBLISHABLE_KEY,
            'amount'          => $amountPaisa,
            'order_number'    => $order['order_number'],
        ]);
    }

    /* ══════════════════════════════════════════════════════
     * verify
     * POST body: { payment_intent_id, order_id }
     * Called after frontend confirms payment
     * ═════════════════════════════════════════════════════ */
    if ($action === 'verify') {

        $input          = json_decode(file_get_contents('php://input'), true) ?? [];
        $paymentIntentId = trim($input['payment_intent_id'] ?? '');
        $orderId         = intval($input['order_id'] ?? 0);

        if (!$paymentIntentId || !$orderId) {
            jsonResp(['success' => false, 'message' => 'payment_intent_id and order_id required.'], 400);
        }

        // Check DB idempotency
        $checkStmt = $conn->prepare("SELECT payment_status FROM orders WHERE id = ? LIMIT 1");
        $checkStmt->bind_param('i', $orderId);
        $checkStmt->execute();
        $existingOrder = $checkStmt->get_result()->fetch_assoc();
        $checkStmt->close();

        if ($existingOrder && $existingOrder['payment_status'] === 'paid') {
            jsonResp(['success' => true, 'already_paid' => true, 'message' => 'Already paid.']);
        }

        // Verify with Stripe
        $intent = stripeRequest("payment_intents/{$paymentIntentId}", [], 'GET');

        if (isset($intent['error'])) {
            jsonResp(['success' => false, 'message' => $intent['error']['message'] ?? 'Stripe verify error.'], 500);
        }

        $status = $intent['status'] ?? '';

        if ($status === 'succeeded') {
            $paidAt = date('Y-m-d H:i:s');
            $refId  = $paymentIntentId;

            $updateStmt = $conn->prepare("
                UPDATE orders
                SET payment_status = 'paid',
                    payment_gateway = 'stripe',
                    payment_reference_id = ?,
                    paid_at = ?
                WHERE id = ? AND payment_status != 'paid'
            ");
            $updateStmt->bind_param('ssi', $refId, $paidAt, $orderId);
            $updateStmt->execute();
            $updateStmt->close();

            // Send confirmation email now that card payment is confirmed
            try {
                require_once __DIR__ . '/../helpers/MailHelper.php';

                $orderFull = $conn->prepare("
                    SELECT o.*, r.restaurant_name
                    FROM orders o
                    LEFT JOIN restaurants r ON o.restaurant_id = r.id
                    WHERE o.id = ?
                    LIMIT 1
                ");
                $orderFull->bind_param('i', $orderId);
                $orderFull->execute();
                $orderFullData = $orderFull->get_result()->fetch_assoc();
                $orderFull->close();

                if ($orderFullData && $orderFullData['customer_email']) {
                    $itemsStmt = $conn->prepare("SELECT * FROM order_items WHERE order_id = ?");
                    $itemsStmt->bind_param('i', $orderId);
                    $itemsStmt->execute();
                    $itemsResult = $itemsStmt->get_result();
                    $items = [];
                    while ($item = $itemsResult->fetch_assoc()) { $items[] = $item; }
                    $itemsStmt->close();

                    $customerName = $orderFullData['customer_name'] ?? 'Customer';
                    $restName     = $orderFullData['restaurant_name'] ?? 'Restaurant';
                    $total        = number_format(floatval($orderFullData['total']), 2);
                    $subject      = "FoodExpress order confirmed - " . $orderFullData['order_number'];

                    $body = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto'>"
                          . "<div style='background:linear-gradient(135deg,#F2644C,#F58A5C);padding:30px;color:#fff'>"
                          . "<h2 style='margin:0'>FoodExpress</h2>"
                          . "<p style='margin:8px 0 0'>Payment confirmed via Card</p></div>"
                          . "<div style='padding:30px'>"
                          . "<h3>Hi {$customerName}, your payment is confirmed!</h3>"
                          . "<p>Order <strong>{$orderFullData['order_number']}</strong> from <strong>{$restName}</strong> is being prepared.</p>"
                          . "<p><strong>Total paid via Card:</strong> Rs. {$total}</p>"
                          . "<p><strong>Payment reference:</strong> {$refId}</p>"
                          . "</div></div>";

                    MailHelper::sendMail($orderFullData['customer_email'], $customerName, $subject, $body);
                }
            } catch (Throwable $mailErr) {
                error_log('[StripeController] Email after verify failed: ' . $mailErr->getMessage());
            }

            jsonResp([
                'success'    => true,
                'message'    => 'Stripe payment verified.',
                'status'     => $status,
                'payment_id' => $paymentIntentId,
            ]);
        }

        jsonResp([
            'success' => false,
            'message' => 'Payment not completed. Status: ' . $status,
            'status'  => $status,
        ]);
    }

    jsonResp(['success' => false, 'message' => 'Invalid action.'], 404);

} catch (Throwable $e) {
    error_log('[StripeController] ' . $e->getMessage());
    jsonResp(['success' => false, 'message' => 'Server error processing card payment.'], 500);
}
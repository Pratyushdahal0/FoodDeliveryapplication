<?php
/**
 * FoodExpress — Chat Controller
 *
 * Actions:
 *  send_message  POST {order_id, sender_role, sender_id, sender_email, sender_name, message}
 *  get_messages  GET  {order_id}
 *  mark_read     POST {order_id, reader_role}
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
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

function jsonResp(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

$action = $_GET['action'] ?? '';

try {

    /* ══════════════════════════════════════════════════════
     * send_message
     * POST {order_id, sender_role, sender_id?, sender_email?, sender_name, message}
     * ════════════════════════════════════════════════════ */
    if ($action === 'send_message') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResp(['success' => false, 'message' => 'POST required.'], 405);
        }

        $jwtPayload = checkAuth($conn); // soft: logs warning if no token, continues either way
        $input       = json_decode(file_get_contents('php://input'), true) ?? [];
        $orderId     = intval($input['order_id']    ?? 0);
        $senderRole  = trim($input['sender_role']   ?? '');
        $senderId    = intval($input['sender_id']   ?? 0);
        $senderEmail = trim($input['sender_email']  ?? '');
        $senderName  = trim($input['sender_name']   ?? '');
        $message     = trim($input['message']       ?? '');

        $validRoles = ['customer', 'rider', 'owner', 'system'];
        if ($orderId <= 0 || !in_array($senderRole, $validRoles, true) || $message === '') {
            jsonResp([
                'success' => false,
                'message' => 'order_id, valid sender_role, and message are required.',
            ], 400);
        }

        $stmt = $conn->prepare("
            INSERT INTO chat_messages
              (order_id, sender_role, sender_id, sender_email, sender_name, message)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error: ' . $conn->error], 500);
        }

        $stmt->bind_param('isisss', $orderId, $senderRole, $senderId, $senderEmail, $senderName, $message);
        $stmt->execute();
        $insertId = $conn->insert_id;
        $stmt->close();

        jsonResp(['success' => true, 'id' => $insertId]);
    }

    /* ══════════════════════════════════════════════════════
     * get_messages
     * GET {order_id}
     * ════════════════════════════════════════════════════ */
    if ($action === 'get_messages') {
        $jwtPayload = checkAuth($conn); // soft: logs warning if no token, continues either way
        $orderId = intval($_GET['order_id'] ?? 0);
        if ($orderId <= 0) {
            jsonResp(['success' => false, 'message' => 'order_id required.'], 400);
        }

        $stmt = $conn->prepare("
            SELECT id, order_id, sender_role, sender_id, sender_email,
                   sender_name, message, is_read, created_at
            FROM chat_messages
            WHERE order_id = ?
            ORDER BY created_at ASC
            LIMIT 200
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error: ' . $conn->error], 500);
        }

        $stmt->bind_param('i', $orderId);
        $stmt->execute();
        $result   = $stmt->get_result();
        $messages = [];
        while ($row = $result->fetch_assoc()) {
            $messages[] = $row;
        }
        $stmt->close();

        jsonResp(['success' => true, 'data' => $messages]);
    }

    /* ══════════════════════════════════════════════════════
     * mark_read
     * POST {order_id, reader_role}
     * Marks all messages NOT sent by reader_role as read.
     * ════════════════════════════════════════════════════ */
    if ($action === 'mark_read') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResp(['success' => false, 'message' => 'POST required.'], 405);
        }

        $input      = json_decode(file_get_contents('php://input'), true) ?? [];
        $orderId    = intval($input['order_id']   ?? 0);
        $readerRole = trim($input['reader_role']  ?? '');

        $validRoles = ['customer', 'rider', 'owner', 'system'];
        if ($orderId <= 0 || !in_array($readerRole, $validRoles, true)) {
            jsonResp(['success' => false, 'message' => 'order_id and valid reader_role required.'], 400);
        }

        $stmt = $conn->prepare("
            UPDATE chat_messages
            SET is_read = 1
            WHERE order_id = ? AND sender_role != ? AND is_read = 0
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error: ' . $conn->error], 500);
        }

        $stmt->bind_param('is', $orderId, $readerRole);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        jsonResp(['success' => true, 'marked' => $affected]);
    }

    jsonResp(['success' => false, 'message' => 'Invalid action.'], 404);

} catch (Throwable $e) {
    error_log('[ChatController] ' . $e->getMessage());
    jsonResp(['success' => false, 'message' => 'Server error.'], 500);
}

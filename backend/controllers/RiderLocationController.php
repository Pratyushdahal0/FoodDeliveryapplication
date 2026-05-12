<?php
/**
 * FoodExpress — Rider Location Controller
 *
 * Actions:
 *  update_location  POST {rider_id, latitude, longitude}
 *  get_location     GET  {order_id}
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('Asia/Kathmandu');

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';

function jsonResp(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

$action = $_GET['action'] ?? '';

try {

    /* ══════════════════════════════════════════════════════
     * update_location
     * POST {rider_id, latitude, longitude}
     * ════════════════════════════════════════════════════ */
    if ($action === 'update_location') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResp(['success' => false, 'message' => 'POST required.'], 405);
        }

        $input    = json_decode(file_get_contents('php://input'), true) ?? [];
        $riderId  = intval($input['rider_id']  ?? 0);
        $lat      = floatval($input['latitude']  ?? 0);
        $lng      = floatval($input['longitude'] ?? 0);

        if ($riderId <= 0 || ($lat === 0.0 && $lng === 0.0)) {
            jsonResp(['success' => false, 'message' => 'rider_id, latitude, and longitude are required.'], 400);
        }

        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            jsonResp(['success' => false, 'message' => 'Invalid coordinates.'], 400);
        }

        $stmt = $conn->prepare("
            UPDATE users
            SET current_lat = ?, current_lng = ?, location_updated_at = NOW()
            WHERE id = ?
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error: ' . $conn->error], 500);
        }

        $stmt->bind_param('ddi', $lat, $lng, $riderId);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        jsonResp(['success' => true, 'updated' => $affected]);
    }

    /* ══════════════════════════════════════════════════════
     * get_location
     * GET {order_id}
     * Returns the assigned rider's current lat/lng by looking
     * up rider_id from the orders table, then reading from users.
     * ════════════════════════════════════════════════════ */
    if ($action === 'get_location') {
        $orderId = intval($_GET['order_id'] ?? 0);
        if ($orderId <= 0) {
            jsonResp(['success' => false, 'message' => 'order_id required.'], 400);
        }

        $stmt = $conn->prepare("
            SELECT u.id AS rider_id,
                   u.name AS rider_name,
                   u.current_lat,
                   u.current_lng,
                   u.location_updated_at
            FROM orders o
            JOIN users u ON u.id = o.rider_id
            WHERE o.id = ?
            LIMIT 1
        ");
        if (!$stmt) {
            jsonResp(['success' => false, 'message' => 'DB prepare error: ' . $conn->error], 500);
        }

        $stmt->bind_param('i', $orderId);
        $stmt->execute();
        $result = $stmt->get_result();
        $row    = $result->fetch_assoc();
        $stmt->close();

        if (!$row) {
            jsonResp(['success' => false, 'message' => 'No rider assigned to this order.'], 404);
        }

        if ($row['current_lat'] === null || $row['current_lng'] === null) {
            jsonResp(['success' => true, 'has_location' => false, 'rider_name' => $row['rider_name']]);
        }

        jsonResp([
            'success'      => true,
            'has_location' => true,
            'rider_id'     => intval($row['rider_id']),
            'rider_name'   => $row['rider_name'],
            'latitude'     => floatval($row['current_lat']),
            'longitude'    => floatval($row['current_lng']),
            'updated_at'   => $row['location_updated_at'],
        ]);
    }

    jsonResp(['success' => false, 'message' => 'Invalid action.'], 404);

} catch (Throwable $e) {
    error_log('[RiderLocationController] ' . $e->getMessage());
    jsonResp(['success' => false, 'message' => 'Server error.'], 500);
}

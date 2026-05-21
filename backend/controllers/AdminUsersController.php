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
require_once __DIR__ . "/../models/User.php";
require_once __DIR__ . "/../helpers/MailHelper.php";

$payload   = requireRole('admin', $conn);
$userModel = new User($conn);
$action    = $_GET["action"] ?? "";

try {

    /* ── LIST USERS ── */
    if ($action === "list") {
        $filter = $_GET["filter"] ?? "all";

        $whereClause = "";
        if ($filter === "pending") {
            $whereClause = "WHERE approval_status = 'pending'";
        } elseif (in_array($filter, ['approved', 'rejected', 'suspended'], true)) {
            $whereClause = "WHERE approval_status = '" . $conn->real_escape_string($filter) . "'";
        }

        $sql = "
            SELECT
                id, name, email, phone, address, role, status, approval_status,
                approved_at, approved_by_admin_id, rejection_reason, admin_notes,
                created_at, approval_updated_at
            FROM users
            $whereClause
            ORDER BY created_at DESC
        ";

        $result = $conn->query($sql);
        $users  = [];

        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }

        echo json_encode(["success" => true, "data" => $users]);
        exit;
    }

    /* ── UPDATE APPROVAL STATUS ── */
    if ($action === "update_approval") {
        $input          = json_decode(file_get_contents("php://input"), true);
        $id             = (int)($input["id"] ?? 0);
        $approvalStatus = strtolower(trim($input["approval_status"] ?? ""));
        $reason         = trim($input["reason"] ?? "");
        $notes          = trim($input["notes"]  ?? "");

        if ($id <= 0 || !in_array($approvalStatus, ["pending", "approved", "rejected", "suspended"], true)) {
            echo json_encode(["success" => false, "message" => "Invalid user ID or approval status."]);
            exit;
        }

        $result = $userModel->updateApprovalStatus($id, $approvalStatus, $payload['user_id'], $reason, $notes);

        if (strpos($result, "successfully") === false) {
            echo json_encode(["success" => false, "message" => $result]);
            exit;
        }

        // Send notification email (non-blocking)
        $user = $userModel->getById($id);
        if ($user) {
            sendApprovalNotification($user, $approvalStatus, $reason);
        }

        echo json_encode(["success" => true, "message" => "User approval status updated successfully."]);
        exit;
    }

    /* ── UPDATE ACCOUNT STATUS (block/unblock) ── */
    if ($action === "update_status") {
        $input  = json_decode(file_get_contents("php://input"), true);
        $id     = (int)($input["id"]     ?? 0);
        $status = strtolower(trim($input["status"] ?? ""));

        if ($id <= 0 || !in_array($status, ["active", "blocked"], true)) {
            echo json_encode(["success" => false, "message" => "Invalid user or status."]);
            exit;
        }

        $stmt = $conn->prepare("UPDATE users SET status = ? WHERE id = ?");
        $stmt->bind_param("si", $status, $id);
        $stmt->execute();
        $stmt->close();

        $label = $status === "blocked" ? "blocked" : "unblocked";
        echo json_encode(["success" => true, "message" => "User {$label} successfully."]);
        exit;
    }

    /* ── USER ORDER HISTORY ── */
    if ($action === "orders") {
        $userId = (int)($_GET["user_id"] ?? 0);

        if ($userId <= 0) {
            echo json_encode(["success" => false, "message" => "User ID required."]);
            exit;
        }

        $stmt = $conn->prepare("
            SELECT
                o.id,
                o.order_number,
                o.customer_name,
                o.total,
                o.status,
                o.created_at,
                r.restaurant_name
            FROM orders o
            LEFT JOIN restaurants r ON o.restaurant_id = r.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
        ");

        $stmt->bind_param("i", $userId);
        $stmt->execute();

        $result = $stmt->get_result();
        $orders = [];

        while ($row = $result->fetch_assoc()) {
            $orders[] = $row;
        }

        $stmt->close();

        echo json_encode(["success" => true, "data" => $orders]);
        exit;
    }

    echo json_encode(["success" => false, "message" => "Invalid action."]);

} catch (Throwable $e) {
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

/* ── SEND APPROVAL EMAIL ── */
function sendApprovalNotification($user, $status, $reason = null) {
    $subject = "";
    $message = "";

    switch ($status) {
        case 'approved':
            $subject = "Welcome to FoodExpress — Your Account is Approved!";
            $message = "
                <h2>Congratulations, {$user['name']}!</h2>
                <p>Your account has been approved and you can now access your dashboard.</p>
                <p>Welcome to the FoodExpress family!</p>
            ";
            break;

        case 'rejected':
            $subject = "FoodExpress Account Application Update";
            $message = "
                <h2>Account Application Update</h2>
                <p>Dear {$user['name']},</p>
                <p>After reviewing your application, we regret to inform you that your account cannot be approved at this time.</p>
                " . ($reason ? "<p><strong>Reason:</strong> {$reason}</p>" : "") . "
                <p>You may reapply after addressing the issues mentioned.</p>
            ";
            break;

        case 'suspended':
            $subject = "FoodExpress Account Suspended";
            $message = "
                <h2>Account Suspended</h2>
                <p>Dear {$user['name']},</p>
                <p>Your account has been temporarily suspended.</p>
                " . ($reason ? "<p><strong>Reason:</strong> {$reason}</p>" : "") . "
                <p>Please contact support for assistance with reactivation.</p>
            ";
            break;

        default:
            return;
    }

    try {
        MailHelper::sendMail(
            $user['email'],
            $user['name'] ?? 'User',
            $subject,
            $message
        );
    } catch (Throwable $e) {
        error_log("Failed to send approval notification: " . $e->getMessage());
    }
}
?>
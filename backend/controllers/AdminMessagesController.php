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
require_once __DIR__ . "/../helpers/MailHelper.php";

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection not available."]);
    exit;
}

// ✅ Require admin auth for all actions
$payload = requireRole('admin', $conn);

$action = $_GET["action"] ?? "";

try {
    switch ($action) {
        case "list":
            handleListMessages($conn);
            break;
        case "update_status":
            handleUpdateStatus($conn);
            break;
        case "delete":
            handleDeleteMessage($conn);
            break;
        case "reply":
            handleReplyMessage($conn);
            break;
        case "replies":
            handleListReplies($conn);
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

/* ── LIST MESSAGES ── */
function handleListMessages($conn) {
    $sql = "
        SELECT
            id, first_name, last_name, email, phone,
            subject, message, status, email_error, created_at
        FROM contact_messages
        ORDER BY created_at DESC
    ";

    $result = $conn->query($sql);
    if (!$result) throw new Exception("Failed to fetch messages: " . $conn->error);

    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }

    echo json_encode(["success" => true, "data" => $messages]);
}

/* ── UPDATE STATUS ── */
function handleUpdateStatus($conn) {
    $input  = json_decode(file_get_contents("php://input"), true);
    $id     = (int)($input["id"]     ?? 0);
    $status = strtolower(trim($input["status"] ?? ""));

    $allowed = ["received", "in_progress", "resolved", "emailed", "email_failed"];

    if ($id <= 0 || !in_array($status, $allowed, true)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Invalid message or status."]);
        return;
    }

    $stmt = $conn->prepare("UPDATE contact_messages SET status = ? WHERE id = ?");
    $stmt->bind_param("si", $status, $id);
    $stmt->execute();
    $stmt->close();

    echo json_encode(["success" => true, "message" => "Message status updated."]);
}

/* ── DELETE MESSAGE ── */
function handleDeleteMessage($conn) {
    $input = json_decode(file_get_contents("php://input"), true);
    $id    = (int)($input["id"] ?? 0);

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Message ID is required."]);
        return;
    }

    // Delete replies first
    $stmt = $conn->prepare("DELETE FROM support_replies WHERE message_id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $stmt->close();

    // Delete message
    $stmt = $conn->prepare("DELETE FROM contact_messages WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $stmt->close();

    echo json_encode(["success" => true, "message" => "Ticket deleted successfully."]);
}

/* ── REPLY TO MESSAGE ── */
function handleReplyMessage($conn) {
    $input = json_decode(file_get_contents("php://input"), true);
    $id    = (int)($input["id"]    ?? 0);
    $reply = trim($input["reply"]  ?? "");

    if ($id <= 0 || $reply === "") {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Message ID and reply are required."]);
        return;
    }

    // Get original message
    $stmt = $conn->prepare("
        SELECT id, first_name, last_name, email, subject
        FROM contact_messages
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $message = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$message) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Message not found."]);
        return;
    }

    $toEmail      = $message["email"];
    $customerName = trim(($message["first_name"] ?? "") . " " . ($message["last_name"] ?? ""));
    if ($customerName === "") $customerName = "Customer";

    $subject = "Re: " . ($message["subject"] ?: "FoodExpress Support");

    // ✅ Use MailHelper instead of mail()
    $emailBody = "
        <div style='font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px'>
            <h2 style='color:#e53935'>FoodExpress Support</h2>
            <p>Hi {$customerName},</p>
            <div style='background:#f4f5f7;border-radius:10px;padding:16px;margin:16px 0;white-space:pre-wrap'>" . htmlspecialchars($reply) . "</div>
            <p style='color:#6b7280;font-size:0.875rem'>FoodExpress Support Team</p>
        </div>
    ";

    $mailResult  = ["success" => false];
    $replyStatus = "failed";
    $emailError  = null;

    try {
        $mailResult = MailHelper::sendMail($toEmail, $customerName, $subject, $emailBody);
        if (!empty($mailResult["success"])) {
            $replyStatus = "sent";
        } else {
            $emailError = $mailResult["error"] ?? "Unknown mail error";
        }
    } catch (Throwable $e) {
        $emailError = $e->getMessage();
    }

    $messageStatus = $replyStatus === "sent" ? "emailed" : "email_failed";

    // Save reply record
    $insert = $conn->prepare("
        INSERT INTO support_replies (message_id, reply_text, sent_status, email_error)
        VALUES (?, ?, ?, ?)
    ");
    $insert->bind_param("isss", $id, $reply, $replyStatus, $emailError);
    $insert->execute();
    $insert->close();

    // Update message status
    $update = $conn->prepare("UPDATE contact_messages SET status = ?, email_error = ? WHERE id = ?");
    $update->bind_param("ssi", $messageStatus, $emailError, $id);
    $update->execute();
    $update->close();

    echo json_encode([
        "success" => true,
        "message" => $replyStatus === "sent"
            ? "Reply sent and saved successfully."
            : "Reply saved, but email failed to send.",
        "email_sent" => $replyStatus === "sent"
    ]);
}

/* ── LIST REPLIES ── */
function handleListReplies($conn) {
    $messageId = (int)($_GET["message_id"] ?? 0);

    if ($messageId <= 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Message ID is required."]);
        return;
    }

    $stmt = $conn->prepare("
        SELECT id, message_id, reply_text, sent_status, email_error, created_at
        FROM support_replies
        WHERE message_id = ?
        ORDER BY created_at ASC
    ");
    $stmt->bind_param("i", $messageId);
    $stmt->execute();

    $result  = $stmt->get_result();
    $replies = [];
    while ($row = $result->fetch_assoc()) {
        $replies[] = $row;
    }
    $stmt->close();

    echo json_encode(["success" => true, "data" => $replies]);
}
?>
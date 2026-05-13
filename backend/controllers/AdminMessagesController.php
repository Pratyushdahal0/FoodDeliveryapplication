<?php
// AdminMessagesController.php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../config/db.php";

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection not available."
    ]);
    exit;
}

$action = $_GET["action"] ?? "";

try {
    if ($action === "list") {
        handleListMessages($conn);
        exit;
    }

    if ($action === "update_status") {
        handleUpdateStatus($conn);
        exit;
    }

    if ($action === "delete") {
        handleDeleteMessage($conn);
        exit;
    }

    if ($action === "reply") {
        handleReplyMessage($conn);
        exit;
    }

    if ($action === "replies") {
        handleListReplies($conn);
        exit;
    }

    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid action."
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage()
    ]);
}

function handleListMessages($conn) {
    $sql = "
        SELECT 
            id,
            first_name,
            last_name,
            email,
            phone,
            subject,
            message,
            status,
            email_error,
            created_at
        FROM contact_messages
        ORDER BY created_at DESC
    ";

    $result = $conn->query($sql);

    if (!$result) {
        throw new Exception("Failed to fetch messages: " . $conn->error);
    }

    $messages = [];

    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }

    echo json_encode([
        "success" => true,
        "data" => $messages
    ]);
}

function handleUpdateStatus($conn) {
    $input = json_decode(file_get_contents("php://input"), true);

    $id = (int)($input["id"] ?? 0);
    $status = strtolower(trim($input["status"] ?? ""));

    $allowedStatuses = [
        "received",
        "in_progress",
        "resolved",
        "emailed",
        "email_failed"
    ];

    if ($id <= 0 || !in_array($status, $allowedStatuses, true)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "Invalid message or status."
        ]);
        return;
    }

    $stmt = $conn->prepare("UPDATE contact_messages SET status = ? WHERE id = ?");
    $stmt->bind_param("si", $status, $id);
    $stmt->execute();

    echo json_encode([
        "success" => true,
        "message" => "Message status updated."
    ]);
}

function handleDeleteMessage($conn) {
    $input = json_decode(file_get_contents("php://input"), true);
    $id = (int)($input["id"] ?? 0);

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "Message ID is required."
        ]);
        return;
    }

    $stmt = $conn->prepare("DELETE FROM contact_messages WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();

    echo json_encode([
        "success" => true,
        "message" => "Message deleted."
    ]);
}

function handleReplyMessage($conn) {
    $input = json_decode(file_get_contents("php://input"), true);

    $id = (int)($input["id"] ?? 0);
    $reply = trim($input["reply"] ?? "");

    if ($id <= 0 || $reply === "") {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "Message ID and reply are required."
        ]);
        return;
    }

    $stmt = $conn->prepare("
        SELECT id, first_name, last_name, email, subject
        FROM contact_messages
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->bind_param("i", $id);
    $stmt->execute();

    $result = $stmt->get_result();
    $message = $result->fetch_assoc();

    if (!$message) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "message" => "Message not found."
        ]);
        return;
    }

    $to = $message["email"];
    $customerName = trim(($message["first_name"] ?? "") . " " . ($message["last_name"] ?? ""));
    $originalSubject = $message["subject"] ?: "FoodExpress Support";

    $emailSubject = "FoodExpress Support Reply: " . $originalSubject;

    $emailBody = "Hi " . ($customerName ?: "there") . ",\n\n";
    $emailBody .= $reply . "\n\n";
    $emailBody .= "Regards,\n";
    $emailBody .= "FoodExpress Support Team";

    $headers = "From: noreply@foodexpress.com\r\n";
    $headers .= "Reply-To: noreply@foodexpress.com\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    $mailSent = @mail($to, $emailSubject, $emailBody, $headers);

    $messageStatus = $mailSent ? "emailed" : "email_failed";
    $replyStatus = $mailSent ? "sent" : "failed";
    $emailError = $mailSent ? null : "mail() failed. Email may not be configured on localhost.";

    $insert = $conn->prepare("
        INSERT INTO support_replies
        (message_id, reply_text, sent_status, email_error)
        VALUES (?, ?, ?, ?)
    ");
    $insert->bind_param("isss", $id, $reply, $replyStatus, $emailError);
    $insert->execute();

    $update = $conn->prepare("
        UPDATE contact_messages
        SET status = ?, email_error = ?
        WHERE id = ?
    ");
    $update->bind_param("ssi", $messageStatus, $emailError, $id);
    $update->execute();

    echo json_encode([
        "success" => true,
        "message" => $mailSent
            ? "Reply sent and saved successfully."
            : "Reply saved, but email failed. Configure SMTP/mail server.",
        "email_sent" => $mailSent
    ]);
}

function handleListReplies($conn) {
    $messageId = (int)($_GET["message_id"] ?? 0);

    if ($messageId <= 0) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "Message ID is required."
        ]);
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

    $result = $stmt->get_result();
    $replies = [];

    while ($row = $result->fetch_assoc()) {
        $replies[] = $row;
    }

    echo json_encode([
        "success" => true,
        "data" => $replies
    ]);
}
?>
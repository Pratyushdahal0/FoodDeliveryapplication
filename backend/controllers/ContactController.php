<?php
header("Content-Type: application/json; charset=UTF-8");

ini_set('display_errors', 0);
error_reporting(E_ALL);

require_once("../config/db.php");

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

try {
    $data = json_decode(file_get_contents("php://input"), true);

    $firstName = trim($data["firstName"] ?? "");
    $lastName  = trim($data["lastName"] ?? "");
    $email     = trim($data["email"] ?? "");
    $phone     = trim($data["phone"] ?? "");
    $subject   = trim($data["subject"] ?? "");
    $message   = trim($data["message"] ?? "");

    if (!$firstName || !$lastName || !$email || !$subject || !$message) {
        echo json_encode(["success" => false, "message" => "All required fields needed"]);
        exit;
    }

    $status = "received";
    $emailError = null;

    // ✅ SAVE TO DB FIRST
    $stmt = $conn->prepare("
        INSERT INTO contact_messages
        (first_name, last_name, email, phone, subject, message, status, email_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->bind_param(
        "ssssssss",
        $firstName,
        $lastName,
        $email,
        $phone,
        $subject,
        $message,
        $status,
        $emailError
    );

    $stmt->execute();
    $messageId = $stmt->insert_id;
    $stmt->close();

    // ✅ TRY EMAIL (optional)
    $to = "your-email@gmail.com"; // CHANGE THIS
    $emailSubject = "FoodExpress Contact: $subject";

    $body = "Name: $firstName $lastName\n";
    $body .= "Email: $email\n";
    $body .= "Phone: $phone\n\n";
    $body .= "Message:\n$message";

    $headers = "From: noreply@foodexpress.com";

    $mailSent = @mail($to, $emailSubject, $body, $headers);

    if ($mailSent) {
        $status = "emailed";
    } else {
        $status = "email_failed";
        $emailError = "mail() failed on localhost";
    }

    // ✅ UPDATE STATUS
    $update = $conn->prepare("
        UPDATE contact_messages
        SET status = ?, email_error = ?
        WHERE id = ?
    ");

    $update->bind_param("ssi", $status, $emailError, $messageId);
    $update->execute();
    $update->close();

    echo json_encode([
        "success" => true,
        "message" => $mailSent
            ? "Message sent successfully!"
            : "Message saved. Email not configured yet."
    ]);

} catch (Throwable $e) {
    echo json_encode([
        "success" => false,
        "message" => "Server error",
        "error" => $e->getMessage()
    ]);
}
?>
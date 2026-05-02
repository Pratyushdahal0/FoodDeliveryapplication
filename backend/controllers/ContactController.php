<?php
header("Content-Type: application/json; charset=UTF-8");

ini_set("display_errors", 0);
error_reporting(E_ALL);

require_once __DIR__ . "/../config/db.php";
require_once __DIR__ . "/../helpers/MailHelper.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "message" => "Method not allowed"
    ]);
    exit();
}

function cleanContactText($value) {
    return htmlspecialchars(trim($value ?? ""), ENT_QUOTES, "UTF-8");
}

function sendImmediateContactEmail($conn, $messageId, $toEmail, $toName, $subject, $body) {
    $status = "pending";
    $emailError = null;

    try {
        if (!class_exists("MailHelper")) {
            throw new Exception("MailHelper class not found.");
        }

        $mailResult = MailHelper::sendMail(
            $toEmail,
            $toName,
            $subject,
            $body
        );

        if (!empty($mailResult["success"])) {
            $status = "emailed";
            $emailError = null;
        } else {
            $status = "email_failed";
            $emailError = $mailResult["error"] ?? "Unknown mail error";
        }
    } catch (Throwable $e) {
        $status = "email_failed";
        $emailError = $e->getMessage();
    }

    $update = $conn->prepare("
        UPDATE contact_messages
        SET status = ?, email_error = ?
        WHERE id = ?
    ");

    if ($update) {
        $update->bind_param("ssi", $status, $emailError, $messageId);
        $update->execute();
        $update->close();
    }

    return $status === "emailed";
}

try {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!is_array($data)) {
        echo json_encode([
            "success" => false,
            "message" => "Invalid request data"
        ]);
        exit();
    }

    $firstName = trim($data["firstName"] ?? "");
    $lastName  = trim($data["lastName"] ?? "");
    $email     = trim($data["email"] ?? "");
    $phone     = trim($data["phone"] ?? "");
    $subject   = trim($data["subject"] ?? "");
    $message   = trim($data["message"] ?? "");

    if ($firstName === "" || $lastName === "" || $email === "" || $subject === "" || $message === "") {
        echo json_encode([
            "success" => false,
            "message" => "Please fill in all required fields."
        ]);
        exit();
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode([
            "success" => false,
            "message" => "Please enter a valid email address."
        ]);
        exit();
    }

    $status = "received";
    $emailError = null;

    /*
    |--------------------------------------------------------------------------
    | Save contact message first
    |--------------------------------------------------------------------------
    */

    $stmt = $conn->prepare("
        INSERT INTO contact_messages
        (first_name, last_name, email, phone, subject, message, status, email_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");

    if (!$stmt) {
        throw new Exception("Contact insert prepare failed: " . $conn->error);
    }

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

    if (!$stmt->execute()) {
        throw new Exception("Contact insert failed: " . $stmt->error);
    }

    $messageId = $stmt->insert_id;
    $stmt->close();

    /*
    |--------------------------------------------------------------------------
    | Send admin notification email immediately
    |--------------------------------------------------------------------------
    | Change this to your real support/admin inbox.
    |--------------------------------------------------------------------------
    */

    $adminEmail = "foodexpressnp.support@gmail.com";
    $adminName = "FoodExpress Support";

    $safeFirstName = cleanContactText($firstName);
    $safeLastName = cleanContactText($lastName);
    $safeEmail = cleanContactText($email);
    $safePhone = cleanContactText($phone);
    $safeSubject = cleanContactText($subject);
    $safeMessage = nl2br(cleanContactText($message));

    $emailSubject = "New FoodExpress Contact Message: {$safeSubject}";

    $emailBody = "
        <div style='font-family: Arial, sans-serif; background:#f8fafc; padding:24px;'>
            <div style='max-width:650px; margin:auto; background:#ffffff; border-radius:16px; padding:24px; border:1px solid #e5e7eb;'>
                <h2 style='color:#ef3535; margin-top:0;'>New FoodExpress Contact Message</h2>

                <div style='background:#fff1f1; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:18px 0;'>
                    <p style='margin:0 0 8px;'><strong>Name:</strong> {$safeFirstName} {$safeLastName}</p>
                    <p style='margin:0 0 8px;'><strong>Email:</strong> {$safeEmail}</p>
                    <p style='margin:0 0 8px;'><strong>Phone:</strong> " . ($safePhone ?: "Not provided") . "</p>
                    <p style='margin:0;'><strong>Subject:</strong> {$safeSubject}</p>
                </div>

                <h3 style='margin-bottom:8px;'>Message</h3>
                <p style='line-height:1.6; color:#374151;'>{$safeMessage}</p>

                <p style='margin-top:24px; color:#6b7280; font-size:13px;'>
                    This message was submitted through the FoodExpress customer contact form.
                </p>
            </div>
        </div>
    ";

    $emailSent = sendImmediateContactEmail(
        $conn,
        $messageId,
        $adminEmail,
        $adminName,
        $emailSubject,
        $emailBody
    );

    echo json_encode([
        "success" => true,
        "message" => $emailSent
            ? "Message sent successfully. Our support team will review it soon."
            : "Message saved successfully. Email notification will be reviewed later.",
        "email_sent" => $emailSent
    ]);
} catch (Throwable $e) {
    echo json_encode([
        "success" => false,
        "message" => "Server error. Please try again later.",
        "error" => $e->getMessage()
    ]);
}
?>
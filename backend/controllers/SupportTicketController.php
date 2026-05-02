<?php

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

ini_set("display_errors", 0);
error_reporting(E_ALL);

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/../config/db.php";
require_once __DIR__ . "/../helpers/MailHelper.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode([
        "success" => false,
        "message" => "Only POST request is allowed."
    ]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

if (!is_array($data)) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid request data."
    ]);
    exit();
}

/*
|--------------------------------------------------------------------------
| Request Data
|--------------------------------------------------------------------------
*/

$userType = trim($data["user_type"] ?? "guest");
$userId = trim($data["user_id"] ?? "");

$firstName = trim($data["first_name"] ?? "");
$lastName = trim($data["last_name"] ?? "");
$email = trim($data["email"] ?? "");
$phone = trim($data["phone"] ?? "");

$issueType = trim($data["issue_type"] ?? "");
$issueTitle = trim($data["issue_title"] ?? "");
$message = trim($data["message"] ?? "");

$relatedOrderId = trim($data["related_order_id"] ?? "");
$relatedRestaurantId = trim($data["related_restaurant_id"] ?? "");
$relatedRiderId = trim($data["related_rider_id"] ?? "");
$sourcePage = trim($data["source_page"] ?? "help_center");

$allowedUserTypes = ["guest", "customer", "restaurant_owner", "rider"];

if (!in_array($userType, $allowedUserTypes, true)) {
    $userType = "guest";
}

if (
    $firstName === "" ||
    $email === "" ||
    $issueType === "" ||
    $issueTitle === "" ||
    $message === ""
) {
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

/*
|--------------------------------------------------------------------------
| Helper Functions
|--------------------------------------------------------------------------
*/

function detectPriority($issueType)
{
    $urgentIssues = ["safety_issue", "accident", "fraud", "security"];
    $highIssues = ["refund", "payment_refund", "payout_issue", "missing_item", "wrong_order"];

    if (in_array($issueType, $urgentIssues, true)) {
        return "urgent";
    }

    if (in_array($issueType, $highIssues, true)) {
        return "high";
    }

    return "normal";
}

function generateTicketNumber()
{
    return "FX-" . date("Ymd") . "-" . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
}

function cleanText($value)
{
    return htmlspecialchars($value ?? "", ENT_QUOTES, "UTF-8");
}

/*
|--------------------------------------------------------------------------
| Insert Email Queue + Send Immediately
|--------------------------------------------------------------------------
| Saves email to email_queue first.
| Then sends immediately using MailHelper.
| If send fails, status becomes failed and manual worker can retry later.
|--------------------------------------------------------------------------
*/

function insertEmailQueue($conn, $ticketId, $toEmail, $toName, $subject, $body, $emailType)
{
    $stmt = $conn->prepare("
        INSERT INTO email_queue (
            ticket_id,
            to_email,
            to_name,
            subject,
            body,
            email_type,
            status,
            attempts,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NOW())
    ");

    if (!$stmt) {
        throw new Exception("Email queue prepare failed: " . $conn->error);
    }

    $stmt->bind_param(
        "isssss",
        $ticketId,
        $toEmail,
        $toName,
        $subject,
        $body,
        $emailType
    );

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();

        throw new Exception("Email queue insert failed: " . $error);
    }

    $emailId = $stmt->insert_id;
    $stmt->close();

    try {
        if (!class_exists("MailHelper")) {
            throw new Exception("MailHelper class not found.");
        }

        $mailResult = MailHelper::sendMail(
            $toEmail,
            $toName ?: $toEmail,
            $subject,
            $body
        );

        if (!empty($mailResult["success"])) {
            $sentStmt = $conn->prepare("
                UPDATE email_queue
                SET 
                    status = 'sent',
                    attempts = attempts + 1,
                    last_error = NULL,
                    sent_at = NOW()
                WHERE id = ?
            ");

            if ($sentStmt) {
                $sentStmt->bind_param("i", $emailId);
                $sentStmt->execute();
                $sentStmt->close();
            }

            return true;
        }

        $errorMessage = $mailResult["error"] ?? "Unknown mail error";

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = attempts + 1,
                last_error = ?
            WHERE id = ?
        ");

        if ($failedStmt) {
            $failedStmt->bind_param("si", $errorMessage, $emailId);
            $failedStmt->execute();
            $failedStmt->close();
        }

        return false;
    } catch (Throwable $e) {
        $errorMessage = $e->getMessage();

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = attempts + 1,
                last_error = ?
            WHERE id = ?
        ");

        if ($failedStmt) {
            $failedStmt->bind_param("si", $errorMessage, $emailId);
            $failedStmt->execute();
            $failedStmt->close();
        }

        return false;
    }
}

/*
|--------------------------------------------------------------------------
| Update Support Ticket Email Status
|--------------------------------------------------------------------------
*/

function updateSupportTicketEmailStatus($conn, $ticketId, $adminEmailSent, $customerEmailSent)
{
    $emailSentValue = $adminEmailSent ? 1 : 0;
    $customerEmailSentValue = $customerEmailSent ? 1 : 0;

    $stmt = $conn->prepare("
        UPDATE support_tickets
        SET 
            email_sent = ?,
            customer_email_sent = ?
        WHERE id = ?
    ");

    if ($stmt) {
        $stmt->bind_param("iii", $emailSentValue, $customerEmailSentValue, $ticketId);
        $stmt->execute();
        $stmt->close();
    }
}

/*
|--------------------------------------------------------------------------
| Main Flow
|--------------------------------------------------------------------------
*/

$priority = detectPriority($issueType);
$ticketNumber = generateTicketNumber();

try {
    $conn->begin_transaction();

    /*
    |--------------------------------------------------------------------------
    | 1. Save Support Ticket First
    |--------------------------------------------------------------------------
    */

    $stmt = $conn->prepare("
        INSERT INTO support_tickets (
            ticket_number,
            user_type,
            user_id,
            first_name,
            last_name,
            email,
            phone,
            issue_type,
            issue_title,
            message,
            related_order_id,
            related_restaurant_id,
            related_rider_id,
            priority,
            status,
            source_page
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
    ");

    if (!$stmt) {
        throw new Exception("Support ticket prepare failed: " . $conn->error);
    }

    $stmt->bind_param(
        "sssssssssssssss",
        $ticketNumber,
        $userType,
        $userId,
        $firstName,
        $lastName,
        $email,
        $phone,
        $issueType,
        $issueTitle,
        $message,
        $relatedOrderId,
        $relatedRestaurantId,
        $relatedRiderId,
        $priority,
        $sourcePage
    );

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();

        throw new Exception("Support ticket insert failed: " . $error);
    }

    $ticketId = $conn->insert_id;
    $stmt->close();

    /*
    |--------------------------------------------------------------------------
    | 2. Prepare Safe Email Values
    |--------------------------------------------------------------------------
    */

    $safeTicketNumber = cleanText($ticketNumber);
    $safeUserType = cleanText($userType);
    $safePriority = cleanText($priority);
    $safeFirstName = cleanText($firstName);
    $safeLastName = cleanText($lastName);
    $safeEmail = cleanText($email);
    $safePhone = cleanText($phone);
    $safeIssueType = cleanText($issueType);
    $safeIssueTitle = cleanText($issueTitle);
    $safeMessage = nl2br(cleanText($message));
    $safeRelatedOrderId = cleanText($relatedOrderId);
    $safeRelatedRestaurantId = cleanText($relatedRestaurantId);
    $safeRelatedRiderId = cleanText($relatedRiderId);

    $userFullName = trim($firstName . " " . $lastName);

    if ($userFullName === "") {
        $userFullName = "FoodExpress User";
    }

    $safeUserFullName = cleanText($userFullName);

    /*
    |--------------------------------------------------------------------------
    | 3. Admin Notification Email
    |--------------------------------------------------------------------------
    */

    $adminEmail = "foodexpressnp.support@gmail.com";
    $adminName = "FoodExpress Admin";

    $adminSubject = "New FoodExpress Support Request {$ticketNumber}: {$issueTitle}";

    $adminEmailBody = "
        <div style='font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;'>
            <div style='max-width:650px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;'>
                <h2 style='color:#e53935; margin-top:0;'>New FoodExpress Support Request</h2>

                <div style='background:#fff5f5; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:18px 0;'>
                    <p style='margin:0;'><strong>Reference Number:</strong> {$safeTicketNumber}</p>
                    <p style='margin:8px 0 0;'><strong>User Type:</strong> {$safeUserType}</p>
                    <p style='margin:8px 0 0;'><strong>Priority:</strong> {$safePriority}</p>
                    <p style='margin:8px 0 0;'><strong>Status:</strong> new</p>
                </div>

                <h3 style='margin-bottom:8px;'>User Details</h3>
                <p><strong>Name:</strong> {$safeFirstName} {$safeLastName}</p>
                <p><strong>Email:</strong> {$safeEmail}</p>
                <p><strong>Phone:</strong> " . ($safePhone ?: "Not provided") . "</p>

                <hr style='border:none; border-top:1px solid #eee; margin:20px 0;'>

                <h3 style='margin-bottom:8px;'>Issue Details</h3>
                <p><strong>Issue Type:</strong> {$safeIssueType}</p>
                <p><strong>Issue Title:</strong> {$safeIssueTitle}</p>
                <p><strong>Related Order ID:</strong> " . ($safeRelatedOrderId ?: "Not provided") . "</p>
                <p><strong>Related Restaurant ID:</strong> " . ($safeRelatedRestaurantId ?: "Not provided") . "</p>
                <p><strong>Related Rider ID:</strong> " . ($safeRelatedRiderId ?: "Not provided") . "</p>

                <hr style='border:none; border-top:1px solid #eee; margin:20px 0;'>

                <h3 style='margin-bottom:8px;'>Message</h3>
                <p style='line-height:1.6;'>{$safeMessage}</p>
            </div>
        </div>
    ";

    /*
    |--------------------------------------------------------------------------
    | 4. Customer Confirmation Email
    |--------------------------------------------------------------------------
    */

    $userSubject = "FoodExpress received your message - {$ticketNumber}";

    $userEmailBody = "
        <div style='font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;'>
            <div style='max-width:650px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;'>
                <h2 style='color:#e53935; margin-top:0;'>Thank you for contacting FoodExpress</h2>

                <p>Hello {$safeUserFullName},</p>

                <p style='line-height:1.6;'>
                    Thank you for reaching out to FoodExpress Support. We have received your message
                    and our team will review your request carefully.
                </p>

                <p style='line-height:1.6;'>
                    We aim to respond as soon as possible. For order-related, payment, safety, or
                    account issues, your request may be reviewed by our support/admin team before a
                    final update is provided.
                </p>

                <div style='background:#fff5f5; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:20px 0;'>
                    <p style='margin:0;'><strong>Reference Number:</strong> {$safeTicketNumber}</p>
                    <p style='margin:8px 0 0;'><strong>Subject:</strong> {$safeIssueTitle}</p>
                    <p style='margin:8px 0 0;'><strong>Status:</strong> Received</p>
                </div>

                <p style='line-height:1.6;'>
                    Please keep this reference number for your records. If you contact us again about
                    the same matter, sharing this number will help us find your request faster.
                </p>

                <p style='line-height:1.6; color:#6b7280;'>
                    This is an automated confirmation email. You do not need to reply to this email
                    unless you have additional information to add.
                </p>

                <p style='margin-top:24px;'>
                    Kind regards,<br>
                    <strong>FoodExpress Support Team</strong><br>
                    foodexpressnp.support@gmail.com
                </p>
            </div>
        </div>
    ";

    /*
    |--------------------------------------------------------------------------
    | 5. Commit Ticket Before Sending Emails
    |--------------------------------------------------------------------------
    */

    $conn->commit();

    /*
    |--------------------------------------------------------------------------
    | 6. Send Emails Immediately
    |--------------------------------------------------------------------------
    | Done after commit so ticket is saved even if email fails.
    |--------------------------------------------------------------------------
    */

    $adminEmailSent = insertEmailQueue(
        $conn,
        $ticketId,
        $adminEmail,
        $adminName,
        $adminSubject,
        $adminEmailBody,
        "admin_notification"
    );

    $customerEmailSent = insertEmailQueue(
        $conn,
        $ticketId,
        $email,
        $userFullName,
        $userSubject,
        $userEmailBody,
        "user_confirmation"
    );

    updateSupportTicketEmailStatus(
        $conn,
        $ticketId,
        $adminEmailSent,
        $customerEmailSent
    );

    echo json_encode([
        "success" => true,
        "message" => "Your message has been submitted successfully.",
        "ticket_number" => $ticketNumber,
        "priority" => $priority,
        "email_status" => [
            "admin_notification" => $adminEmailSent ? "sent" : "failed",
            "user_confirmation" => $customerEmailSent ? "sent" : "failed"
        ]
    ]);
} catch (Throwable $e) {
    if ($conn && $conn->errno === 0) {
        // no-op; prevents accidental rollback error after commit
    }

    try {
        $conn->rollback();
    } catch (Throwable $rollbackError) {
        // Ignore rollback errors if transaction already committed.
    }

    echo json_encode([
        "success" => false,
        "message" => "Something went wrong while submitting your message.",
        "error" => $e->getMessage()
    ]);
}
?>
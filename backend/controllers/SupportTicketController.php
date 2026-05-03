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

function formatLabel($value)
{
    $value = str_replace("_", " ", $value ?? "");
    return ucwords(trim($value));
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
    $safeSourcePage = cleanText($sourcePage);

    $formattedIssueType = cleanText(formatLabel($issueType));
    $formattedPriority = cleanText(formatLabel($priority));
    $formattedUserType = cleanText(formatLabel($userType));
    $formattedSourcePage = cleanText(formatLabel($sourcePage));

    $userFullName = trim($firstName . " " . $lastName);

    if ($userFullName === "") {
        $userFullName = "FoodExpress User";
    }

    $safeUserFullName = cleanText($userFullName);
    $customerFirstName = $safeFirstName ?: "there";

    /*
    |--------------------------------------------------------------------------
    | 3. Admin Notification Email
    |--------------------------------------------------------------------------
    */

    $adminEmail = "foodexpressnp.support@gmail.com";
    $adminName = "FoodExpress Admin";

    $adminSubject = "[{$formattedPriority}] New FoodExpress Support Ticket - {$ticketNumber}";

    $adminEmailBody = "
<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <title>New FoodExpress Support Ticket</title>
</head>
<body style='margin:0; padding:0; background:#f6f7fb; font-family:Arial, Helvetica, sans-serif; color:#12203A;'>
  <div style='width:100%; background:#f6f7fb; padding:32px 14px;'>
    <div style='max-width:720px; margin:0 auto; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 18px 45px rgba(18,32,58,0.10);'>

      <div style='background:#12203A; padding:30px 34px; color:#ffffff;'>
        <div style='font-size:28px; font-weight:900; letter-spacing:-0.5px;'>
          <span style='color:#F2644C;'>▰</span> FoodExpress
        </div>
        <p style='margin:8px 0 0; font-size:15px; color:#dbe3ef;'>
          New support ticket received
        </p>
      </div>

      <div style='padding:34px;'>
        <h2 style='margin:0 0 10px; font-size:26px; line-height:1.3; color:#12203A;'>
          New customer support request
        </h2>

        <p style='margin:0 0 24px; color:#6B7280; font-size:15px; line-height:1.7;'>
          A new support ticket has been submitted through FoodExpress. Review the customer issue and respond based on priority.
        </p>

        <div style='background:#fff7f5; border:1px solid #ffd2c8; border-radius:18px; padding:22px; margin:24px 0;'>
          <p style='margin:0 0 12px; font-size:15px;'>
            <strong>Reference Number:</strong> {$safeTicketNumber}
          </p>
          <p style='margin:0 0 12px; font-size:15px;'>
            <strong>Priority:</strong> {$formattedPriority}
          </p>
          <p style='margin:0 0 12px; font-size:15px;'>
            <strong>Status:</strong> New
          </p>
          <p style='margin:0; font-size:15px;'>
            <strong>Source:</strong> {$formattedSourcePage}
          </p>
        </div>

        <div style='border:1px solid #E9E2DC; border-radius:18px; padding:22px; margin:24px 0;'>
          <h3 style='margin:0 0 16px; color:#12203A; font-size:18px;'>Customer details</h3>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Name:</strong> {$safeFirstName} {$safeLastName}</p>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Email:</strong> {$safeEmail}</p>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Phone:</strong> " . ($safePhone ?: "Not provided") . "</p>
          <p style='margin:0; font-size:15px;'><strong>User Type:</strong> {$formattedUserType}</p>
        </div>

        <div style='border:1px solid #E9E2DC; border-radius:18px; padding:22px; margin:24px 0;'>
          <h3 style='margin:0 0 16px; color:#12203A; font-size:18px;'>Issue details</h3>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Issue Type:</strong> {$formattedIssueType}</p>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Issue Title:</strong> {$safeIssueTitle}</p>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Related Order ID:</strong> " . ($safeRelatedOrderId ?: "Not provided") . "</p>
          <p style='margin:0 0 10px; font-size:15px;'><strong>Related Restaurant ID:</strong> " . ($safeRelatedRestaurantId ?: "Not provided") . "</p>
          <p style='margin:0; font-size:15px;'><strong>Related Rider ID:</strong> " . ($safeRelatedRiderId ?: "Not provided") . "</p>
        </div>

        <div style='background:#F9FAFB; border:1px solid #E5E7EB; border-radius:18px; padding:22px; margin:24px 0;'>
          <h3 style='margin:0 0 14px; color:#12203A; font-size:18px;'>Customer message</h3>
          <div style='font-size:15px; line-height:1.8; color:#374151;'>
            {$safeMessage}
          </div>
        </div>

        <p style='margin:24px 0 0; color:#6B7280; font-size:14px; line-height:1.7;'>
          This admin notification was generated automatically by FoodExpress Support.
        </p>
      </div>

      <div style='background:#FAF7F3; padding:20px 34px; border-top:1px solid #E9E2DC; color:#6B7280; font-size:13px;'>
        <strong style='color:#12203A;'>FoodExpress Admin</strong><br>
        Support operations notification
      </div>

    </div>
  </div>
</body>
</html>
";

    /*
    |--------------------------------------------------------------------------
    | 4. Customer Confirmation Email
    |--------------------------------------------------------------------------
    */

    $userSubject = "FoodExpress Support received your request - {$ticketNumber}";

    $relatedOrderBlock = "";

    if ($safeRelatedOrderId) {
        $relatedOrderBlock = "
        <div style='border:1px solid #E9E2DC; border-radius:18px; padding:20px; margin:24px 0;'>
          <h3 style='margin:0 0 12px; font-size:18px; color:#12203A;'>Related order</h3>
          <p style='margin:0; font-size:15px; color:#374151;'>
            <strong>Order Number:</strong> {$safeRelatedOrderId}
          </p>
        </div>
        ";
    }

    $userEmailBody = "
<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <title>FoodExpress Support</title>
</head>
<body style='margin:0; padding:0; background:#f6f7fb; font-family:Arial, Helvetica, sans-serif; color:#12203A;'>
  <div style='width:100%; background:#f6f7fb; padding:32px 14px;'>
    <div style='max-width:680px; margin:0 auto; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 18px 45px rgba(18,32,58,0.10);'>

      <div style='background:linear-gradient(135deg,#F2644C,#F58A5C); padding:30px 34px; color:#ffffff;'>
        <div style='font-size:28px; font-weight:900; letter-spacing:-0.5px;'>
          FoodExpress
        </div>
        <p style='margin:8px 0 0; font-size:15px; color:#fff4ef;'>
          Support request received
        </p>
      </div>

      <div style='padding:34px;'>
        <h2 style='margin:0 0 16px; font-size:27px; line-height:1.3; color:#12203A;'>
          We received your support request
        </h2>

        <p style='font-size:16px; line-height:1.7; margin:0 0 16px;'>
          Hi {$customerFirstName},
        </p>

        <p style='font-size:16px; line-height:1.7; margin:0 0 16px; color:#374151;'>
          Thanks for contacting FoodExpress Support. We’ve received your request and our team will review it shortly.
        </p>

        <p style='font-size:16px; line-height:1.7; margin:0 0 24px; color:#374151;'>
          For order, delivery, payment, refund, safety, or account-related issues, our support/admin team may review the details before providing a final update.
        </p>

        <div style='background:#fff7f5; border:1px solid #ffd2c8; border-radius:18px; padding:22px; margin:24px 0;'>
          <p style='margin:0 0 12px; font-size:15px;'>
            <strong>Reference Number:</strong> {$safeTicketNumber}
          </p>
          <p style='margin:0 0 12px; font-size:15px;'>
            <strong>Subject:</strong> {$safeIssueTitle}
          </p>
          <p style='margin:0 0 12px; font-size:15px;'>
            <strong>Issue Type:</strong> {$formattedIssueType}
          </p>
          <p style='margin:0; font-size:15px;'>
            <strong>Status:</strong> Received
          </p>
        </div>

        <div style='background:#F9FAFB; border:1px solid #E5E7EB; border-radius:18px; padding:22px; margin:24px 0;'>
          <h3 style='margin:0 0 12px; font-size:18px; color:#12203A;'>What happens next?</h3>
          <p style='margin:0; font-size:15px; line-height:1.7; color:#4B5563;'>
            Our support team will check your message and respond as soon as possible. Please keep your reference number for faster follow-up.
          </p>
        </div>

        {$relatedOrderBlock}

        <p style='font-size:15px; line-height:1.7; color:#4B5563; margin:0 0 20px;'>
          If you contact us again about the same issue, sharing this reference number will help us find your request faster.
        </p>

        <p style='font-size:16px; line-height:1.7; margin:0;'>
          Thank you,<br>
          <strong>FoodExpress Support Team</strong>
        </p>
      </div>

      <div style='background:#12203A; color:#dbe3ef; padding:22px 34px; text-align:center; font-size:13px;'>
        <p style='margin:0 0 6px; font-weight:700; color:#ffffff;'>FoodExpress Support</p>
        <p style='margin:0 0 6px;'>This is an automated confirmation email.</p>
        <p style='margin:0;'>foodexpressnp.support@gmail.com</p>
      </div>

    </div>
  </div>
</body>
</html>
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
    try {
        if (isset($conn)) {
            $conn->rollback();
        }
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
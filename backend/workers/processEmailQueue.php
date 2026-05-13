<?php
error_reporting(E_ALL);
ini_set("display_errors", 0);

header("Content-Type: text/plain; charset=UTF-8");

require_once __DIR__ . "/../config/db.php";
require_once __DIR__ . "/../helpers/MailHelper.php";

/*
|--------------------------------------------------------------------------
| FoodExpress Email Queue Worker
|--------------------------------------------------------------------------
| Local:
| http://localhost/FoodDeliveryapp/backend/workers/processEmailQueue.php?secret=foodexpress-beta-2026
|
| Hosted:
| https://yourdomain.infinityfreeapp.com/backend/workers/processEmailQueue.php?secret=foodexpress-beta-2026
|--------------------------------------------------------------------------
*/

$workerSecret = "foodexpress-beta-2026";
$providedSecret = $_GET["secret"] ?? "";

$isLocal =
    isset($_SERVER["HTTP_HOST"]) &&
    (
        strpos($_SERVER["HTTP_HOST"], "localhost") !== false ||
        strpos($_SERVER["HTTP_HOST"], "127.0.0.1") !== false
    );

/*
|--------------------------------------------------------------------------
| Security
|--------------------------------------------------------------------------
| For local testing, secret is recommended.
| For hosted/public site, secret is required.
|--------------------------------------------------------------------------
*/

if (!$isLocal && $providedSecret !== $workerSecret) {
    http_response_code(403);
    echo "Forbidden: invalid worker secret.";
    exit();
}

if ($isLocal && $providedSecret !== "" && $providedSecret !== $workerSecret) {
    http_response_code(403);
    echo "Forbidden: invalid worker secret.";
    exit();
}

$maxEmailsPerRun = 10;

echo "FoodExpress Email Queue Worker Started...\n";
echo "Environment: " . ($isLocal ? "local" : "hosted") . "\n";
echo "Max emails this run: {$maxEmailsPerRun}\n\n";

try {
    $stmt = $conn->prepare("
        SELECT 
            id,
            ticket_id,
            to_email,
            to_name,
            subject,
            body,
            email_type,
            attempts
        FROM email_queue
        WHERE 
            status = 'pending'
            OR (status = 'failed' AND attempts < 3)
        ORDER BY created_at ASC
        LIMIT ?
    ");

    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }

    $stmt->bind_param("i", $maxEmailsPerRun);
    $stmt->execute();

    $result = $stmt->get_result();

    if (!$result || $result->num_rows === 0) {
        echo "No pending emails found.\n";
        $stmt->close();
        exit();
    }

    echo "Found " . $result->num_rows . " email(s) to process.\n\n";

    while ($emailJob = $result->fetch_assoc()) {
        $emailId = (int) $emailJob["id"];
        $ticketId = !empty($emailJob["ticket_id"]) ? (int) $emailJob["ticket_id"] : null;

        $toEmail = trim($emailJob["to_email"] ?? "");
        $toName = trim($emailJob["to_name"] ?? "") ?: $toEmail;
        $subject = $emailJob["subject"] ?? "FoodExpress Notification";
        $body = $emailJob["body"] ?? "";
        $emailType = $emailJob["email_type"] ?? "general";
        $attempts = (int) ($emailJob["attempts"] ?? 0);

        echo "Processing email #{$emailId} to {$toEmail}...\n";

        if ($toEmail === "" || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            markEmailFailed($conn, $emailId, $attempts + 1, "Invalid recipient email address");
            updateTicketEmailStatus($conn, $ticketId, $emailType, false, "Invalid recipient email address");

            echo "Failed: Invalid recipient email address\n\n";
            continue;
        }

        $processingStmt = $conn->prepare("
            UPDATE email_queue
            SET status = 'processing'
            WHERE id = ?
        ");

        if ($processingStmt) {
            $processingStmt->bind_param("i", $emailId);
            $processingStmt->execute();
            $processingStmt->close();
        }

        $mailResult = MailHelper::sendMail(
            $toEmail,
            $toName,
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

            if (!$sentStmt) {
                throw new Exception("Sent update prepare failed: " . $conn->error);
            }

            $sentStmt->bind_param("i", $emailId);
            $sentStmt->execute();
            $sentStmt->close();

            updateTicketEmailStatus($conn, $ticketId, $emailType, true, null);

            echo "Sent successfully.\n\n";
            continue;
        }

        $newAttempts = $attempts + 1;
        $errorMessage = $mailResult["error"] ?? "Unknown mail error";

        markEmailFailed($conn, $emailId, $newAttempts, $errorMessage);
        updateTicketEmailStatus($conn, $ticketId, $emailType, false, $errorMessage);

        echo "Failed: {$errorMessage}\n\n";
    }

    $stmt->close();

    echo "Email Queue Worker Finished.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "Worker error: " . $e->getMessage() . "\n";
}

function markEmailFailed($conn, $emailId, $attempts, $errorMessage)
{
    $failedStmt = $conn->prepare("
        UPDATE email_queue
        SET 
            status = 'failed',
            attempts = ?,
            last_error = ?
        WHERE id = ?
    ");

    if (!$failedStmt) {
        return;
    }

    $failedStmt->bind_param("isi", $attempts, $errorMessage, $emailId);
    $failedStmt->execute();
    $failedStmt->close();
}

function updateTicketEmailStatus($conn, $ticketId, $emailType, $sent, $error)
{
    if (!$ticketId) {
        return;
    }

    $sentValue = $sent ? 1 : 0;

    if ($emailType === "admin_notification") {
        $stmt = $conn->prepare("
            UPDATE support_tickets
            SET email_sent = ?, email_error = ?
            WHERE id = ?
        ");

        if ($stmt) {
            $stmt->bind_param("isi", $sentValue, $error, $ticketId);
            $stmt->execute();
            $stmt->close();
        }

        return;
    }

    if ($emailType === "user_confirmation") {
        $stmt = $conn->prepare("
            UPDATE support_tickets
            SET customer_email_sent = ?, customer_email_error = ?
            WHERE id = ?
        ");

        if ($stmt) {
            $stmt->bind_param("isi", $sentValue, $error, $ticketId);
            $stmt->execute();
            $stmt->close();
        }

        return;
    }
}
?>
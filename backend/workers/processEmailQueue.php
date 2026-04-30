<?php

require_once __DIR__ . "/../config/db.php";
require_once __DIR__ . "/../helpers/MailHelper.php";

header("Content-Type: text/plain");

$maxEmailsPerRun = 10;

echo "FoodExpress Email Queue Worker Started...\n";

try {
    /*
    |--------------------------------------------------------------------------
    | 1. Get pending / retryable failed emails
    |--------------------------------------------------------------------------
    | We pick:
    | - pending emails
    | - failed emails with less than 3 attempts
    |--------------------------------------------------------------------------
    */

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

    if ($result->num_rows === 0) {
        echo "No pending emails found.\n";
        exit;
    }

    echo "Found " . $result->num_rows . " email(s) to process.\n\n";

    /*
    |--------------------------------------------------------------------------
    | 2. Process each email
    |--------------------------------------------------------------------------
    */

    while ($emailJob = $result->fetch_assoc()) {
        $emailId = (int) $emailJob["id"];
        $ticketId = $emailJob["ticket_id"] ? (int) $emailJob["ticket_id"] : null;
        $toEmail = $emailJob["to_email"];
        $toName = $emailJob["to_name"] ?: $emailJob["to_email"];
        $subject = $emailJob["subject"];
        $body = $emailJob["body"];
        $emailType = $emailJob["email_type"];
        $attempts = (int) $emailJob["attempts"];

        echo "Processing email #{$emailId} to {$toEmail}...\n";

        /*
        |--------------------------------------------------------------------------
        | Mark as processing
        |--------------------------------------------------------------------------
        */

        $processingStmt = $conn->prepare("
            UPDATE email_queue
            SET status = 'processing'
            WHERE id = ?
        ");

        if ($processingStmt) {
            $processingStmt->bind_param("i", $emailId);
            $processingStmt->execute();
        }

        /*
        |--------------------------------------------------------------------------
        | Send email
        |--------------------------------------------------------------------------
        */

        $mailResult = MailHelper::sendMail(
            $toEmail,
            $toName,
            $subject,
            $body
        );

        /*
        |--------------------------------------------------------------------------
        | If sent successfully
        |--------------------------------------------------------------------------
        */

        if ($mailResult["success"]) {
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

            updateTicketEmailStatus($conn, $ticketId, $emailType, true, null);

            echo "✅ Sent successfully.\n\n";
            continue;
        }

        /*
        |--------------------------------------------------------------------------
        | If failed
        |--------------------------------------------------------------------------
        */

        $newAttempts = $attempts + 1;
        $errorMessage = $mailResult["error"] ?? "Unknown mail error";

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = ?,
                last_error = ?
            WHERE id = ?
        ");

        if (!$failedStmt) {
            throw new Exception("Failed update prepare failed: " . $conn->error);
        }

        $failedStmt->bind_param("isi", $newAttempts, $errorMessage, $emailId);
        $failedStmt->execute();

        updateTicketEmailStatus($conn, $ticketId, $emailType, false, $errorMessage);

        echo "❌ Failed: {$errorMessage}\n\n";
    }

    echo "Email Queue Worker Finished.\n";
} catch (Exception $e) {
    echo "Worker error: " . $e->getMessage() . "\n";
}

/*
|--------------------------------------------------------------------------
| Helper: Update support_tickets email status
|--------------------------------------------------------------------------
*/

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
        }

        return;
    }
}
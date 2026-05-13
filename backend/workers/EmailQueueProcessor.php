<?php
require_once __DIR__ . "/MailHelper.php";

if (!function_exists("processFoodExpressEmailQueue")) {
    function processFoodExpressEmailQueue($conn, $maxEmailsPerRun = 3, $echoOutput = false) {
        $processed = 0;
        $sent = 0;
        $failed = 0;

        $log = function ($message) use ($echoOutput) {
            if ($echoOutput) {
                echo $message . "\n";
            }
        };

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
                $stmt->close();

                return [
                    "success" => true,
                    "processed" => 0,
                    "sent" => 0,
                    "failed" => 0,
                    "message" => "No pending emails found."
                ];
            }

            while ($emailJob = $result->fetch_assoc()) {
                $processed++;

                $emailId = (int) $emailJob["id"];
                $ticketId = !empty($emailJob["ticket_id"])
                    ? (int) $emailJob["ticket_id"]
                    : null;

                $toEmail = trim($emailJob["to_email"] ?? "");
                $toName = trim($emailJob["to_name"] ?? "") ?: $toEmail;
                $subject = $emailJob["subject"] ?? "FoodExpress Notification";
                $body = $emailJob["body"] ?? "";
                $emailType = $emailJob["email_type"] ?? "general";
                $attempts = (int) ($emailJob["attempts"] ?? 0);

                $log("Processing email #{$emailId} to {$toEmail}...");

                if ($toEmail === "" || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
                    foodExpressMarkEmailFailed(
                        $conn,
                        $emailId,
                        $attempts + 1,
                        "Invalid recipient email address"
                    );

                    foodExpressUpdateTicketEmailStatus(
                        $conn,
                        $ticketId,
                        $emailType,
                        false,
                        "Invalid recipient email address"
                    );

                    $failed++;
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

                    if ($sentStmt) {
                        $sentStmt->bind_param("i", $emailId);
                        $sentStmt->execute();
                        $sentStmt->close();
                    }

                    foodExpressUpdateTicketEmailStatus(
                        $conn,
                        $ticketId,
                        $emailType,
                        true,
                        null
                    );

                    $sent++;
                    $log("Sent successfully.");
                    continue;
                }

                $errorMessage = $mailResult["error"] ?? "Unknown mail error";

                foodExpressMarkEmailFailed(
                    $conn,
                    $emailId,
                    $attempts + 1,
                    $errorMessage
                );

                foodExpressUpdateTicketEmailStatus(
                    $conn,
                    $ticketId,
                    $emailType,
                    false,
                    $errorMessage
                );

                $failed++;
                $log("Failed: {$errorMessage}");
            }

            $stmt->close();

            return [
                "success" => true,
                "processed" => $processed,
                "sent" => $sent,
                "failed" => $failed,
                "message" => "Email queue processed."
            ];
        } catch (Throwable $e) {
            return [
                "success" => false,
                "processed" => $processed,
                "sent" => $sent,
                "failed" => $failed,
                "message" => $e->getMessage()
            ];
        }
    }
}

if (!function_exists("foodExpressMarkEmailFailed")) {
    function foodExpressMarkEmailFailed($conn, $emailId, $attempts, $errorMessage) {
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
}

if (!function_exists("foodExpressUpdateTicketEmailStatus")) {
    function foodExpressUpdateTicketEmailStatus($conn, $ticketId, $emailType, $sent, $error) {
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
}
?>
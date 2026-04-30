<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . "/../../vendor/autoload.php";

class MailHelper
{
    public static function sendMail($toEmail, $toName, $subject, $body)
    {
        $config = require __DIR__ . "/../config/mail.php";

        $mail = new PHPMailer(true);

        try {
            $mail->isSMTP();
            $mail->Host = $config["host"];
            $mail->SMTPAuth = true;
            $mail->Username = $config["username"];
            $mail->Password = $config["password"];
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = $config["port"];

            $mail->setFrom($config["from_email"], $config["from_name"]);
            $mail->addAddress($toEmail, $toName);

            $mail->isHTML(true);
            $mail->CharSet = "UTF-8";
            $mail->Subject = $subject;
            $mail->Body = $body;

            $mail->send();

            return [
                "success" => true,
                "error" => null
            ];
        } catch (Exception $e) {
            return [
                "success" => false,
                "error" => $mail->ErrorInfo
            ];
        }
    }
}
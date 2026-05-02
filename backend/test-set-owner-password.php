<?php
require_once __DIR__ . "/config/db.php";

$email = "pratyushdahal5+owner@gmail.com";
$newPassword = "Oldtownroad";

$hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);

$stmt = $conn->prepare("
    UPDATE users
    SET password = ?, role = 'restaurant-owner', status = 'active', email_verified_at = NOW()
    WHERE email = ?
");

if (!$stmt) {
    die("Prepare failed: " . $conn->error);
}

$stmt->bind_param("ss", $hashedPassword, $email);

if ($stmt->execute()) {
    echo "Owner password reset successfully.<br>";
    echo "Email: " . htmlspecialchars($email) . "<br>";
    echo "Password: " . htmlspecialchars($newPassword) . "<br>";
} else {
    echo "Update failed: " . $stmt->error;
}

$stmt->close();
$conn->close();
?>
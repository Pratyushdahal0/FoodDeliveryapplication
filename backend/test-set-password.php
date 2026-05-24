<?php
require_once "config/db.php";
$newPassword = 'admin123';
$hash = password_hash($newPassword, PASSWORD_DEFAULT);
$stmt = $conn->prepare("UPDATE users SET password = ? WHERE email = 'jigaro7688@badgerhole.com'");
$stmt->bind_param("s", $hash);
$stmt->execute();
echo "Done! Rows affected: " . $conn->affected_rows;
?>
<?php
require_once "config/db.php";

$stmt = $conn->prepare("SELECT password FROM users WHERE email = 'admin@foodexpress.com'");
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();

$hash = $row['password'];
echo "Hash length: " . strlen($hash) . "<br>";
echo "Hash: " . $hash . "<br>";
echo password_verify('password', $hash) ? "PASSWORD MATCHES ✅" : "PASSWORD FAILS ❌";
?>
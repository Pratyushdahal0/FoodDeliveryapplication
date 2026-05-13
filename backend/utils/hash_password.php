<?php
/**
 * This file helps hash plain-text passwords in the database
 * 
 * Usage: Access this file once, then delete it or comment it out
 * 
 * To use:
 * 1. Open http://localhost/fooddeliveryapp/backend/utils/hash_password.php?email=YOUR_EMAIL&password=YOUR_PASSWORD
 * 2. It will hash and update the password in the database
 * 3. Then you can login normally
 */

require "../config/db.php";

if ($_SERVER["REQUEST_METHOD"] == "GET" && isset($_GET['email']) && isset($_GET['password'])) {
    $email = $_GET['email'];
    $plainPassword = $_GET['password'];
    
    // Hash the password
    $hashedPassword = password_hash($plainPassword, PASSWORD_DEFAULT);
    
    // Update the database
    $sql = "UPDATE users SET password = ? WHERE email = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ss", $hashedPassword, $email);
    
    if ($stmt->execute()) {
        echo "Password updated successfully for: " . htmlspecialchars($email);
        echo "<br><br>You can now login with your credentials.";
    } else {
        echo "Error updating password: " . $stmt->error;
    }
} else {
    echo "Please provide email and password as URL parameters:";
    echo "<br>Example: ?email=your@email.com&password=yourpassword";
}
?>

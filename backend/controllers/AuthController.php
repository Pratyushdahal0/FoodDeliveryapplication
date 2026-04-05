<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require "../config/db.php";
require "../models/User.php";

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $action = $_POST['action'] ?? '';

    $user = new User($conn);

    // LOGIN
    if ($action == "login") {

        $email = $_POST['email'] ?? '';
        $password = $_POST['password'] ?? '';

        if (empty($email) || empty($password)) {
            echo "Email and password are required";
            exit;
        }

        $result = $user->login($email, $password);

        if ($result) {
            echo "Login successful";
        } else {
            echo "Invalid email or password";
        }
    }

    // REGISTER
    elseif ($action == "register") {

        $name = $_POST['name'] ?? '';
        $email = $_POST['email'] ?? '';
        $password = $_POST['password'] ?? '';
        $phone = $_POST['phone'] ?? '';
        $address = $_POST['address'] ?? '';
        $role = $_POST['role'] ?? 'customer';

        $result = $user->register($name, $email, $password, $phone, $address, $role);

        echo $result;
    }

    else {
        echo "Invalid action";
    }
}
?>
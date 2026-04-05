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

        $result = $user->login($email, $password);

        echo $result ? "Login successful" : "Invalid credentials";
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
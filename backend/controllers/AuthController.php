<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

require "../config/db.php";
require "../models/User.php";

function send_json($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit();
}

function get_json_input() {
    $raw = file_get_contents("php://input");
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

$user = new User($conn);

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $contentType = $_SERVER["CONTENT_TYPE"] ?? "";
    $body = stripos($contentType, "application/json") !== false ? get_json_input() : $_POST;

    $action = $body["action"] ?? "";

    if ($action === "login") {
        $email = trim($body["email"] ?? "");
        $password = $body["password"] ?? "";

        if ($email === "" || $password === "") {
            send_json([
                "success" => false,
                "message" => "Email and password are required"
            ], 400);
        }

        $result = $user->login($email, $password);

        if (!$result) {
            send_json([
                "success" => false,
                "message" => "Invalid email or password"
            ], 401);
        }

        $userData = $user->getByEmail($email);

        if (!$userData) {
            send_json([
                "success" => false,
                "message" => "User profile not found after login"
            ], 500);
        }

        send_json([
            "success" => true,
            "message" => "Login successful",
            "data" => $userData
        ]);
    }

    if ($action === "register") {
        $name = trim($body["name"] ?? "");
        $email = trim($body["email"] ?? "");
        $password = $body["password"] ?? "";
        $phone = trim($body["phone"] ?? "");
        $address = trim($body["address"] ?? "");
        $role = trim($body["role"] ?? "customer");

        if ($name === "" || $email === "" || $password === "") {
            send_json([
                "success" => false,
                "message" => "Name, email and password are required"
            ], 400);
        }

        $allowedRoles = ["customer", "owner", "restaurant-owner", "restaurant_owner"];
        if (!in_array($role, $allowedRoles, true)) {
            $role = "customer";
        }

        $normalizedRole = in_array($role, ["owner", "restaurant-owner", "restaurant_owner"], true)
            ? "restaurant-owner"
            : "customer";

        $result = $user->register($name, $email, $password, $phone, $address, $normalizedRole);

        if (strpos($result, "Registered successfully") === false) {
            send_json([
                "success" => false,
                "message" => $result
            ], 400);
        }

        $userData = $user->getByEmail($email);

        send_json([
            "success" => true,
            "message" => $result,
            "data" => $userData
        ]);
    }

    if ($action === "logout") {
        send_json([
            "success" => true,
            "message" => "Logout handled on client side"
        ]);
    }

    send_json([
        "success" => false,
        "message" => "Invalid action"
    ], 400);
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $action = $_GET["action"] ?? "";

    if ($action === "profile" && isset($_GET["email"])) {
        $email = trim($_GET["email"]);
        $userData = $user->getByEmail($email);

        if (!$userData) {
            send_json([
                "success" => false,
                "message" => "User not found"
            ], 404);
        }

        send_json([
            "success" => true,
            "data" => $userData
        ]);
    }

    if ($action === "current") {
        $email =
            trim($_GET["email"] ?? "") ?:
            trim($_SERVER["HTTP_X_USER_EMAIL"] ?? "");

        if ($email === "") {
            send_json([
                "success" => false,
                "message" => "User email is required for current profile lookup"
            ], 400);
        }

        $userData = $user->getByEmail($email);

        if (!$userData) {
            send_json([
                "success" => false,
                "message" => "User not found"
            ], 404);
        }

        send_json([
            "success" => true,
            "data" => $userData
        ]);
    }

    send_json([
        "success" => false,
        "message" => "Invalid action"
    ], 400);
}
?>
<?php

require_once "../controllers/SupportController.php";

$controller = new SupportController();

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $controller->chat();
} else {
    header("Content-Type: application/json");
    echo json_encode(["message" => "FoodExpress Support API is running."]);
}
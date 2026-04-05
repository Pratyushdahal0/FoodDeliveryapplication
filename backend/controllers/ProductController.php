<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST");
header("Access-Control-Allow-Headers: Content-Type");

require "../config/db.php";
require "../models/Product.php";

$product = new Product($conn);

$action = $_GET['action'] ?? '';

switch ($action) {

    // GET all products
    // URL: ProductController.php?action=all
    case 'all':
        $products = $product->getAll();
        echo json_encode([
            "success" => true,
            "data" => $products
        ]);
        break;

    // GET popular products
    // URL: ProductController.php?action=popular
    case 'popular':
        $products = $product->getPopular();
        echo json_encode([
            "success" => true,
            "data" => $products
        ]);
        break;

    // GET by category
    // URL: ProductController.php?action=category&category=burger
    case 'category':
        $category = $_GET['category'] ?? '';
        if (!$category) {
            echo json_encode(["success" => false, "message" => "Category required"]);
            break;
        }
        $products = $product->getByCategory($category);
        echo json_encode([
            "success" => true,
            "data" => $products
        ]);
        break;

    // GET single product
    // URL: ProductController.php?action=single&id=1
    case 'single':
        $id = $_GET['id'] ?? 0;
        if (!$id) {
            echo json_encode(["success" => false, "message" => "ID required"]);
            break;
        }
        $product = $product->getById($id);
        echo json_encode([
            "success" => true,
            "data" => $product
        ]);
        break;

    // SEARCH products
    // URL: ProductController.php?action=search&q=burger
    case 'search':
        $keyword = $_GET['q'] ?? '';
        if (!$keyword) {
            echo json_encode(["success" => false, "message" => "Search keyword required"]);
            break;
        }
        $products = $product->search($keyword);
        echo json_encode([
            "success" => true,
            "data" => $products
        ]);
        break;

    default:
        echo json_encode([
            "success" => false,
            "message" => "Invalid action"
        ]);
        break;
}
?>
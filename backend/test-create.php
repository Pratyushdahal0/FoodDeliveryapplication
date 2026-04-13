<?php
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => "http://localhost/FOODDELIVERYAPP/backend/controllers/ProductController.php?action=create",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => [
        "restaurant_id" => 1,
        "name" => "Momo",
        "description" => "Test item",
        "price" => 100,
        "category" => "Nepali",
        "image_url" => "",
        "is_available" => 1,
        "is_popular" => 1
    ]
]);

$response = curl_exec($ch);

if (curl_errno($ch)) {
    echo "cURL Error: " . curl_error($ch);
} else {
    echo $response;
}

curl_close($ch);
?>
<?php

class SupportController {
    public function chat() {
        header("Content-Type: application/json");

        $data = json_decode(file_get_contents("php://input"), true);
        $userMessage = trim($data["message"] ?? "");

        if ($userMessage === "") {
            echo json_encode(["reply" => "Please type your support issue."]);
            return;
        }

        $apiKey = "PASTE_YOUR_OPENAI_API_KEY_HERE";

        $prompt = "
You are FoodExpress Rider Support AI.

Rules:
- Reply like a professional support agent.
- Keep replies short, helpful, and friendly.
- Help riders with delivery delay, customer issue, payout, earnings, withdrawal, and escalation.
- If issue is serious or unsafe, tell rider it will be escalated.
- Do not say you are ChatGPT.

Rider message: {$userMessage}
";

        $payload = [
            "model" => "gpt-4.1-mini",
            "input" => $prompt
        ];

        $ch = curl_init("https://api.openai.com/v1/responses");

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                "Content-Type: application/json",
                "Authorization: Bearer " . $apiKey
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 30
        ]);

        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            echo json_encode(["reply" => "Support is currently unavailable."]);
            return;
        }

        $responseData = json_decode($response, true);

        $reply = $responseData["output_text"]
            ?? $responseData["output"][0]["content"][0]["text"]
            ?? "Support is currently unavailable.";

        echo json_encode(["reply" => $reply]);
    }
}
<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

require "../config/db.php";
require "../models/User.php";
require_once __DIR__ . "/../helpers/MailHelper.php";
require_once __DIR__ . "/../helpers/JwtHelper.php";

/*
|--------------------------------------------------------------------------
| Safe Email Queue Processor Import
|--------------------------------------------------------------------------
| This prevents AuthController from crashing with 500 if the helper file
| is missing, renamed, or has an issue. Registration will still queue email.
|--------------------------------------------------------------------------
*/

$emailProcessorPath = __DIR__ . "/../helpers/EmailQueueProcessor.php";

if (file_exists($emailProcessorPath)) {
    require_once $emailProcessorPath;
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Base URL
|--------------------------------------------------------------------------
| Local:
| http://localhost/FoodDeliveryapp
|
| Hosted:
| https://yourdomain.infinityfreeapp.com
|--------------------------------------------------------------------------
*/

function get_base_url() {
    $protocol = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off")
        ? "https"
        : "http";

    $host = $_SERVER["HTTP_HOST"] ?? "localhost";

    if (
        strpos($host, "localhost") !== false ||
        strpos($host, "127.0.0.1") !== false
    ) {
        return $protocol . "://" . $host . "/FoodDeliveryapp";
    }

    return $protocol . "://" . $host;
}

function generate_otp() {
    return (string) random_int(100000, 999999);
}

/*
|--------------------------------------------------------------------------
| Queue Email + Optional Auto Process for Beta
|--------------------------------------------------------------------------
| This inserts email into email_queue. Then, if EmailQueueProcessor.php
| is available, it tries to send a few emails automatically.
| If sending fails, registration/resend flow still continues.
|--------------------------------------------------------------------------
*/

function queue_email($conn, $toEmail, $toName, $subject, $body, $emailType = "email_verification") {
    $sql = "
        INSERT INTO email_queue
        (ticket_id, to_email, to_name, subject, body, email_type, status, attempts, created_at)
        VALUES
        (NULL, ?, ?, ?, ?, ?, 'pending', 0, NOW())
    ";

    $stmt = $conn->prepare($sql);

    if (!$stmt) {
        throw new Exception("Email queue prepare failed: " . $conn->error);
    }

    $stmt->bind_param(
        "sssss",
        $toEmail,
        $toName,
        $subject,
        $body,
        $emailType
    );

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();

        throw new Exception("Email queue insert failed: " . $error);
    }

    $emailId = $stmt->insert_id;
    $stmt->close();

    /*
    |--------------------------------------------------------------------------
    | Beta immediate email send
    |--------------------------------------------------------------------------
    | Manual worker works, so we use the same MailHelper directly here.
    | This sends the just-created queue email immediately.
    |--------------------------------------------------------------------------
    */

    try {
        if (!class_exists("MailHelper")) {
            throw new Exception("MailHelper class not found.");
        }

        $mailResult = MailHelper::sendMail(
            $toEmail,
            $toName ?: $toEmail,
            $subject,
            $body
        );

        if (!empty($mailResult["success"])) {
            $sentStmt = $conn->prepare("
                UPDATE email_queue
                SET 
                    status = 'sent',
                    attempts = attempts + 1,
                    last_error = NULL,
                    sent_at = NOW()
                WHERE id = ?
            ");

            if ($sentStmt) {
                $sentStmt->bind_param("i", $emailId);
                $sentStmt->execute();
                $sentStmt->close();
            }

            return;
        }

        $errorMessage = $mailResult["error"] ?? "Unknown mail error";

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = attempts + 1,
                last_error = ?
            WHERE id = ?
        ");

        if ($failedStmt) {
            $failedStmt->bind_param("si", $errorMessage, $emailId);
            $failedStmt->execute();
            $failedStmt->close();
        }
    } catch (Throwable $e) {
        $errorMessage = $e->getMessage();

        $failedStmt = $conn->prepare("
            UPDATE email_queue
            SET 
                status = 'failed',
                attempts = attempts + 1,
                last_error = ?
            WHERE id = ?
        ");

        if ($failedStmt) {
            $failedStmt->bind_param("si", $errorMessage, $emailId);
            $failedStmt->execute();
            $failedStmt->close();
        }

        // Do not break signup. User can still use resend/manual worker later.
    }
}

/*
|--------------------------------------------------------------------------
| Create Email OTP
|--------------------------------------------------------------------------
*/

function create_email_otp($conn, $userId, $email, $name) {
    $otp = generate_otp();
    $otpHash = password_hash($otp, PASSWORD_DEFAULT);
    $expiresAt = date("Y-m-d H:i:s", strtotime("+10 minutes"));

    /*
    |--------------------------------------------------------------------------
    | Mark old unused OTPs as used
    |--------------------------------------------------------------------------
    */

    $deleteOld = $conn->prepare("
        UPDATE email_verification_otps
        SET used_at = NOW()
        WHERE user_id = ? AND used_at IS NULL
    ");

    if ($deleteOld) {
        $deleteOld->bind_param("i", $userId);
        $deleteOld->execute();
        $deleteOld->close();
    }

    /*
    |--------------------------------------------------------------------------
    | Insert new OTP
    |--------------------------------------------------------------------------
    */

    $stmt = $conn->prepare("
        INSERT INTO email_verification_otps
        (user_id, email, otp_hash, expires_at, attempts, used_at, created_at)
        VALUES
        (?, ?, ?, ?, 0, NULL, NOW())
    ");

    if (!$stmt) {
        throw new Exception("OTP prepare failed: " . $conn->error);
    }

    $stmt->bind_param("isss", $userId, $email, $otpHash, $expiresAt);

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();

        throw new Exception("OTP insert failed: " . $error);
    }

    $stmt->close();

    /*
    |--------------------------------------------------------------------------
    | Email template
    |--------------------------------------------------------------------------
    */

    $safeName = htmlspecialchars($name ?: "there", ENT_QUOTES, "UTF-8");
    $safeOtp = htmlspecialchars($otp, ENT_QUOTES, "UTF-8");

    $subject = "Verify your FoodExpress account";

    $body = "
      <div style='font-family: Arial, sans-serif; background:#f8fafc; padding:24px;'>
        <div style='max-width:600px; margin:0 auto; background:#ffffff; border-radius:18px; padding:28px; border:1px solid #e5e7eb;'>

          <h1 style='color:#ef3535; margin:0 0 14px;'>Verify your email</h1>

          <p style='font-size:16px; color:#111827;'>Hello {$safeName},</p>

          <p style='font-size:15px; color:#4b5563; line-height:1.6;'>
            Welcome to FoodExpress. Please use the verification code below to verify your email address.
          </p>

          <div style='margin:24px 0; padding:18px; background:#fff1f1; border:1px solid #fecaca; border-radius:14px; text-align:center;'>
            <div style='font-size:34px; letter-spacing:8px; font-weight:800; color:#111827;'>{$safeOtp}</div>
          </div>

          <p style='font-size:14px; color:#6b7280;'>
            This code will expire in 10 minutes. If you did not create a FoodExpress account, you can ignore this email.
          </p>

          <p style='font-size:15px; color:#111827; margin-top:24px;'>
            Thanks,<br />
            <strong>FoodExpress Team</strong>
          </p>

        </div>
      </div>
    ";

    queue_email($conn, $email, $name, $subject, $body, "email_verification");
}

$user = new User($conn);

/*
|--------------------------------------------------------------------------
| POST ACTIONS
|--------------------------------------------------------------------------
*/

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $contentType = $_SERVER["CONTENT_TYPE"] ?? "";

    $body = stripos($contentType, "application/json") !== false
        ? get_json_input()
        : $_POST;

    $action = $body["action"] ?? "";

    /*
    |--------------------------------------------------------------------------
    | Login
    |--------------------------------------------------------------------------
    */

    if ($action === "login") {
        error_log("STEP 1");
        $email = trim($body["email"] ?? "");
        $password = $body["password"] ?? "";

        error_log("STEP 2");

        if ($email === "" || $password === "") {
            send_json([
                "success" => false,
                "message" => "Email and password are required"
            ], 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_json([
                "success" => false,
                "message" => "Invalid email or password"
            ], 401);
        }

        $result = $user->login($email, $password);

        if (is_string($result) && in_array($result, ['pending', 'rejected', 'suspended'])) {
    $messages = [
        'pending'   => 'Your account is pending approval. Please wait for admin review.',
        'rejected'  => 'Your account application was rejected. Please contact support.',
        'suspended' => 'Your account has been suspended. Please contact support.',
    ];
    send_json(["success" => false, "message" => $messages[$result]], 403);
}

        error_log("STEP 3");

        if (!$result) {
            // Check if user exists but is not approved
            $userDataCheck = $user->getByEmail($email);
            error_log("STEP 4");
            if ($userDataCheck && in_array($userDataCheck['role'], ['restaurant-owner', 'delivery-rider'])) {
                $approvalStatus = $userDataCheck['approval_status'] ?? 'approved';
                if ($approvalStatus === 'pending') {
                    send_json([
                        "success" => false,
                        "message" => "Your account is pending approval. Please wait for admin review."
                    ], 403);
                } elseif ($approvalStatus === 'rejected') {
                    send_json([
                        "success" => false,
                        "message" => "Your account application was rejected. Please contact support."
                    ], 403);
                } elseif ($approvalStatus === 'suspended') {
                    send_json([
                        "success" => false,
                        "message" => "Your account has been suspended. Please contact support."
                    ], 403);
                }
            }

            send_json([
                "success" => false,
                "message" => "Invalid email or password"
            ], 401);
        }

        $userData = $user->getByEmail($email);
        error_log("STEP 4");

        if (!$userData) {
            send_json([
                "success" => false,
                "message" => "User profile not found after login"
            ], 500);
        }

        $isVerified = !empty($userData["email_verified_at"]);

        $token = JwtHelper::generate([
            'user_id' => intval($userData['id']   ?? 0),
            'email'   => $userData['email']        ?? '',
            'role'    => $userData['role']         ?? 'customer',
            'name'    => $userData['name']         ?? '',
        ]);

        send_json([
            "success"        => true,
            "message"        => "Login successful",
            "email_verified" => $isVerified,
            "token"          => $token,
            "data"           => $userData,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Register
    |--------------------------------------------------------------------------
    */

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

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_json([
                "success" => false,
                "message" => "Please enter a valid email address"
            ], 400);
        }

        if (strlen($password) < 6) {
            send_json([
                "success" => false,
                "message" => "Password must be at least 6 characters"
            ], 400);
        }

        /*
        |--------------------------------------------------------------------------
        | Role normalization
        |--------------------------------------------------------------------------
        */

        $role = strtolower(trim($role));

$roleAliases = [
    "customer" => "customer",

    "owner" => "restaurant-owner",
    "restaurant" => "restaurant-owner",
    "restaurant_owner" => "restaurant-owner",
    "restaurant-owner" => "restaurant-owner",

    "rider" => "delivery-rider",
    "driver" => "delivery-rider",
    "delivery_rider" => "delivery-rider",
    "delivery-rider" => "delivery-rider",
];

$normalizedRole = $roleAliases[$role] ?? "customer";

        $result = $user->register(
            $name,
            $email,
            $password,
            $phone,
            $address,
            $normalizedRole
        );

        if (strpos($result, "Registered successfully") === false) {
            send_json([
                "success" => false,
                "message" => $result
            ], 400);
        }

        $userData = $user->getByEmail($email);

        if (!$userData || empty($userData["id"])) {
            send_json([
                "success" => false,
                "message" => "Account created but user lookup failed"
            ], 500);
        }

        /*
        |--------------------------------------------------------------------------
        | Create OTP and queue/send email
        |--------------------------------------------------------------------------
        */

        try {
            create_email_otp($conn, intval($userData["id"]), $email, $name);
        } catch (Throwable $e) {
            send_json([
                "success" => true,
                "message" => "Account created, but verification email could not be sent automatically. Please use resend OTP.",
                "requires_verification" => true,
                "data" => $userData,
                "email_error" => $e->getMessage()
            ]);
        }

        send_json([
            "success" => true,
            "message" => "Account created successfully. Please verify your email using the OTP we sent.",
            "requires_verification" => true,
            "data" => $userData
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Verify Email OTP
    |--------------------------------------------------------------------------
    */

    if ($action === "verify_email_otp") {
        $email = trim($body["email"] ?? "");
        $otp = trim($body["otp"] ?? "");

        if ($email === "" || $otp === "") {
            send_json([
                "success" => false,
                "message" => "Email and OTP are required"
            ], 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_json([
                "success" => false,
                "message" => "Please enter a valid email address"
            ], 400);
        }

        if (!preg_match("/^[0-9]{6}$/", $otp)) {
            send_json([
                "success" => false,
                "message" => "Please enter a valid 6-digit OTP"
            ], 400);
        }

        $userData = $user->getByEmail($email);

        if (!$userData || empty($userData["id"])) {
            send_json([
                "success" => false,
                "message" => "User not found"
            ], 404);
        }

        if (!empty($userData["email_verified_at"])) {
            send_json([
                "success" => true,
                "message" => "Email is already verified"
            ]);
        }

        $userId = intval($userData["id"]);

        $stmt = $conn->prepare("
            SELECT id, otp_hash, expires_at, attempts
            FROM email_verification_otps
            WHERE user_id = ?
              AND email = ?
              AND used_at IS NULL
            ORDER BY id DESC
            LIMIT 1
        ");

        if (!$stmt) {
            send_json([
                "success" => false,
                "message" => "OTP lookup failed"
            ], 500);
        }

        $stmt->bind_param("is", $userId, $email);
        $stmt->execute();

        $otpResult = $stmt->get_result();
        $otpRow = $otpResult ? $otpResult->fetch_assoc() : null;

        $stmt->close();

        if (!$otpRow) {
            send_json([
                "success" => false,
                "message" => "OTP not found. Please request a new code."
            ], 400);
        }

        if (intval($otpRow["attempts"]) >= 5) {
            send_json([
                "success" => false,
                "message" => "Too many incorrect attempts. Please request a new OTP."
            ], 429);
        }

        if (strtotime($otpRow["expires_at"]) < time()) {
            send_json([
                "success" => false,
                "message" => "OTP has expired. Please request a new code."
            ], 400);
        }

        if (!password_verify($otp, $otpRow["otp_hash"])) {
            $updateAttempts = $conn->prepare("
                UPDATE email_verification_otps
                SET attempts = attempts + 1
                WHERE id = ?
            ");

            if ($updateAttempts) {
                $otpId = intval($otpRow["id"]);
                $updateAttempts->bind_param("i", $otpId);
                $updateAttempts->execute();
                $updateAttempts->close();
            }

            send_json([
                "success" => false,
                "message" => "Incorrect OTP. Please try again."
            ], 400);
        }

        /*
        |--------------------------------------------------------------------------
        | Mark email verified
        |--------------------------------------------------------------------------
        */

        $conn->begin_transaction();

        try {
            $updateUser = $conn->prepare("
                UPDATE users
                SET email_verified_at = NOW(),
                    verification_token = NULL,
                    verification_token_expires_at = NULL
                WHERE id = ?
            ");

            if (!$updateUser) {
                throw new Exception("User verification update prepare failed.");
            }

            $updateUser->bind_param("i", $userId);
            $updateUser->execute();
            $updateUser->close();

            $markUsed = $conn->prepare("
                UPDATE email_verification_otps
                SET used_at = NOW()
                WHERE id = ?
            ");

            if (!$markUsed) {
                throw new Exception("OTP used update prepare failed.");
            }

            $otpId = intval($otpRow["id"]);
            $markUsed->bind_param("i", $otpId);
            $markUsed->execute();
            $markUsed->close();

            $conn->commit();

            send_json([
                "success" => true,
                "message" => "Email verified successfully. You can now sign in."
            ]);
        } catch (Throwable $e) {
            $conn->rollback();

            send_json([
                "success" => false,
                "message" => "Verification failed: " . $e->getMessage()
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Resend Email OTP
    |--------------------------------------------------------------------------
    */

    if ($action === "resend_email_otp") {
        $email = trim($body["email"] ?? "");

        if ($email === "") {
            send_json([
                "success" => false,
                "message" => "Email is required"
            ], 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_json([
                "success" => false,
                "message" => "Please enter a valid email address"
            ], 400);
        }

        $userData = $user->getByEmail($email);

        if (!$userData || empty($userData["id"])) {
            send_json([
                "success" => false,
                "message" => "User not found"
            ], 404);
        }

        if (!empty($userData["email_verified_at"])) {
            send_json([
                "success" => true,
                "message" => "Email is already verified"
            ]);
        }

        try {
            create_email_otp(
                $conn,
                intval($userData["id"]),
                $email,
                $userData["name"] ?? "Customer"
            );

            send_json([
                "success" => true,
                "message" => "A new OTP has been sent to your email."
            ]);
        } catch (Throwable $e) {
            send_json([
                "success" => false,
                "message" => "Could not resend OTP: " . $e->getMessage()
            ], 500);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Logout
    |--------------------------------------------------------------------------
    */

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

/*
|--------------------------------------------------------------------------
| GET ACTIONS
|--------------------------------------------------------------------------
*/

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $action = $_GET["action"] ?? "";

    /*
    |--------------------------------------------------------------------------
    | Profile by email
    |--------------------------------------------------------------------------
    */

    if ($action === "profile" && isset($_GET["email"])) {
        $email = trim($_GET["email"]);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_json([
                "success" => false,
                "message" => "Please provide a valid email"
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

    /*
    |--------------------------------------------------------------------------
    | Current profile lookup
    |--------------------------------------------------------------------------
    */

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

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_json([
                "success" => false,
                "message" => "Please provide a valid email"
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
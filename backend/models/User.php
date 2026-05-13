<?php
class User {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    // REGISTER FUNCTION
    public function register($name, $email, $password, $phone, $address, $role = 'customer') {
        $email = trim($email);
        $name = trim($name);
        $phone = trim($phone);
        $address = trim($address);
        $role = trim($role ?: 'customer');

        // Check if email exists
        $checkSql = "SELECT id FROM users WHERE email = ? LIMIT 1";
        $stmt = $this->conn->prepare($checkSql);

        if (!$stmt) {
            return "Prepare failed: " . $this->conn->error;
        }

        $stmt->bind_param("s", $email);
        $stmt->execute();

        $result = $stmt->get_result();

        if ($result && $result->num_rows > 0) {
            $stmt->close();
            return "Email already exists";
        }

        $stmt->close();

        // Hash password
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        $sql = "
            INSERT INTO users 
            (name, email, password, phone, address, role, email_verified_at, verification_token, verification_token_expires_at)
            VALUES 
            (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
        ";

        $stmt = $this->conn->prepare($sql);

        if (!$stmt) {
            return "Prepare failed: " . $this->conn->error;
        }

        $stmt->bind_param(
            "ssssss",
            $name,
            $email,
            $hashedPassword,
            $phone,
            $address,
            $role
        );

        if ($stmt->execute()) {
            $stmt->close();
            return "Registered successfully";
        }

        $error = "Error: " . $stmt->error;
        $stmt->close();

        return $error;
    }

    // LOGIN FUNCTION
    public function login($email, $password) {
        $email = trim($email);

        $sql = "
            SELECT 
                id,
                name,
                email,
                password,
                email_verified_at,
                phone,
                address,
                role,
                created_at,
                status
            FROM users
            WHERE email = ?
            LIMIT 1
        ";

        $stmt = $this->conn->prepare($sql);

        if (!$stmt) {
            return false;
        }

        $stmt->bind_param("s", $email);
        $stmt->execute();

        $result = $stmt->get_result();
        $user = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        if (!$user) {
            return false;
        }

        if (($user["status"] ?? "active") === "blocked") {
            return false;
        }

        return password_verify($password, $user["password"]);
    }

    // GET USER BY EMAIL
    public function getByEmail($email) {
        $email = trim($email);

        $sql = "
            SELECT 
                id,
                name,
                email,
                email_verified_at,
                phone,
                address,
                role,
                created_at,
                status
            FROM users
            WHERE email = ?
            LIMIT 1
        ";

        $stmt = $this->conn->prepare($sql);

        if (!$stmt) {
            return null;
        }

        $stmt->bind_param("s", $email);
        $stmt->execute();

        $result = $stmt->get_result();
        $user = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        return $user ?: null;
    }

    // GET USER BY ID
    public function getById($id) {
        $id = intval($id);

        $sql = "
            SELECT 
                id,
                name,
                email,
                email_verified_at,
                phone,
                address,
                role,
                created_at,
                status
            FROM users
            WHERE id = ?
            LIMIT 1
        ";

        $stmt = $this->conn->prepare($sql);

        if (!$stmt) {
            return null;
        }

        $stmt->bind_param("i", $id);
        $stmt->execute();

        $result = $stmt->get_result();
        $user = $result ? $result->fetch_assoc() : null;

        $stmt->close();

        return $user ?: null;
    }

    // CHECK IF USER EMAIL IS VERIFIED
    public function isEmailVerified($email) {
        $user = $this->getByEmail($email);

        if (!$user) {
            return false;
        }

        return !empty($user["email_verified_at"]);
    }
}
?>
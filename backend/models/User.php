<?php
class User {
    private $conn;

    //correct constructor
    public function __construct($db){
        $this->conn = $db;
    }

    //REGISTER FUNCTION
    public function register($name, $email, $password, $phone, $address, $role = 'customer'){

        //check if email exists
        $checkSql = "SELECT id FROM users WHERE email = ?";
        $stmt = $this->conn->prepare($checkSql);
        $stmt->bind_param("s", $email);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            return "Email already exists";
        }

        //hash password
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        $sql = "INSERT INTO users (name, email, password, phone, address, role)
                VALUES (?, ?, ?, ?, ?, ?)";

        $stmt = $this->conn->prepare($sql);

        if (!$stmt) {
            return "Prepare failed: " . $this->conn->error;
        }

        $stmt->bind_param("ssssss", $name, $email, $hashedPassword, $phone, $address, $role);

        if ($stmt->execute()) {
            return "Registered successfully";
        } else {
            return "Error: " . $stmt->error;
        }
    }

    //LOGIN FUNCTION
    public function login($email, $password){

        $sql = "SELECT * FROM users WHERE email = ? LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->bind_param("s", $email);
        $stmt->execute();

        $result = $stmt->get_result();
        $user = $result->fetch_assoc();

        if ($user && password_verify($password, $user['password'])) {
            return true;
        }

        return false;
    }

    public function getByEmail($email) {
        $sql = "SELECT id, name, email, phone, address, role, created_at FROM users WHERE email = ? LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->bind_param("s", $email);
        $stmt->execute();
        $result = $stmt->get_result();
        return $result->fetch_assoc();
    }
}
?>
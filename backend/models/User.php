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

        // Determine approval status based on role
        $approvalStatus = 'approved'; // Default for customers
        if (in_array($role, ['restaurant-owner', 'delivery-rider'])) {
            $approvalStatus = 'pending';
        }

        // Hash password
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        $sql = "
            INSERT INTO users 
            (name, email, password, phone, address, role, approval_status, email_verified_at, verification_token, verification_token_expires_at)
            VALUES 
            (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
        ";

        $stmt = $this->conn->prepare($sql);

        if (!$stmt) {
            return "Prepare failed: " . $this->conn->error;
        }

        $stmt->bind_param(
            "sssssss",
            $name,
            $email,
            $hashedPassword,
            $phone,
            $address,
            $role,
            $approvalStatus
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
        status,
        approval_status
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

        // Check approval status for restaurant owners and riders
        if (in_array($user["role"], ['restaurant-owner', 'delivery-rider'])) {
    $approvalStatus = $user["approval_status"] ?? "approved";
    if ($approvalStatus !== "approved") {
        return $approvalStatus; // Return status string instead of false
    }
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
                status,
                approval_status
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
        status,
        approval_status
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

    // UPDATE APPROVAL STATUS
    public function updateApprovalStatus($userId, $approvalStatus, $adminId = null, $reason = null, $notes = null) {
        // Validate approval status
        $validStatuses = ['pending', 'approved', 'rejected', 'suspended'];
        if (!in_array($approvalStatus, $validStatuses)) {
            return "Invalid approval status";
        }

        // Get current status for audit
        $currentUser = $this->getById($userId);
        if (!$currentUser) {
            return "User not found";
        }

        $previousStatus = $currentUser['approval_status'];

        // Update user
        $sql = "
            UPDATE users 
            SET 
                approval_status = ?,
                approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
                approved_by_admin_id = CASE WHEN ? = 'approved' THEN ? ELSE approved_by_admin_id END,
                rejection_reason = CASE WHEN ? IN ('rejected', 'suspended') THEN ? ELSE rejection_reason END,
                admin_notes = ?,
                approval_updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ";

        $stmt = $this->conn->prepare($sql);
        if (!$stmt) {
            return "Prepare failed: " . $this->conn->error;
        }

        $stmt->bind_param(
            "sssssssi",
            $approvalStatus,
            $approvalStatus,
            $approvalStatus,
            $adminId,
            $approvalStatus,
            $reason,
            $notes,
            $userId
        );

        if (!$stmt->execute()) {
            $stmt->close();
            return "Update failed: " . $stmt->error;
        }

        $stmt->close();

        // Log to audit table
        $this->logApprovalAction('user', $userId, $approvalStatus, $adminId, $previousStatus, $reason, $notes);

        return "Approval status updated successfully";
    }

    // LOG APPROVAL ACTION
    private function logApprovalAction($entityType, $entityId, $action, $adminId, $previousStatus, $reason, $notes) {
        $sql = "
            INSERT INTO approval_audit_log 
            (entity_type, entity_id, action, admin_id, previous_status, new_status, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ";

        $stmt = $this->conn->prepare($sql);
        if ($stmt) {
            $stmt->bind_param(
                "sisissss",
                $entityType,
                $entityId,
                $action,
                $adminId,
                $previousStatus,
                $action, // new_status is the action
                $reason,
                $notes
            );
            $stmt->execute();
            $stmt->close();
        }
    }
}
?>
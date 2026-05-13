<?php

class Coupon {
    private $conn;
    private $table = 'coupons';
    private $redemptionsTable = 'coupon_redemptions';

    public function __construct($db) {
        $this->conn = $db;
    }

    public function getByCode($code) {
        $code = strtoupper(trim((string)$code));
        if ($code === '') return null;

        $sql = "SELECT
                    id,
                    code,
                    discount_type,
                    discount_value,
                    min_order_amount,
                    max_discount_amount,
                    expires_at,
                    usage_limit,
                    per_user_limit,
                    is_active
                FROM " . $this->table . "
                WHERE UPPER(code) = UPPER(?)
                LIMIT 1";

        $stmt = $this->conn->prepare($sql);
        if (!$stmt) return null;

        $stmt->bind_param("s", $code);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $stmt->close();

        return $row ?: null;
    }

    public function getTotalRedemptionsCount($couponId) {
        $couponId = intval($couponId);
        if ($couponId <= 0) return 0;

        $sql = "SELECT COUNT(*) AS total
                FROM " . $this->redemptionsTable . "
                WHERE coupon_id = ?";

        $stmt = $this->conn->prepare($sql);
        if (!$stmt) return 0;

        $stmt->bind_param("i", $couponId);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $stmt->close();

        return intval($row['total'] ?? 0);
    }

    public function getUserRedemptionsCount($couponId, $userId, $customerEmail) {
        $couponId = intval($couponId);
        $userId = ($userId === null || $userId === '') ? null : intval($userId);
        $customerEmail = trim((string)($customerEmail ?? ""));

        if ($couponId <= 0) return 0;

        // If neither user_id nor email is available, we can't enforce per-user limits reliably.
        if (($userId === null || $userId <= 0) && $customerEmail === '') return 0;

        $conditions = [];
        $types = "i";
        $params = [$couponId];

        if ($userId !== null && $userId > 0) {
            $conditions[] = "user_id = ?";
            $types .= "i";
            $params[] = $userId;
        }

        if ($customerEmail !== '') {
            $conditions[] = "LOWER(customer_email) = LOWER(?)";
            $types .= "s";
            $params[] = $customerEmail;
        }

        $where = implode(" OR ", $conditions);
        $sql = "SELECT COUNT(*) AS total
                FROM " . $this->redemptionsTable . "
                WHERE coupon_id = ?
                AND (" . $where . ")";

        $stmt = $this->conn->prepare($sql);
        if (!$stmt) return 0;

        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $stmt->close();

        return intval($row['total'] ?? 0);
    }

    public function isExpired($coupon) {
        $expiresAt = $coupon['expires_at'] ?? null;
        if (!$expiresAt) return false;

        $expiresAt = trim((string)$expiresAt);
        if ($expiresAt === '') return false;

        $timestamp = strtotime($expiresAt);
        if ($timestamp === false) {
            // If DB contains an invalid datetime, treat as non-expiring to avoid hard-failing checkout.
            return false;
        }

        return $timestamp < time();
    }

    public function calculateDiscountAmount($coupon, $subtotal) {
        $subtotal = floatval($subtotal);
        $subtotal = round(max(0, $subtotal), 2);

        $discountType = strtolower(trim((string)($coupon['discount_type'] ?? '')));
        $discountValue = floatval($coupon['discount_value'] ?? 0);

        $discountAmount = 0.00;

        if ($discountType === 'percent') {
            $discountAmount = $subtotal * $discountValue / 100;
        } elseif ($discountType === 'fixed') {
            $discountAmount = $discountValue;
        }

        $maxDiscount = $coupon['max_discount_amount'] ?? null;
        if ($maxDiscount !== null && $maxDiscount !== '') {
            $cap = floatval($maxDiscount);
            if ($cap >= 0) {
                $discountAmount = min($discountAmount, $cap);
            }
        }

        $discountAmount = min($discountAmount, $subtotal);
        $discountAmount = round(max(0, $discountAmount), 2);

        return $discountAmount;
    }

    public function validateForSubtotal($code, $subtotal, $userId = null, $customerEmail = '') {
        $code = strtoupper(trim((string)$code));
        $subtotal = floatval($subtotal);

        if ($code === '') {
            return ["success" => false, "message" => "Coupon code is required."];
        }

        if (!is_numeric($subtotal) || $subtotal <= 0) {
            return ["success" => false, "message" => "Subtotal must be numeric and greater than 0."];
        }

        $coupon = $this->getByCode($code);
        if (!$coupon) {
            return ["success" => false, "message" => "Invalid coupon code."];
        }

        if (intval($coupon['is_active'] ?? 0) !== 1) {
            return ["success" => false, "message" => "This coupon is not active."];
        }

        if ($this->isExpired($coupon)) {
            return ["success" => false, "message" => "This coupon has expired."];
        }

        $minOrder = floatval($coupon['min_order_amount'] ?? 0);
        if ($subtotal < $minOrder) {
            return [
                "success" => false,
                "message" => "Subtotal does not meet the minimum order amount for this coupon."
            ];
        }

        $usageLimit = $coupon['usage_limit'] ?? null;
        if ($usageLimit !== null && $usageLimit !== '') {
            $usageLimit = intval($usageLimit);
            if ($usageLimit > 0) {
                $totalUsed = $this->getTotalRedemptionsCount($coupon['id']);
                if ($totalUsed >= $usageLimit) {
                    return ["success" => false, "message" => "This coupon usage limit has been reached."];
                }
            }
        }

        $perUserLimit = $coupon['per_user_limit'] ?? null;
        if ($perUserLimit !== null && $perUserLimit !== '') {
            $perUserLimit = intval($perUserLimit);
            if ($perUserLimit > 0) {
                $usedByUser = $this->getUserRedemptionsCount($coupon['id'], $userId, $customerEmail);
                if ($usedByUser >= $perUserLimit) {
                    return [
                        "success" => false,
                        "message" => "You have already used this coupon the maximum number of times."
                    ];
                }
            }
        }

        $discountAmount = $this->calculateDiscountAmount($coupon, $subtotal);

        return [
            "success" => true,
            "coupon" => $coupon,
            "discount_amount" => $discountAmount
        ];
    }

    public function createRedemption($couponId, $orderId, $userId = null, $customerEmail = null, $discountAmount = 0.00) {
        $couponId = intval($couponId);
        $orderId = intval($orderId);
        $userId = ($userId === null || $userId === '') ? null : intval($userId);
        $customerEmail = $customerEmail !== null ? trim((string)$customerEmail) : null;
        $discountAmount = round(max(0, floatval($discountAmount)), 2);

        if ($couponId <= 0 || $orderId <= 0) {
            return false;
        }

        $sql = "INSERT INTO " . $this->redemptionsTable . "
                    (coupon_id, order_id, user_id, customer_email, discount_amount)
                VALUES (?, ?, ?, ?, ?)";

        $stmt = $this->conn->prepare($sql);
        if (!$stmt) return false;

        // i i i s d
        $stmt->bind_param("iiisd", $couponId, $orderId, $userId, $customerEmail, $discountAmount);
        $ok = $stmt->execute();
        $stmt->close();

        return $ok;
    }
}

?>


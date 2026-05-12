<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/../config/db.php";

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection not available."
    ]);
    exit;
}

$action = $_GET["action"] ?? "";

if ($action === "approved") {
    $sql = "
    SELECT
        id,
        restaurant_name,
        description,
        cuisine_type,
        location,
        city,
        phone,
        email,
        opening_time,
        closing_time,
        delivery_available,
        is_open,
        accepting_orders,
        busy_mode,
        estimated_prep_minutes,
        logo_url,
        cover_image_url,
        status,

        COALESCE(pickup_available, 1) AS pickup_available,
        COALESCE(auto_pause_overload, 0) AS auto_pause_overload,
        COALESCE(avg_handoff_minutes, 5) AS avg_handoff_minutes,
        COALESCE(delivery_radius_km, 5.00) AS delivery_radius_km,
        COALESCE(min_order_amount, 0.00) AS min_order_amount,
        COALESCE(packaging_fee, 0.00) AS packaging_fee,
        COALESCE(show_on_shop, 1) AS show_on_shop,
        COALESCE(show_busy_banner, 1) AS show_busy_banner,
        COALESCE(preorder_allowed, 0) AS preorder_allowed,
        COALESCE(out_of_stock_policy, 'hide') AS out_of_stock_policy
    FROM restaurants
    WHERE status = 'approved'
      AND COALESCE(show_on_shop, 1) = 1
    ORDER BY restaurant_name ASC
";

    $result = $conn->query($sql);

    if (!$result) {
        echo json_encode([
            "success" => false,
            "message" => "Failed to fetch restaurants."
        ]);
        exit;
    }

    $restaurants = [];

    while ($row = $result->fetch_assoc()) {
        $restaurants[] = $row;
    }

    echo json_encode([
        "success" => true,
        "data" => $restaurants
    ]);
    exit;
}

/*
|--------------------------------------------------------------------------
| by_owner — return the restaurant owned by a given user_id, REGARDLESS
| of approval status. Used by the restaurant-owner login flow so we can
| show the right "pending review / rejected / approved" message.
|
| Owner login is the gate (AuthController?action=login + role check),
| so this endpoint is safe to expose: it returns minimal restaurant
| info for ONE user_id and never reveals other restaurants' data.
|--------------------------------------------------------------------------
*/

if ($action === "by_owner") {
    $userId = isset($_GET["user_id"]) ? intval($_GET["user_id"]) : 0;

    if ($userId <= 0) {
        echo json_encode([
            "success" => false,
            "message" => "Valid user_id is required."
        ]);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT
            id,
            owner_user_id,
            restaurant_name,
            description,
            cuisine_type,
            location,
            city,
            phone,
            email,
            opening_time,
            closing_time,
            delivery_available,
            is_open,
            accepting_orders,
            busy_mode,
            estimated_prep_minutes,
            logo_url,
            cover_image_url,
            status,
            created_at,
            updated_at
        FROM restaurants
        WHERE owner_user_id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        echo json_encode([
            "success" => false,
            "message" => "Failed to prepare by_owner query: " . $conn->error
        ]);
        exit;
    }

    $stmt->bind_param("i", $userId);
    $stmt->execute();

    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        echo json_encode([
            "success" => false,
            "message" => "No restaurant is registered for this owner.",
            "code" => "no_restaurant"
        ]);
        exit;
    }

    echo json_encode([
        "success" => true,
        "data" => $row
    ]);
    exit;
}

/* ════════════════════════════════════════════════════════
 * recommend
 * GET {budget: low|medium|high|any, cuisine: nepali|chinese|fastfood|any}
 * time_of_day is derived from server clock automatically.
 * Returns up to 5 recommended menu items.
 * ════════════════════════════════════════════════════════ */
if ($action === "recommend") {
    $hour = (int) date("G");

    if ($hour >= 6 && $hour < 11)       $timeSlot = "morning";
    elseif ($hour >= 11 && $hour < 15)  $timeSlot = "afternoon";
    elseif ($hour >= 15 && $hour < 19)  $timeSlot = "evening";
    elseif ($hour >= 19 && $hour < 23)  $timeSlot = "night";
    else                                $timeSlot = "night";

    $budget  = trim($_GET["budget"]  ?? "any");
    $cuisine = trim($_GET["cuisine"] ?? "any");

    if (!in_array($budget,  ["low","medium","high","any"], true)) $budget  = "any";
    if (!in_array($cuisine, ["nepali","chinese","fastfood","any"], true)) $cuisine = "any";

    $timeKeywords = [
        "morning"   => ["tea","coffee","breakfast","bread","toast","egg","juice"],
        "afternoon" => ["rice","thali","dal","lunch","chicken","curry","set"],
        "evening"   => ["momo","snack","burger","sandwich","fast","chow","pizza","roll"],
        "night"     => ["noodle","soup","chowmein","light","dumpling","ramen","pho"],
    ];

    function buildBudgetCond(string $budget): string {
        if ($budget === "low")    return "p.price < 300";
        if ($budget === "medium") return "p.price BETWEEN 300 AND 700";
        if ($budget === "high")   return "p.price > 700";
        return "";
    }

    function buildCuisineCond(string $cuisine): string {
        if ($cuisine === "nepali")
            return "(r.cuisine_type LIKE '%nepali%' OR p.category LIKE '%nepali%'"
                 . " OR p.name LIKE '%momo%' OR p.name LIKE '%thali%' OR p.name LIKE '%dal%')";
        if ($cuisine === "chinese")
            return "(r.cuisine_type LIKE '%chinese%' OR p.category LIKE '%chinese%'"
                 . " OR p.name LIKE '%noodle%' OR p.name LIKE '%chow%' OR p.name LIKE '%fried rice%')";
        if ($cuisine === "fastfood")
            return "(r.cuisine_type LIKE '%fast%' OR p.category LIKE '%fast%'"
                 . " OR p.name LIKE '%burger%' OR p.name LIKE '%pizza%'"
                 . " OR p.name LIKE '%sandwich%' OR p.name LIKE '%wrap%')";
        return "";
    }

    function buildTimeKeywordCond(array $kws, mysqli $conn): string {
        if (empty($kws)) return "";
        $parts = [];
        foreach ($kws as $kw) {
            $e = $conn->real_escape_string($kw);
            $parts[] = "p.name LIKE '%{$e}%'";
            $parts[] = "p.category LIKE '%{$e}%'";
        }
        return "(" . implode(" OR ", $parts) . ")";
    }

    function runRecommendQuery(mysqli $conn, array $extraConds): array {
        $base = ["p.is_available = 1", "r.status = 'approved'"];
        $conds = array_merge($base, array_filter($extraConds));
        $where = implode(" AND ", $conds);

        $sql = "SELECT p.id, p.name, p.price, p.image_url, p.category,
                       p.restaurant_id, r.restaurant_name
                FROM products p
                JOIN restaurants r ON r.id = p.restaurant_id
                WHERE {$where}
                ORDER BY p.is_popular DESC, RAND()
                LIMIT 5";

        $result = $conn->query($sql);
        $rows = [];
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $rows[] = [
                    "id"              => intval($row["id"]),
                    "name"            => $row["name"],
                    "price"           => floatval($row["price"]),
                    "image_url"       => $row["image_url"] ?? "",
                    "category"        => $row["category"] ?? "",
                    "restaurant_id"   => intval($row["restaurant_id"]),
                    "restaurant_name" => $row["restaurant_name"] ?? "",
                ];
            }
        }
        return $rows;
    }

    $budgetCond  = buildBudgetCond($budget);
    $cuisineCond = buildCuisineCond($cuisine);
    $timeCond    = buildTimeKeywordCond($timeKeywords[$timeSlot] ?? [], $conn);

    // Tier 1: all filters
    $items = runRecommendQuery($conn, [$budgetCond, $cuisineCond, $timeCond]);

    // Tier 2: drop time filter
    if (empty($items)) {
        $items = runRecommendQuery($conn, [$budgetCond, $cuisineCond]);
    }

    // Tier 3: only budget
    if (empty($items)) {
        $items = runRecommendQuery($conn, [$budgetCond]);
    }

    echo json_encode([
        "success"   => true,
        "time_slot" => $timeSlot,
        "data"      => $items,
    ]);
    exit;
}

echo json_encode([
    "success" => false,
    "message" => "Invalid action."
]);
?>
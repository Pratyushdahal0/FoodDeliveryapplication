<?php
/**
 * FoodExpress — JWT Auth Middleware
 *
 * requireAuth()  — hard: exits 401 if token missing/invalid
 * checkAuth()    — soft: returns payload or null, logs warning (never exits)
 * requireRole()  — hard: exits 403 if role doesn't match
 */

require_once __DIR__ . '/../helpers/JwtHelper.php';

function jwtExtractToken(): string
{
    // Apache sets HTTP_AUTHORIZATION; CGI/FastCGI may use REDIRECT_ prefix
    $h = $_SERVER['HTTP_AUTHORIZATION']
      ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
      ?? '';

    // Fallback via getallheaders() (available when PHP runs as Apache module)
    if ($h === '' && function_exists('getallheaders')) {
        $all = getallheaders();
        $h   = $all['Authorization'] ?? $all['authorization'] ?? '';
    }

    if (preg_match('/^Bearer\s+(.+)$/i', trim($h), $m)) {
        return trim($m[1]);
    }
    return '';
}

/**
 * Hard auth guard.
 * Sends 401 JSON and exits if the Bearer token is missing or invalid.
 * Returns the decoded JWT payload array on success.
 *
 * @param  mysqli|null $conn  Unused (reserved for future revocation checks)
 */
function requireAuth(?mysqli $conn = null): array
{
    $token = jwtExtractToken();

    if ($token === '') {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Authentication required.',
            'code'    => 'no_token',
        ]);
        exit;
    }

    $payload = JwtHelper::verify($token);

    if ($payload === null) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid or expired token.',
            'code'    => 'invalid_token',
        ]);
        exit;
    }

    return $payload;
}

/**
 * Soft auth check.
 * Returns the decoded JWT payload, or null if token is absent/invalid.
 * Logs a warning but never sends a response or exits.
 * Use this while transitioning endpoints to full JWT enforcement.
 *
 * @param  mysqli|null $conn  Unused (reserved for future revocation checks)
 */
function checkAuth(?mysqli $conn = null): ?array
{
    $token = jwtExtractToken();

    if ($token === '') {
        error_log('[AuthMiddleware] Unauthenticated request: ' . ($_SERVER['REQUEST_URI'] ?? 'unknown'));
        return null;
    }

    $payload = JwtHelper::verify($token);

    if ($payload === null) {
        error_log('[AuthMiddleware] Invalid/expired token on: ' . ($_SERVER['REQUEST_URI'] ?? 'unknown'));
        return null;
    }

    return $payload;
}

/**
 * Hard role guard.
 * Calls requireAuth() first, then validates the role claim.
 * Sends 403 JSON and exits if role doesn't match.
 *
 * @param  string      $role  Expected role value (e.g. 'customer', 'rider')
 * @param  mysqli|null $conn  Passed through to requireAuth()
 */
function requireRole(string $role, ?mysqli $conn = null): array
{
    $payload = requireAuth($conn);

    if (($payload['role'] ?? '') !== $role) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'Insufficient permissions.',
            'code'    => 'forbidden',
        ]);
        exit;
    }

    return $payload;
}

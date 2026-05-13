<?php
/**
 * FoodExpress — JWT Helper (HS256, no external library)
 */
class JwtHelper
{
    private static function secret(): string
    {
        $env = getenv('JWT_SECRET');
        return ($env !== false && $env !== '') ? $env : 'foodexpress_jwt_s3cr3t_kathmandu_2026';
    }

    private static function b64Encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64Decode(string $data): string
    {
        $padded = str_pad(strtr($data, '-_', '+/'), strlen($data) + (4 - strlen($data) % 4) % 4, '=');
        return base64_decode($padded);
    }

    public static function generate(array $payload): string
    {
        $header  = self::b64Encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload['iat'] = time();
        $payload['exp'] = time() + 86400; // 24 hours
        $body    = self::b64Encode(json_encode($payload));
        $sig     = self::b64Encode(hash_hmac('sha256', "{$header}.{$body}", self::secret(), true));
        return "{$header}.{$body}.{$sig}";
    }

    /**
     * Returns the decoded payload array, or null if invalid/expired.
     */
    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $body, $sig] = $parts;

        $expected = self::b64Encode(hash_hmac('sha256', "{$header}.{$body}", self::secret(), true));
        if (!hash_equals($expected, $sig)) return null;

        $payload = json_decode(self::b64Decode($body), true);
        if (!is_array($payload)) return null;

        if (isset($payload['exp']) && $payload['exp'] < time()) return null;

        return $payload;
    }
}

/**
 * Plain-Postgres mode is active when DATABASE_URL is set.
 * Production keeps using hosted Supabase until cutover.
 */
export function isPlainPostgres(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function authJwtSecret(): string {
  const secret =
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET;
  if (secret) return secret;
  // A known fallback secret would let anyone mint admin tokens.
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_JWT_SECRET must be set in production");
  }
  return "dev-auth-secret-change-me";
}

/** Cookie the admin middleware reads. supabase-js only stores the session in localStorage. */
const ACCESS_COOKIE = "sb-access-token";

export function persistAccessCookie(accessToken: string, expiresIn?: number) {
  if (typeof document === "undefined" || !accessToken) return;
  const maxAge = expiresIn && expiresIn > 0 ? Math.floor(expiresIn) : 60 * 60 * 24 * 7;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCESS_COOKIE}=${accessToken}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearAccessCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${ACCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = "admin_session=; Path=/; Max-Age=0; SameSite=Lax";
}

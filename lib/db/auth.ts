// GoTrue-compatible auth against plain Postgres auth.users (bcrypt hashes).

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, randomUUID } from "crypto";
import { query } from "./pool";
import { authJwtSecret } from "./mode";

const ACCESS_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export interface AuthUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  phone: string;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: AuthUser;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(authJwtSecret());
}

function rowToUser(row: Record<string, any>, appRole?: string | null): AuthUser {
  const meta =
    typeof row.raw_user_meta_data === "string"
      ? JSON.parse(row.raw_user_meta_data || "{}")
      : row.raw_user_meta_data || {};
  const appMeta =
    typeof row.raw_app_meta_data === "string"
      ? JSON.parse(row.raw_app_meta_data || "{}")
      : row.raw_app_meta_data || {};
  if (appRole) {
    appMeta.role = appRole;
  }
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email || "",
    phone: row.phone || "",
    email_confirmed_at: row.email_confirmed_at || null,
    phone_confirmed_at: row.phone_confirmed_at || null,
    confirmed_at: row.email_confirmed_at || row.phone_confirmed_at || null,
    last_sign_in_at: row.last_sign_in_at || null,
    app_metadata: appMeta,
    user_metadata: meta,
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

async function loadAppRole(userId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ role: string }>(
      `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0]?.role ?? null;
  } catch {
    return null;
  }
}

// ---- session revocation ----------------------------------------------------
// Every token carries the account's token version (`tv`). Changing the
// password, resetting it or signing out bumps the version, which kills every
// token issued before. Stored in raw_app_meta_data so no schema change is needed.

const TV_CACHE_MS = 10_000;
const tvCache = new Map<string, { tv: number; at: number }>();

async function currentTokenVersion(userId: string): Promise<number | null> {
  const hit = tvCache.get(userId);
  if (hit && Date.now() - hit.at < TV_CACHE_MS) return hit.tv;
  const { rows } = await query<{ tv: string | null }>(
    `SELECT raw_app_meta_data->>'tv' AS tv FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const tv = Number(rows[0].tv) || 0;
  tvCache.set(userId, { tv, at: Date.now() });
  return tv;
}

export async function revokeSessions(userId: string): Promise<void> {
  await query(
    `UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('tv', COALESCE((raw_app_meta_data->>'tv')::int, 0) + 1),
         updated_at = now()
     WHERE id = $1`,
    [userId]
  );
  tvCache.delete(userId);
}

async function mintSession(userRow: Record<string, any>): Promise<SessionTokens> {
  const appRole = await loadAppRole(userRow.id);
  const tv = (await currentTokenVersion(userRow.id)) ?? 0;
  const user = rowToUser(userRow, appRole);
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();

  const access_token = await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    phone: user.phone,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    session_id: sessionId,
    tv,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(secretKey());

  const refresh_token = await new SignJWT({
    typ: "refresh",
    session_id: sessionId,
    tv,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TTL_SEC)
    .sign(secretKey());

  return {
    access_token,
    refresh_token,
    expires_in: ACCESS_TTL_SEC,
    expires_at: now + ACCESS_TTL_SEC,
    token_type: "bearer",
    user,
  };
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; payload: Record<string, any> } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ === "refresh") return null;
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    const tv = await currentTokenVersion(userId);
    if (tv === null || (Number(payload.tv) || 0) !== tv) return null;
    return { userId, payload: payload as Record<string, any> };
  } catch {
    return null;
  }
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { rows } = await query(
    `SELECT id, email, phone, encrypted_password, email_confirmed_at,
            phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
            raw_user_meta_data, created_at, updated_at
     FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const appRole = await loadAppRole(userId);
  return rowToUser(rows[0], appRole);
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  const normalized = email.trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, email, phone, encrypted_password, email_confirmed_at,
            phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
            raw_user_meta_data, created_at, updated_at
     FROM auth.users
     WHERE lower(email) = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [normalized]
  );
  const row = rows[0];
  if (!row?.encrypted_password) {
    return { session: null, error: "Invalid login credentials" };
  }
  const ok = bcrypt.compareSync(password, row.encrypted_password);
  if (!ok) {
    return { session: null, error: "Invalid login credentials" };
  }

  await query(
    `UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = $1`,
    [row.id]
  ).catch(() => {});

  const session = await mintSession(row);
  return { session, error: null };
}

export async function signUpWithPassword(opts: {
  email: string;
  password: string;
  data?: Record<string, unknown>;
}): Promise<{ session: SessionTokens | null; user: AuthUser | null; error: string | null }> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !opts.password || opts.password.length < 6) {
    return { session: null, user: null, error: "Email and password (min 6 chars) required" };
  }

  const existing = await query(`SELECT id FROM auth.users WHERE lower(email) = $1 LIMIT 1`, [
    email,
  ]);
  if (existing.rows[0]) {
    return { session: null, user: null, error: "User already registered" };
  }

  const id = randomUUID();
  const hash = bcrypt.hashSync(opts.password, 10);
  // Only plain profile fields are accepted from the signup form.
  const rawMeta = (opts.data || {}) as Record<string, unknown>;
  const meta: Record<string, unknown> = {};
  for (const k of ["full_name", "first_name", "last_name", "phone", "newsletter"]) {
    const v = rawMeta[k];
    if (typeof v === "string") meta[k] = v.slice(0, 120);
    else if (typeof v === "boolean") meta[k] = v;
  }

  await query(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, confirmation_token, recovery_token,
       email_change_token_new, email_change
     ) VALUES (
       $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, $3, now(), '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb,
       now(), now(), '', '', '', ''
     )`,
    [id, email, hash, JSON.stringify(meta)]
  );

  // Ensure profile row exists (app expects profiles.id = auth.users.id)
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    [meta.first_name, meta.last_name].filter((v) => typeof v === "string" && v.trim()).join(" ").trim() ||
    email.split("@")[0];
  const phone = typeof meta.phone === "string" && meta.phone.trim() ? meta.phone.trim().slice(0, 30) : null;

  // Ensure the profile exists and carries the name/phone from the form. The
  // role is always 'customer' here, whatever the signup body says.
  await query(
    `INSERT INTO profiles (id, email, full_name, phone, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'customer', now(), now())
     ON CONFLICT (id) DO UPDATE SET
       full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
       phone = COALESCE(profiles.phone, EXCLUDED.phone)`,
    [id, email, fullName.slice(0, 120), phone]
  ).catch(() => {});

  const { rows } = await query(`SELECT * FROM auth.users WHERE id = $1`, [id]);
  const session = await mintSession(rows[0]);
  return { session, user: session.user, error: null };
}

export async function refreshSession(
  refreshToken: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  try {
    const { payload } = await jwtVerify(refreshToken, secretKey());
    if (payload.typ !== "refresh") {
      return { session: null, error: "Invalid refresh token" };
    }
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      return { session: null, error: "Invalid refresh token" };
    }
    if ((Number(payload.tv) || 0) !== (await currentTokenVersion(userId))) {
      return { session: null, error: "Session has ended. Please sign in again." };
    }
    const { rows } = await query(
      `SELECT id, email, phone, encrypted_password, email_confirmed_at,
              phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
              raw_user_meta_data, created_at, updated_at
       FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );
    if (!rows[0]) return { session: null, error: "User not found" };
    const session = await mintSession(rows[0]);
    return { session, error: null };
  } catch {
    return { session: null, error: "Invalid refresh token" };
  }
}

export async function updateUserPassword(
  userId: string,
  password: string
): Promise<{ user: AuthUser | null; error: string | null }> {
  if (!password || password.length < 6) {
    return { user: null, error: "Password must be at least 6 characters" };
  }
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2`,
    [hash, userId]
  );
  await revokeSessions(userId);
  const user = await getUserById(userId);
  return { user, error: null };
}

export async function updateUserMetadata(
  userId: string,
  rawData: Record<string, unknown>
): Promise<{ user: AuthUser | null; error: string | null }> {
  // Only plain profile fields, capped in size.
  const data: Record<string, unknown> = {};
  for (const k of ["full_name", "first_name", "last_name", "phone", "newsletter", "avatar_url"]) {
    const v = rawData?.[k];
    if (typeof v === "string") data[k] = v.slice(0, 200);
    else if (typeof v === "boolean") data[k] = v;
  }
  await query(
    `UPDATE auth.users
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(data), userId]
  );
  if (typeof data.full_name !== "string" && (typeof data.first_name === "string" || typeof data.last_name === "string")) {
    const name = [data.first_name, data.last_name].filter((v) => typeof v === "string" && v.trim()).join(" ").trim();
    if (name) data.full_name = name;
  }
  if (typeof data.full_name === "string" || typeof data.phone === "string") {
    await query(
      `UPDATE profiles SET
         full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         updated_at = now()
       WHERE id = $3`,
      [
        typeof data.full_name === "string" ? data.full_name : null,
        typeof data.phone === "string" ? data.phone : null,
        userId,
      ]
    ).catch(() => {});
  }
  const user = await getUserById(userId);
  return { user, error: null };
}

// ---- password reset --------------------------------------------------------

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a one-time reset token for this email. Returns null when there is no
 * such account (callers must not reveal that to the visitor).
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM auth.users WHERE lower(email) = $1 AND deleted_at IS NULL LIMIT 1`,
    [normalized]
  );
  if (!rows[0]) return null;
  const token = randomBytes(32).toString("hex");
  await query(
    `UPDATE auth.users SET recovery_token = $1, recovery_sent_at = now(), updated_at = now() WHERE id = $2`,
    [hashToken(token), rows[0].id]
  );
  return token;
}

export async function resetPasswordWithToken(
  token: string,
  password: string
): Promise<{ ok: boolean; error: string | null }> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, error: "This reset link is not valid." };
  if (!password || password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters" };
  }
  const { rows } = await query<{ id: string; recovery_sent_at: string | null }>(
    `SELECT id, recovery_sent_at FROM auth.users
     WHERE recovery_token = $1 AND deleted_at IS NULL LIMIT 1`,
    [hashToken(token)]
  );
  const row = rows[0];
  const sentAt = row?.recovery_sent_at ? new Date(row.recovery_sent_at).getTime() : 0;
  if (!row || !sentAt || Date.now() - sentAt > RESET_TTL_MS) {
    return { ok: false, error: "This reset link has expired. Please ask for a new one." };
  }
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `UPDATE auth.users
     SET encrypted_password = $1, recovery_token = '', recovery_sent_at = NULL, updated_at = now()
     WHERE id = $2`,
    [hash, row.id]
  );
  await revokeSessions(row.id);
  return { ok: true, error: null };
}

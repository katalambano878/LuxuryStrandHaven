// Access rules for the public /rest/v1 and /storage/v1 shims.
//
// On hosted Supabase these rules lived in Postgres RLS policies. In plain
// Postgres mode every query runs as the table owner, so the shim has to apply
// the same rules itself before anything reaches the database. Staff (admin or
// staff role in `profiles`) get full access; everyone else gets the short list
// below. Anything not listed is denied.

import type { QueryGuard } from "./supabase-compat";
import { verifyAccessToken } from "./auth";
import { query } from "./pool";

export type CallerRole = "anon" | "customer" | "staff" | "admin";

export interface Caller {
  userId: string | null;
  role: CallerRole;
}

export function isStaff(caller: Caller): boolean {
  return caller.role === "staff" || caller.role === "admin";
}

const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { role: CallerRole; at: number }>();

async function loadRole(userId: string): Promise<CallerRole> {
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < ROLE_CACHE_TTL_MS) return hit.role;
  let role: CallerRole = "customer";
  try {
    const { rows } = await query<{ role: string }>(
      `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const r = rows[0]?.role;
    if (r === "admin" || r === "staff") role = r;
  } catch {
    role = "customer";
  }
  roleCache.set(userId, { role, at: Date.now() });
  return role;
}

/** Who is calling? The role always comes from the database, never from the token. */
export async function resolveCaller(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  let token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const cookie = req.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return { userId: null, role: "anon" };
  const verified = await verifyAccessToken(token);
  if (!verified) return { userId: null, role: "anon" };
  return { userId: verified.userId, role: await loadRole(verified.userId) };
}

// ---- read rules for non-staff callers --------------------------------------

/** Tables anyone may read, with columns that are never shown to the public. */
const PUBLIC_READ: Record<string, { hidden?: string[] }> = {
  products: { hidden: ["cost_per_item"] },
  product_variants: { hidden: ["cost_per_item"] },
  product_images: {},
  product_category_links: {},
  categories: {},
  banners: {},
  cms_content: {},
  store_settings: {},
  store_modules: {},
  site_settings: {},
  pages: {},
  navigation_menus: {},
  navigation_items: {},
  blog_posts: {},
  reviews: {},
  // Join links are only handed out after payment (see /api/academia/*).
  academia_courses: { hidden: ["telegram_url", "youtube_url"] },
};

/** Columns hidden from non-staff wherever the table appears (top level or embedded). */
const HIDDEN_FOR_NON_STAFF: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(PUBLIC_READ)
    .filter(([, v]) => v.hidden?.length)
    .map(([t, v]) => [t, new Set(v.hidden)])
);

/** Tables a non-staff caller may embed under a readable parent. */
const CATALOG_TABLES = new Set([
  "products",
  "product_variants",
  "product_images",
  "product_category_links",
  "categories",
]);

const ORDER_CHILD_TABLES = new Set(["order_items", "order_status_history"]);

export function guardFor(caller: Caller): QueryGuard | null {
  if (isStaff(caller)) return null;
  return {
    rowVisible(parentTable, table, row) {
      // Embedded products follow the same rule as top-level reads, except under
      // an order line, where the product the customer bought must still show.
      if (table !== "products" || parentTable === "order_items") return true;
      return row.status === "active";
    },
    visibilityColumns(table) {
      return table === "products" ? ["status"] : [];
    },
    canEmbed(parentTable, embedTable) {
      if (CATALOG_TABLES.has(embedTable)) return true;
      if (parentTable === "orders" && ORDER_CHILD_TABLES.has(embedTable)) return true;
      return false;
    },
    canUseColumn(table, column) {
      return !HIDDEN_FOR_NON_STAFF[table]?.has(column);
    },
    redact(table, row) {
      if (table === "orders" && row.metadata && typeof row.metadata === "object") {
        // Paid class links live on the order; hand them out only via /api/academia/join.
        const { telegram_url: _t, youtube_url: _y, ...rest } = row.metadata as Record<string, unknown>;
        row.metadata = rest;
      }
      const hidden = HIDDEN_FOR_NON_STAFF[table];
      if (!hidden) return;
      for (const c of hidden) delete row[c];
    },
  };
}

export type Denied = { ok: false; status: number; message: string };
export type Allowed<T = undefined> = { ok: true; value: T };

const deny = (message: string, status = 403): Denied => ({ ok: false, status, message });

/** Minimal surface of the compat QueryBuilder used to add forced filters. */
interface Filterable {
  eq(col: string, value: unknown): unknown;
  not(col: string, op: string, value: unknown): unknown;
  or(parts: string): unknown;
  limit(n: number): unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exactLookup(params: URLSearchParams, column: string): string | null {
  const raw = params.get(column);
  if (!raw || !raw.startsWith("eq.")) return null;
  const v = raw.slice(3);
  return v.length > 0 ? v : null;
}

/**
 * Decide whether a non-staff GET may run, and add the row filters RLS used to
 * add. Returns ok:false to reject the request.
 */
export function authorizeRead(
  caller: Caller,
  table: string,
  params: URLSearchParams,
  qb: Filterable
): Allowed | Denied {
  if (isStaff(caller)) return { ok: true, value: undefined };

  if (table === "orders") {
    // Guests look an order up by its number (order-success, pay link).
    // Signed-in customers can also list their own orders.
    const byNumber = exactLookup(params, "order_number");
    const byId = exactLookup(params, "id");
    if (byId && UUID_RE.test(byId)) {
      // The order's UUID is unguessable and is what payment links carry, so
      // holding it is enough (like a share link).
      qb.limit(1);
      return { ok: true, value: undefined };
    }
    if (byNumber) {
      if (caller.userId) qb.or(`user_id.is.null,user_id.eq.${caller.userId}`);
      else qb.or("user_id.is.null");
      qb.limit(1);
      return { ok: true, value: undefined };
    }
    if (caller.userId) {
      qb.eq("user_id", caller.userId);
      return { ok: true, value: undefined };
    }
    return deny("Sign in to view orders", 401);
  }

  if (table === "profiles") {
    if (!caller.userId) return deny("Sign in required", 401);
    qb.eq("id", caller.userId);
    return { ok: true, value: undefined };
  }

  if (!(table in PUBLIC_READ)) return deny(`Not allowed to read ${table}`);

  // integration_* rows held API keys in the past; they are never public.
  if (table === "store_settings") qb.not("key", "like", "integration\\_%");
  if (table === "pages") qb.eq("status", "published");
  if (table === "products") qb.eq("status", "active");
  if (table === "academia_courses") qb.eq("status", "active");
  if (table === "blog_posts") qb.eq("status", "published");
  if (table === "reviews") {
    if (caller.userId) qb.or(`status.eq.approved,user_id.eq.${caller.userId}`);
    else qb.eq("status", "approved");
  }
  return { ok: true, value: undefined };
}

type Row = Record<string, unknown>;

function pick(row: Row, allowed: string[]): Row {
  const out: Row = {};
  for (const k of allowed) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

function clip(v: unknown, max: number): unknown {
  return typeof v === "string" ? v.slice(0, max) : v;
}

/** Non-staff inserts. Returns the sanitized rows to insert. */
export function authorizeInsert(
  caller: Caller,
  table: string,
  body: unknown
): Allowed<Row[]> | Denied {
  const rows = (Array.isArray(body) ? body : [body]) as Row[];
  if (rows.length === 0 || rows.some((r) => !r || typeof r !== "object")) {
    return deny("Invalid body", 400);
  }
  if (isStaff(caller)) {
    // Upserts can update rows too, so the role rule applies here as well.
    if (table === "profiles" && caller.role !== "admin" && rows.some((r) => "role" in r)) {
      return deny("Only an admin can change roles");
    }
    return { ok: true, value: rows };
  }
  if (rows.length > 1) return deny("One row at a time");

  const row = rows[0];
  if (table === "contact_submissions") {
    const clean = pick(row, ["name", "email", "phone", "subject", "message"]);
    for (const k of Object.keys(clean)) clean[k] = clip(clean[k], k === "message" ? 5000 : 200);
    if (!clean.email || !clean.message) return deny("Email and message are required", 400);
    return { ok: true, value: [clean] };
  }

  if (table === "reviews") {
    if (!caller.userId) return deny("Sign in to write a review", 401);
    const clean = pick(row, ["product_id", "rating", "title", "content"]);
    const rating = Number(clean.rating);
    if (!clean.product_id || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return deny("A product and a rating from 1 to 5 are required", 400);
    }
    return {
      ok: true,
      value: [
        {
          ...clean,
          rating,
          title: clip(clean.title, 200),
          content: clip(clean.content, 5000),
          user_id: caller.userId,
          status: "pending",
          verified_purchase: false,
          helpful_votes: 0,
        },
      ],
    };
  }

  return deny(`Not allowed to write to ${table}`);
}

/** Non-staff updates. Returns the sanitized patch; forced filters are added to qb. */
export function authorizeUpdate(
  caller: Caller,
  table: string,
  body: Row,
  qb: Filterable
): Allowed<Row> | Denied {
  if (isStaff(caller)) {
    // Only admins can hand out admin/staff roles.
    if (table === "profiles" && "role" in body && caller.role !== "admin") {
      return deny("Only an admin can change roles");
    }
    return { ok: true, value: body };
  }
  if (table === "profiles" && caller.userId) {
    const clean = pick(body, [
      "full_name",
      "phone",
      "avatar_url",
      "date_of_birth",
      "gender",
      "preferences",
    ]);
    if (Object.keys(clean).length === 0) return deny("Nothing to update", 400);
    qb.eq("id", caller.userId);
    return { ok: true, value: clean };
  }
  return deny(`Not allowed to update ${table}`);
}

export function authorizeDelete(caller: Caller, table: string): Allowed | Denied {
  if (isStaff(caller)) return { ok: true, value: undefined };
  return deny(`Not allowed to delete from ${table}`);
}

// ---- storage ---------------------------------------------------------------

const BUCKET_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
export const PUBLIC_BUCKETS = new Set(["products", "media", "site-assets"]);

export function isValidBucket(bucket: string): boolean {
  return BUCKET_RE.test(bucket);
}

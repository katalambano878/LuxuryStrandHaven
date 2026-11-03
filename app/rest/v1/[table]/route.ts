import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import {
  authorizeDelete,
  authorizeInsert,
  authorizeRead,
  authorizeUpdate,
  guardFor,
  resolveCaller,
} from "@/lib/db/rest-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  };
}

function preferSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function preferReturn(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation") || prefer.includes("resolution=");
}

function preferCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { message, code: "PGRST", details: null, hint: null },
    { status, headers: corsHeaders() }
  );
}

/** Query-string parameters that are not row filters. */
const NON_FILTER_PARAMS = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

function hasRowFilter(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (!NON_FILTER_PARAMS.has(key) && !key.includes(".")) return true;
  }
  return false;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const caller = await resolveCaller(req);
  const client = createClient();
  const qb = client.from(table).setGuard(guardFor(caller));
  try {
    const select = req.nextUrl.searchParams.get("select") || "*";
    if (preferCount(req)) {
      qb.select(select, {
        count: "exact",
        head: req.headers.get("prefer")?.includes("head=true"),
      });
    } else {
      qb.select(select);
    }
    // Apply filters/order/limit without re-applying select
    const params = new URLSearchParams(req.nextUrl.searchParams);
    params.delete("select");
    const decision = authorizeRead(caller, table, params, qb);
    if (!decision.ok) return jsonError(decision.message, decision.status);
    applyPostgrestParams(qb, params, {
      preferSingle: preferSingle(req),
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid query");
  }

  const result = await qb;
  if (result.error) {
    return jsonError(result.error.message || "Query failed", 400);
  }

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json");
  if (result.count != null) {
    headers.set("Content-Range", `0-${Math.max((Array.isArray(result.data) ? result.data.length : 1) - 1, 0)}/${result.count}`);
  }

  if (preferSingle(req)) {
    return NextResponse.json(result.data, { status: 200, headers });
  }
  return NextResponse.json(result.data ?? [], { status: 200, headers });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const body = await req.json().catch(() => null);
  if (body == null) return jsonError("Invalid JSON body");

  const caller = await resolveCaller(req);
  const decision = authorizeInsert(caller, table, body);
  if (!decision.ok) return jsonError(decision.message, decision.status);

  const client = createClient();
  const rows = Array.isArray(body) ? decision.value : decision.value[0];
  const onConflict = req.nextUrl.searchParams.get("on_conflict");
  const isUpsert = (req.headers.get("prefer") || "").includes("resolution=merge-duplicates");
  let qb = isUpsert
    ? client.from(table).upsert(rows, onConflict ? { onConflict } : undefined)
    : client.from(table).insert(rows);
  qb.setGuard(guardFor(caller));
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Insert failed", 400);

  return NextResponse.json(result.data, {
    status: 201,
    headers: corsHeaders(),
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Invalid JSON body");
  }
  if (!hasRowFilter(req.nextUrl.searchParams)) {
    return jsonError("Updates need a filter", 400);
  }

  const caller = await resolveCaller(req);
  const client = createClient();
  let qb = client.from(table).setGuard(guardFor(caller));
  try {
    const decision = authorizeUpdate(caller, table, body, qb);
    if (!decision.ok) return jsonError(decision.message, decision.status);
    qb = qb.update(decision.value);
    applyPostgrestParams(qb, req.nextUrl.searchParams);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid query");
  }
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Update failed", 400);

  return NextResponse.json(result.data, { status: 200, headers: corsHeaders() });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");
  if (!hasRowFilter(req.nextUrl.searchParams)) {
    return jsonError("Deletes need a filter", 400);
  }

  const caller = await resolveCaller(req);
  const decision = authorizeDelete(caller, table);
  if (!decision.ok) return jsonError(decision.message, decision.status);

  const client = createClient();
  let qb = client.from(table).delete().setGuard(guardFor(caller));
  try {
    applyPostgrestParams(qb, req.nextUrl.searchParams);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid query");
  }
  if (preferReturn(req)) {
    qb = qb.select("*") as typeof qb;
  }

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Delete failed", 400);

  return NextResponse.json(result.data ?? null, { status: 200, headers: corsHeaders() });
}

import { NextRequest, NextResponse } from "next/server";
import {
  MAX_UPLOAD_BYTES,
  createStorageClient,
  isAllowedUpload,
  readUploadBody,
  saveUpload,
} from "@/lib/db/storage";
import { isPlainPostgres } from "@/lib/db/mode";
import { isStaff, isValidBucket, resolveCaller } from "@/lib/db/rest-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-upsert, cache-control, x-client-info",
    "Access-Control-Allow-Methods": "POST,PUT,DELETE,OPTIONS",
  };
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message, message, statusCode: String(status) }, { status, headers: cors() });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

/** Only staff can change stored files (matches the old storage RLS policies). */
async function requireStaff(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!isStaff(caller)) return fail("Only store staff can change files", caller.userId ? 403 : 401);
  return null;
}

/**
 * Supabase Storage upload:
 *   POST /storage/v1/object/{bucket}/{path}
 *   body = raw file bytes
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }

  const { bucket, path } = await ctx.params;
  if (!isValidBucket(bucket)) return fail("Invalid bucket", 400);
  const denied = await requireStaff(req);
  if (denied) return denied;

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES) return fail("File is too large", 413);

  const objectPath = path.map(decodeURIComponent).join("/");

  let upload: { bytes: Buffer; contentType: string };
  try {
    upload = await readUploadBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid upload";
    return fail(message, 400);
  }
  if (upload.bytes.length > MAX_UPLOAD_BYTES) return fail("File is too large", 413);
  if (!isAllowedUpload(objectPath, upload.contentType)) {
    return fail("Only images, videos and PDFs can be uploaded", 415);
  }

  let saved: { path: string; contentType: string };
  try {
    saved = await saveUpload(bucket, objectPath, upload.bytes, upload.contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return fail(message, 400);
  }

  const storage = createStorageClient();
  const { data: pub } = storage.from(bucket).getPublicUrl(saved.path);
  const relative = pub.publicUrl.replace(/^https?:\/\/[^/]+/, "");
  return NextResponse.json(
    {
      Key: `${bucket}/${saved.path}`,
      Id: saved.path,
      path: saved.path,
      publicUrl: relative,
    },
    { headers: cors() }
  );
}

/** supabase-js sends PUT for `update()` / upsert uploads. */
export const PUT = POST;

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  const { bucket, path } = await ctx.params;
  if (!isValidBucket(bucket)) return fail("Invalid bucket", 400);
  const denied = await requireStaff(req);
  if (denied) return denied;

  const objectPath = path.map(decodeURIComponent).join("/");
  const storage = createStorageClient();
  const { error } = await storage.from(bucket).remove([objectPath]);
  if (error) {
    return fail(error.message, 400);
  }
  return NextResponse.json({}, { headers: cors() });
}

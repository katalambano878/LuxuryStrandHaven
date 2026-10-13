import { NextRequest, NextResponse } from "next/server";
import { createStorageClient, readUploadBody, saveUpload } from "@/lib/db/storage";
import { isPlainPostgres } from "@/lib/db/mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-upsert, cache-control, x-client-info",
    "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
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
  const objectPath = path.map(decodeURIComponent).join("/");

  let upload: { bytes: Buffer; contentType: string };
  try {
    upload = await readUploadBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid upload";
    return NextResponse.json({ error: message }, { status: 400, headers: cors() });
  }

  let saved: { path: string; contentType: string };
  try {
    saved = await saveUpload(bucket, objectPath, upload.bytes, upload.contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400, headers: cors() });
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

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const storage = createStorageClient();
  const { error } = await storage.from(bucket).remove([objectPath]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({});
}

import { serveStoredFile, statObject } from "@/lib/db/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE = "public, max-age=86400";

async function respond(
  req: Request,
  bucket: string,
  objectPath: string
): Promise<Response> {
  const file = await statObject(bucket, objectPath);
  if (!file) {
    return new Response(JSON.stringify({ error: "Object not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return serveStoredFile(req, file, CACHE);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<Response> {
  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  return respond(req, bucket, objectPath);
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<Response> {
  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const response = await respond(req, bucket, objectPath);
  return new Response(null, { status: response.status, headers: response.headers });
}

// Storage shim replacing Supabase Storage (MinIO). Objects are stored on a
// local disk volume; private buckets are served through an HMAC-signed URL
// route that mirrors Supabase's `/storage/v1/object/sign/...` shape, so the
// only code change in functions is none — they keep calling
// `supabase.storage.from(bucket).upload()/createSignedUrl()/getPublicUrl()`.

import { createHmac } from "crypto";
import { spawn } from "child_process";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { Readable } from "stream";
import os from "os";
import path from "path";

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), ".storage");

function publicBase(): string {
  return (
    process.env.STORAGE_PUBLIC_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function signingSecret(): string {
  return (
    process.env.STORAGE_SIGNING_SECRET ||
    process.env.JWT_SECRET ||
    "storage-dev-secret"
  );
}

export function signObjectToken(bucket: string, objectPath: string, expEpoch: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${bucket}/${objectPath}:${expEpoch}`)
    .digest("hex");
}

export function verifyObjectToken(
  bucket: string,
  objectPath: string,
  expEpoch: number,
  token: string
): boolean {
  if (!Number.isFinite(expEpoch) || Date.now() / 1000 > expEpoch) return false;
  const expected = signObjectToken(bucket, objectPath, expEpoch);
  // constant-time-ish compare
  if (expected.length !== token.length) return false;
  let out = 0;
  for (let i = 0; i < expected.length; i++) out |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return out === 0;
}

function safeJoin(bucket: string, objectPath: string): string {
  const clean = objectPath.replace(/^\/+/, "");
  const full = path.normalize(path.join(STORAGE_ROOT, bucket, clean));
  const base = path.normalize(path.join(STORAGE_ROOT, bucket));
  if (!full.startsWith(base)) throw new Error("Path traversal blocked");
  return full;
}

export async function readObject(
  bucket: string,
  objectPath: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const full = safeJoin(bucket, objectPath);
    const bytes = await fs.readFile(full);
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.readFile(full + ".meta.json", "utf8"));
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      contentType = guessContentType(objectPath);
    }
    return { bytes, contentType };
  } catch {
    return null;
  }
}

function guessContentType(p: string): string {
  const ext = p.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    ogg: "video/ogg",
  };
  return map[ext] || "application/octet-stream";
}

export interface StoredObject {
  filePath: string;
  size: number;
  contentType: string;
}

export async function statObject(
  bucket: string,
  objectPath: string
): Promise<StoredObject | null> {
  try {
    const filePath = safeJoin(bucket, objectPath);
    const info = await fs.stat(filePath);
    if (!info.isFile()) return null;
    let contentType = guessContentType(objectPath);
    try {
      const meta = JSON.parse(await fs.readFile(filePath + ".meta.json", "utf8"));
      if (meta.contentType && !contentType.startsWith("video/")) {
        contentType = meta.contentType;
      }
    } catch {
      // extension map is enough
    }
    return { filePath, size: info.size, contentType };
  } catch {
    return null;
  }
}

function parseByteRange(
  header: string,
  size: number
): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (startRaw === "" && endRaw === "") return null;

  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(startRaw);
  const end = endRaw === "" ? size - 1 : Number(endRaw);
  if (!Number.isFinite(start) || start < 0 || start >= size) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

const VIDEO_EXT = /\.(mov|mp4|m4v|webm|ogg|avi|qt)$/i;

/** Browsers send storage uploads as multipart form data. Keep only the file bytes. */
export async function readUploadBody(
  req: Request
): Promise<{ bytes: Buffer; contentType: string }> {
  const header = req.headers.get("content-type") || "application/octet-stream";
  if (header.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const value of form.values()) {
      if (value instanceof File && value.size > 0) {
        return {
          bytes: Buffer.from(await value.arrayBuffer()),
          contentType: value.type || "application/octet-stream",
        };
      }
    }
    throw new Error("Upload did not include a file");
  }
  return {
    bytes: Buffer.from(await req.arrayBuffer()),
    contentType: header.split(";")[0].trim() || "application/octet-stream",
  };
}

/**
 * Save an upload. Videos are remuxed to a faststart MP4 and a JPEG poster so
 * Chrome can play them and product cards have a still frame.
 * Returns the object path that was actually written.
 */
export async function saveUpload(
  bucket: string,
  objectPath: string,
  bytes: Buffer,
  contentType: string
): Promise<{ path: string; contentType: string }> {
  const video =
    contentType.startsWith("video/") || VIDEO_EXT.test(objectPath);
  if (!video) {
    const storage = createStorageClient();
    const saved = await storage.from(bucket).upload(objectPath, bytes, { contentType, upsert: true });
    if (saved.error) throw new Error(saved.error.message);
    return { path: objectPath, contentType };
  }

  const destPath = objectPath.replace(/\.(mov|m4v|qt|avi|webm|ogg)$/i, ".mp4");
  const destFile = safeJoin(bucket, destPath);
  const posterFile = destFile.replace(/\.mp4$/i, ".poster.jpg");
  const tmpIn = path.join(os.tmpdir(), `upload-${Date.now()}-${path.basename(objectPath)}`);
  await fs.writeFile(tmpIn, bytes);
  try {
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    const videoArgs = [
      "-y", "-i", tmpIn,
      "-vf", "scale='min(720,iw)':-2",
      "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-b:v", "2500k", "-maxrate", "3200k", "-bufsize", "5000k",
      "-movflags", "+faststart",
    ];
    try {
      await runFfmpeg([...videoArgs, "-c:a", "aac", "-b:a", "128k", destFile]);
    } catch {
      await runFfmpeg([...videoArgs, "-an", destFile]);
    }
    await runFfmpeg(["-y", "-ss", "0.4", "-i", destFile, "-frames:v", "1", "-q:v", "4", posterFile]).catch(
      () => runFfmpeg(["-y", "-i", destFile, "-frames:v", "1", "-q:v", "4", posterFile])
    );
    await fs.writeFile(destFile + ".meta.json", JSON.stringify({ contentType: "video/mp4" }));
    return { path: destPath, contentType: "video/mp4" };
  } finally {
    await fs.rm(tmpIn, { force: true });
  }
}

/** Stream a stored file, including the byte ranges browsers require to play video. */
export function serveStoredFile(
  req: Request,
  file: StoredObject,
  cacheControl: string
): Response {
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Access-Control-Allow-Origin": "*",
  });

  const range = req.headers.get("range");
  if (range) {
    const parsed = parseByteRange(range, file.size);
    if (parsed === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${file.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (parsed) {
      const { start, end } = parsed;
      headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
      headers.set("Content-Length", String(end - start + 1));
      const stream = createReadStream(file.filePath, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers,
      });
    }
  }

  headers.set("Content-Length", String(file.size));
  const stream = createReadStream(file.filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers,
  });
}

interface BucketApi {
  upload(
    objectPath: string,
    data: ArrayBuffer | Uint8Array | Buffer | Blob,
    opts?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  createSignedUrl(
    objectPath: string,
    expiresIn: number
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  getPublicUrl(objectPath: string): { data: { publicUrl: string } };
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface StorageClient {
  from(bucket: string): BucketApi;
}

export function createStorageClient(): StorageClient {
  return {
    from(bucket: string): BucketApi {
      return {
        async upload(objectPath, data, opts) {
          try {
            const full = safeJoin(bucket, objectPath);
            await fs.mkdir(path.dirname(full), { recursive: true });
            let buf: Buffer;
            if (data instanceof Buffer) buf = data;
            else if (data instanceof Uint8Array) buf = Buffer.from(data);
            else if (data instanceof ArrayBuffer) buf = Buffer.from(new Uint8Array(data));
            else if (typeof (data as Blob).arrayBuffer === "function") {
              buf = Buffer.from(new Uint8Array(await (data as Blob).arrayBuffer()));
            } else {
              buf = Buffer.from(data as any);
            }
            await fs.writeFile(full, buf);
            if (opts?.contentType) {
              await fs.writeFile(
                full + ".meta.json",
                JSON.stringify({ contentType: opts.contentType })
              );
            }
            return { data: { path: objectPath }, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e.message } };
          }
        },
        async createSignedUrl(objectPath, expiresIn) {
          const clean = objectPath.replace(/^\/+/, "");
          const exp = Math.floor(Date.now() / 1000) + (expiresIn || 3600);
          const token = signObjectToken(bucket, clean, exp);
          const url = `${publicBase()}/storage/v1/object/sign/${bucket}/${encodeURI(
            clean
          )}?token=${token}&exp=${exp}`;
          return { data: { signedUrl: url }, error: null };
        },
        getPublicUrl(objectPath) {
          const clean = objectPath.replace(/^\/+/, "");
          return {
            data: {
              publicUrl: `${publicBase()}/storage/v1/object/public/${bucket}/${encodeURI(clean)}`,
            },
          };
        },
        async remove(paths) {
          try {
            for (const p of paths) {
              const full = safeJoin(bucket, p);
              await fs.rm(full, { force: true });
              await fs.rm(full + ".meta.json", { force: true });
            }
            return { data: {}, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e.message } };
          }
        },
      };
    },
  };
}

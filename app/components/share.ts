// Share-link encoding: pack the FULL results into the URL fragment so a
// shared link reproduces the exact results for the recipient — no server
// storage, no database, no cost. The fragment (#r=...) never hits the
// server, so there's no server-side URL-length limit; gzip keeps it small.

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** gzip + base64url. Falls back to plain base64url where gzip is missing. */
export async function encodeResults(data: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === "undefined") {
    return "u" + toBase64Url(json);
  }
  const stream = new Blob([json as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return "g" + toBase64Url(buf);
}

export async function decodeResults<T>(s: string): Promise<T | null> {
  try {
    const tag = s[0];
    const bytes = fromBase64Url(s.slice(1));
    if (tag === "u") {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    }
    if (tag === "g" && typeof DecompressionStream !== "undefined") {
      const stream = new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text()) as T;
    }
    return null;
  } catch {
    return null;
  }
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function uint8ToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < len ? bytes[i + 1]! : 0;
    const c = i + 2 < len ? bytes[i + 2]! : 0;
    result += BASE64_CHARS[(a >> 2)!]!;
    result += BASE64_CHARS[((a & 3) << 4) | (b >> 4)]!;
    result += i + 1 < len ? BASE64_CHARS[((b & 15) << 2) | (c >> 6)]! : "=";
    result += i + 2 < len ? BASE64_CHARS[c & 63]! : "=";
  }
  return result;
}

export function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]/g, "");
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let pos = 0;
  for (let i = 0; i < len; i += 4) {
    const a = BASE64_CHARS.indexOf(clean[i]!);
    const b = i + 1 < len ? BASE64_CHARS.indexOf(clean[i + 1]!) : 0;
    const c = i + 2 < len ? BASE64_CHARS.indexOf(clean[i + 2]!) : 0;
    const d = i + 3 < len ? BASE64_CHARS.indexOf(clean[i + 3]!) : 0;
    bytes[pos++] = (a << 2) | (b >> 4);
    if (i + 2 < len) bytes[pos++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) bytes[pos++] = ((c & 3) << 6) | d;
  }
  return bytes.slice(0, pos);
}

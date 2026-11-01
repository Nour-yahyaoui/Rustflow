import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [type, salt, digest] = encoded.split("$");
  if (type !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = await derive(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertNoSecrets(data: unknown): void {
  if (Array.isArray(data)) {
    for (const item of data) assertNoSecrets(item);
    return;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.secret === true && obj.value)
      throw new ApiError(422, "Secret variables cannot be synchronized");
    if (
      typeof obj.key === "string" &&
      /authorization|cookie|password|secret|token|api[-_]?key/i.test(obj.key) &&
      obj.value
    )
      throw new ApiError(
        422,
        "Credential-bearing headers or variables cannot be synchronized",
      );
    for (const [key, value] of Object.entries(obj)) {
      if (
        /^(token|password|access_token|refresh_token|client_secret)$/i.test(
          key,
        ) &&
        value
      )
        throw new ApiError(422, "Credentials cannot be synchronized");
      if (
        key === "auth" &&
        value &&
        typeof value === "object" &&
        (value as Record<string, unknown>).value
      )
        throw new ApiError(422, "API keys cannot be synchronized");
      assertNoSecrets(value);
    }
  }
}

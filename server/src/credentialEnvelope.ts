import { createCipheriv, createDecipheriv, generateKeyPairSync, hkdfSync, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";

type Ciphertext = { iv: string; tag: string; ciphertext: string };
export type SealedCredential = Ciphertext & { version: 1; wrappedKey: string };
export type CredentialBootstrap = { publicKey: string; privateKey: Ciphertext };
const context = Buffer.from("AxMed service credentials v1", "utf8");
const bootstrapKey = (secret: string) => Buffer.from(hkdfSync("sha256", secret, context, "bootstrap-private-key", 32));

function encrypt(text: string, key: Buffer): Ciphertext {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(context);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: encrypted.toString("base64url") };
}
function decrypt(value: Ciphertext, key: Buffer) {
  if (typeof value?.iv !== "string" || typeof value.tag !== "string" || typeof value.ciphertext !== "string" || value.ciphertext.length > 100_000) throw Error("Invalid encrypted credential");
  const iv = Buffer.from(value.iv, "base64url"); const tag = Buffer.from(value.tag, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(context); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
export function createCredentialBootstrap(serverSecret: string): CredentialBootstrap {
  const pair = generateKeyPairSync("rsa", { modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  return { publicKey: pair.publicKey, privateKey: encrypt(pair.privateKey, bootstrapKey(serverSecret)) };
}
// The administrator needs only this public key and database write access.
// The server's JWT secret and RSA private key never leave the server.
export function sealCredential(publicKey: string, value: unknown): SealedCredential {
  const key = randomBytes(32);
  return { version: 1, ...encrypt(JSON.stringify(value), key), wrappedKey: publicEncrypt({ key: publicKey, oaepHash: "sha256" }, key).toString("base64url") };
}
export function openCredential(value: SealedCredential, bootstrap: CredentialBootstrap, serverSecret: string): unknown {
  if (value?.version !== 1 || typeof value.wrappedKey !== "string" || value.wrappedKey.length > 1024) throw Error("Invalid encrypted credential");
  const privateKey = decrypt(bootstrap.privateKey, bootstrapKey(serverSecret));
  const key = privateDecrypt({ key: privateKey, oaepHash: "sha256" }, Buffer.from(value.wrappedKey, "base64url"));
  return JSON.parse(decrypt(value, key));
}

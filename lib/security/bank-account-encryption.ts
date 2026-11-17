import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const configured = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) {
    throw new Error("BANK_ACCOUNT_ENCRYPTION_KEY must be configured as 64 hexadecimal characters.");
  }
  return Buffer.from(configured, "hex");
}

export function encryptBankAccountNumber(accountNumber: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map(part => part.toString("base64")).join(".");
}

export function decryptBankAccountNumber(payload: string): string {
  const [ivPart, tagPart, ciphertextPart, extra] = payload.split(".");
  if (!ivPart || !tagPart || !ciphertextPart || extra !== undefined) {
    throw new Error("Stored bank account ciphertext has an invalid format.");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64")),
    decipher.final()
  ]).toString("utf8");
}

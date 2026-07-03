/**
 * Encrypted append-only buffer with hash-chain tamper detection.
 *
 * Per ADR-003 "Detection": The buffer uses a hash chain where each record
 * includes the SHA-256 hash of the previous record's signature. This makes
 * deletions or edits of older entries detectable (though not preventable
 * without server-side reconciliation).
 *
 * Storage format:
 * - File: ~/.mycompany-ai-usage/buffer.enc
 * - Each record is encrypted with AES-256-GCM
 * - Records are newline-delimited: IV:TAG:CIPHERTEXT (all base64)
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { BufferRecord, EnrichedEvent } from "../types";

const BUFFER_DIR = path.join(os.homedir(), ".mycompany-ai-usage");
const BUFFER_FILE = path.join(BUFFER_DIR, "buffer.enc");
const GENESIS_HASH = "GENESIS";

/** Input for append() - event and signature, prevHash is computed */
export type BufferAppendInput = Omit<BufferRecord, "prevHash">;

/**
 * Encrypted append-only buffer with hash-chain for tamper detection.
 */
export class BufferStore {
  private encryptionKey: Buffer;
  private lastSignatureHash: string = GENESIS_HASH;

  constructor(encryptionKey: Buffer) {
    if (encryptionKey.length !== 32) {
      throw new Error(`Encryption key must be 32 bytes, got ${encryptionKey.length}`);
    }
    this.encryptionKey = encryptionKey;
    this.initializeLastHash();
  }

  /**
   * Appends a record to the buffer with hash-chain linking.
   *
   * @param input - Event and signature to append (prevHash computed automatically)
   */
  append(input: BufferAppendInput): void {
    const record: BufferRecord = {
      ...input,
      prevHash: this.lastSignatureHash,
    };

    const encryptedLine = this.encryptRecord(record);
    this.ensureBufferDirectory();

    fs.appendFileSync(BUFFER_FILE, encryptedLine + "\n");

    // Update hash chain state
    this.lastSignatureHash = this.hashSignature(record.signature);
  }

  /**
   * Verifies the integrity of the hash chain.
   *
   * @returns -1 if chain is intact, or the 0-based index of the first broken record
   */
  verifyChain(): number {
    if (!fs.existsSync(BUFFER_FILE)) {
      return -1; // Empty buffer is valid
    }

    const lines = fs.readFileSync(BUFFER_FILE, "utf8").trim().split("\n").filter(Boolean);
    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < lines.length; i++) {
      try {
        const record = this.decryptRecord(lines[i]);
        if (record.prevHash !== expectedPrevHash) {
          return i; // Chain broken at this index
        }
        expectedPrevHash = this.hashSignature(record.signature);
      } catch {
        return i; // Decryption failure indicates tampering
      }
    }

    return -1; // Chain intact
  }

  /**
   * Yields all pending (not yet uploaded) records from the buffer.
   */
  *pendingRecords(): Generator<BufferRecord> {
    if (!fs.existsSync(BUFFER_FILE)) {
      return;
    }

    const lines = fs.readFileSync(BUFFER_FILE, "utf8").trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        yield this.decryptRecord(line);
      } catch {
        // Skip corrupted records (already logged during verification)
        continue;
      }
    }
  }

  /**
   * Removes a successfully uploaded event from the buffer.
   *
   * Note: This rewrites the entire buffer file. For high-volume scenarios,
   * consider a more efficient implementation with index tracking.
   *
   * @param eventId - The event_id to remove
   */
  markUploaded(eventId: string): void {
    if (!fs.existsSync(BUFFER_FILE)) {
      return;
    }

    const lines = fs.readFileSync(BUFFER_FILE, "utf8").trim().split("\n").filter(Boolean);
    const remainingLines: string[] = [];

    for (const line of lines) {
      try {
        const record = this.decryptRecord(line);
        if (record.event.event_id !== eventId) {
          remainingLines.push(line);
        }
      } catch {
        // Keep corrupted lines for debugging rather than silently discarding
        remainingLines.push(line);
      }
    }

    if (remainingLines.length === 0) {
      // Delete empty buffer file
      fs.unlinkSync(BUFFER_FILE);
      this.lastSignatureHash = GENESIS_HASH;
    } else {
      fs.writeFileSync(BUFFER_FILE, remainingLines.join("\n") + "\n");
      // Recalculate last hash from remaining records
      this.initializeLastHash();
    }
  }

  /**
   * Returns the count of pending records in the buffer.
   */
  pendingCount(): number {
    if (!fs.existsSync(BUFFER_FILE)) {
      return 0;
    }
    const lines = fs.readFileSync(BUFFER_FILE, "utf8").trim().split("\n").filter(Boolean);
    return lines.length;
  }

  private ensureBufferDirectory(): void {
    if (!fs.existsSync(BUFFER_DIR)) {
      fs.mkdirSync(BUFFER_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Initializes lastSignatureHash by reading existing buffer.
   */
  private initializeLastHash(): void {
    if (!fs.existsSync(BUFFER_FILE)) {
      this.lastSignatureHash = GENESIS_HASH;
      return;
    }

    const lines = fs.readFileSync(BUFFER_FILE, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      this.lastSignatureHash = GENESIS_HASH;
      return;
    }

    // Get the last record's signature hash
    const lastLine = lines[lines.length - 1];
    try {
      const record = this.decryptRecord(lastLine);
      this.lastSignatureHash = this.hashSignature(record.signature);
    } catch {
      // If last record is corrupted, start fresh chain
      // (verifyChain will catch this at startup)
      this.lastSignatureHash = GENESIS_HASH;
    }
  }

  /**
   * Computes SHA-256 hash of a signature for the hash chain.
   */
  private hashSignature(signature: string): string {
    return crypto.createHash("sha256").update(signature).digest("hex");
  }

  /**
   * Encrypts a BufferRecord using AES-256-GCM.
   *
   * @returns Format: IV:TAG:CIPHERTEXT (all base64)
   */
  private encryptRecord(record: BufferRecord): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    const plaintext = JSON.stringify(record);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  /**
   * Decrypts a BufferRecord from its encrypted line format.
   *
   * @param line - Format: IV:TAG:CIPHERTEXT (all base64)
   * @returns Decrypted BufferRecord
   * @throws Error if decryption fails (tampering, corruption)
   */
  private decryptRecord(line: string): BufferRecord {
    const parts = line.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted record format");
    }

    const [ivB64, tagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as BufferRecord;
  }
}

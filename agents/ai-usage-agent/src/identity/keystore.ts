/**
 * Key management for ai-usage-agent.
 *
 * IMPORTANT (ADR-003): FileKeyStore is a REFERENCE IMPLEMENTATION only.
 * Before production deployment, swap for an OS-keychain-backed implementation
 * (e.g., using keytar or native bindings) to protect private keys at rest.
 * File-based storage leaves keys vulnerable to local file access attacks.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/** Interface for key storage backends. */
export interface KeyStore {
  /** Returns the ES256 signing key pair (PEM format). */
  getSigningKeyPair(): { privateKey: string; publicKey: string };

  /** Returns the 32-byte AES-256 key for buffer encryption. */
  getBufferEncryptionKey(): Buffer;
}

const KEYS_DIR = path.join(os.homedir(), ".mycompany-ai-usage", "keys");
const SIGNING_PRIVATE_KEY_FILE = path.join(KEYS_DIR, "signing.key");
const SIGNING_PUBLIC_KEY_FILE = path.join(KEYS_DIR, "signing.pub");
const BUFFER_KEY_FILE = path.join(KEYS_DIR, "buffer.key");

/**
 * File-based KeyStore using PEM files for signing keys and raw bytes for buffer key.
 *
 * Directory structure:
 *   ~/.mycompany-ai-usage/keys/
 *     signing.key  - ES256 private key (PEM)
 *     signing.pub  - ES256 public key (PEM)
 *     buffer.key   - 32 bytes raw AES-256 key
 *
 * Keys are auto-generated on first access if missing.
 */
export class FileKeyStore implements KeyStore {
  private signingKeyPair: { privateKey: string; publicKey: string } | null = null;
  private bufferKey: Buffer | null = null;

  getSigningKeyPair(): { privateKey: string; publicKey: string } {
    if (this.signingKeyPair) {
      return this.signingKeyPair;
    }

    this.ensureKeysDirectory();

    if (fs.existsSync(SIGNING_PRIVATE_KEY_FILE) && fs.existsSync(SIGNING_PUBLIC_KEY_FILE)) {
      this.signingKeyPair = {
        privateKey: fs.readFileSync(SIGNING_PRIVATE_KEY_FILE, "utf8"),
        publicKey: fs.readFileSync(SIGNING_PUBLIC_KEY_FILE, "utf8"),
      };
    } else {
      this.signingKeyPair = this.generateSigningKeyPair();
    }

    return this.signingKeyPair;
  }

  getBufferEncryptionKey(): Buffer {
    if (this.bufferKey) {
      return this.bufferKey;
    }

    this.ensureKeysDirectory();

    if (fs.existsSync(BUFFER_KEY_FILE)) {
      this.bufferKey = fs.readFileSync(BUFFER_KEY_FILE);
      if (this.bufferKey.length !== 32) {
        throw new Error(`Buffer key file corrupted: expected 32 bytes, got ${this.bufferKey.length}`);
      }
    } else {
      this.bufferKey = this.generateBufferKey();
    }

    return this.bufferKey;
  }

  private ensureKeysDirectory(): void {
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
    }
  }

  private generateSigningKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1", // P-256, required for ES256
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    // Write with restrictive permissions (owner read/write only)
    fs.writeFileSync(SIGNING_PRIVATE_KEY_FILE, privateKey, { mode: 0o600 });
    fs.writeFileSync(SIGNING_PUBLIC_KEY_FILE, publicKey, { mode: 0o644 });

    console.log(`Generated new ES256 signing key pair at ${KEYS_DIR}`);

    return { privateKey, publicKey };
  }

  private generateBufferKey(): Buffer {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(BUFFER_KEY_FILE, key, { mode: 0o600 });
    console.log(`Generated new buffer encryption key at ${BUFFER_KEY_FILE}`);
    return key;
  }
}

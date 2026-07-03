/**
 * Developer identity provisioning for ai-usage-agent.
 *
 * STUB IMPLEMENTATION: The real implementation requires SSO device-code flow
 * integration with the company IdP (Okta/Azure AD/Google) per ADR-003.
 *
 * Current behavior:
 * 1. Check AI_USAGE_DEV_DEVELOPER_ID env var (dev/test override)
 * 2. Check ~/.mycompany-ai-usage/identity.json for existing provisioning
 * 3. If not provisioned: generate a random UUID (dev mode) or fail
 *
 * Production: registerWithCompanyIdp() should perform device-code OAuth flow,
 * receive developer identity from IdP, then register the public key with the
 * backend as part of the provisioning handshake.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import type { KeyStore } from "./keystore";

export interface ProvisionedIdentity {
  developerId: string; // UUID
  provisionedAt: string; // ISO8601
}

const IDENTITY_DIR = path.join(os.homedir(), ".mycompany-ai-usage");
const IDENTITY_FILE = path.join(IDENTITY_DIR, "identity.json");

/**
 * Ensures the agent has a provisioned developer identity.
 *
 * Resolution order:
 * 1. AI_USAGE_DEV_DEVELOPER_ID env var (for dev/test)
 * 2. Existing identity.json file
 * 3. Stub: generate random UUID (dev mode)
 *
 * In production, step 3 should trigger SSO device-code flow.
 */
export async function ensureProvisioned(keyStore: KeyStore): Promise<ProvisionedIdentity> {
  // 1. Check for dev/test override
  const devOverride = process.env.AI_USAGE_DEV_DEVELOPER_ID;
  if (devOverride) {
    console.log(`Using developer ID from AI_USAGE_DEV_DEVELOPER_ID: ${devOverride}`);
    return {
      developerId: devOverride,
      provisionedAt: new Date().toISOString(),
    };
  }

  // 2. Check for existing provisioning
  if (fs.existsSync(IDENTITY_FILE)) {
    try {
      const identity: ProvisionedIdentity = JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
      if (identity.developerId && identity.provisionedAt) {
        console.log(`Loaded existing identity: ${identity.developerId}`);
        return identity;
      }
    } catch {
      console.warn(`Failed to parse ${IDENTITY_FILE}, will re-provision`);
    }
  }

  // 3. Stub: In production, this would call registerWithCompanyIdp()
  console.warn(
    "SSO provisioning not implemented. Generating random developer ID for dev/test.\n" +
      "Set AI_USAGE_DEV_DEVELOPER_ID env var or implement registerWithCompanyIdp() for production."
  );

  const identity = await stubProvision(keyStore);
  return identity;
}

/**
 * Stub provisioning for dev/test. Generates a random UUID and saves it.
 * In production, replace with registerWithCompanyIdp().
 */
async function stubProvision(_keyStore: KeyStore): Promise<ProvisionedIdentity> {
  const identity: ProvisionedIdentity = {
    developerId: crypto.randomUUID(),
    provisionedAt: new Date().toISOString(),
  };

  if (!fs.existsSync(IDENTITY_DIR)) {
    fs.mkdirSync(IDENTITY_DIR, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });
  console.log(`Provisioned new developer identity: ${identity.developerId}`);
  console.log(`Saved to ${IDENTITY_FILE}`);

  return identity;
}

/**
 * STUB: SSO device-code flow registration with company IdP.
 *
 * Production implementation should:
 * 1. Initiate device-code OAuth flow with company IdP (Okta/Azure AD/Google)
 * 2. Display device code and verification URL to user
 * 3. Poll for completion
 * 4. Extract user identity (email, user ID) from IdP token
 * 5. Register public key with backend, associating it with the IdP identity
 * 6. Store the resulting developer_id in identity.json
 *
 * @param keyStore - KeyStore to get the public key for registration
 * @returns Provisioned identity after successful SSO flow
 */
export async function registerWithCompanyIdp(_keyStore: KeyStore): Promise<ProvisionedIdentity> {
  throw new Error(
    "SSO device-code flow not implemented. " +
      "This function should be implemented with your company's IdP (Okta/Azure AD/Google) " +
      "before production deployment. See ADR-003 for requirements."
  );
}

/**
 * Pure form model + client-side validation for the governance policy editor.
 *
 * Kept framework-free (no React) so the validation rules are unit-testable in
 * isolation and the component file stays focused on rendering. Rules mirror the
 * backend contract for PATCH /v1/governance/policy:
 *   - raw_retention_days: integer in [1, 365]
 *   - personal_account_policy: 'flag_only' | 'collect_full'
 *   - company_domains: list of non-empty strings
 */

import type {
  GovernancePolicyResponse,
  GovernancePolicyUpdate,
  PersonalAccountPolicy,
} from '@/lib/api';

export const PERSONAL_ACCOUNT_POLICIES = [
  'flag_only',
  'collect_full',
] as const satisfies readonly PersonalAccountPolicy[];

export const RETENTION_MIN = 1;
export const RETENTION_MAX = 365;

/** Editable form state. `rawRetentionDays` is a string so the field can be empty/partial while typing. */
export interface PolicyFormValues {
  companyDomains: string[];
  personalAccountPolicy: PersonalAccountPolicy;
  rawRetentionDays: string;
}

/** Field-level validation messages. Absent keys mean the field is valid. */
export interface PolicyFormErrors {
  /** Per-entry messages, keyed by the domain's index in the list. */
  companyDomains?: Record<number, string>;
  personalAccountPolicy?: string;
  rawRetentionDays?: string;
}

/** Sensible starting point before the admin sets values (there is no GET policy endpoint). */
export const DEFAULT_FORM_VALUES: PolicyFormValues = {
  companyDomains: [''],
  personalAccountPolicy: 'flag_only',
  rawRetentionDays: '90',
};

/** Runtime guard for the personal-account-policy enum. */
export function isPersonalAccountPolicy(
  value: unknown,
): value is PersonalAccountPolicy {
  return (
    typeof value === 'string' &&
    (PERSONAL_ACCOUNT_POLICIES as readonly string[]).includes(value)
  );
}

/** True when `errors` carries no field messages. */
export function hasNoErrors(errors: PolicyFormErrors): boolean {
  return (
    !errors.personalAccountPolicy &&
    !errors.rawRetentionDays &&
    (!errors.companyDomains || Object.keys(errors.companyDomains).length === 0)
  );
}

/**
 * Validate the form and, when valid, produce the request body. Company domains
 * are trimmed; blank entries are the only ones flagged (empty list is allowed).
 */
export function validatePolicyForm(
  values: PolicyFormValues,
):
  | { ok: true; body: GovernancePolicyUpdate }
  | { ok: false; errors: PolicyFormErrors } {
  const errors: PolicyFormErrors = {};

  // company_domains — every present entry must be non-empty once trimmed.
  const domainErrors: Record<number, string> = {};
  const trimmedDomains: string[] = [];
  values.companyDomains.forEach((domain, index) => {
    const trimmed = domain.trim();
    if (trimmed.length === 0) {
      domainErrors[index] = 'Domain cannot be empty.';
    } else {
      trimmedDomains.push(trimmed);
    }
  });
  if (Object.keys(domainErrors).length > 0) {
    errors.companyDomains = domainErrors;
  }

  // personal_account_policy — must be one of the two enum members.
  if (!isPersonalAccountPolicy(values.personalAccountPolicy)) {
    errors.personalAccountPolicy = 'Select a valid policy.';
  }

  // raw_retention_days — integer within [1, 365].
  const retentionRaw = values.rawRetentionDays.trim();
  const retention = Number(retentionRaw);
  if (retentionRaw.length === 0) {
    errors.rawRetentionDays = 'Retention days is required.';
  } else if (!Number.isInteger(retention)) {
    errors.rawRetentionDays = 'Retention days must be a whole number.';
  } else if (retention < RETENTION_MIN || retention > RETENTION_MAX) {
    errors.rawRetentionDays = `Retention days must be between ${RETENTION_MIN} and ${RETENTION_MAX}.`;
  }

  if (!hasNoErrors(errors)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: {
      company_domains: trimmedDomains,
      personal_account_policy: values.personalAccountPolicy,
      raw_retention_days: retention,
    },
  };
}

/** Seed form state from a policy response (used to reflect the server's value after a successful PATCH). */
export function formValuesFromResponse(
  response: GovernancePolicyResponse,
): PolicyFormValues {
  return {
    // Keep at least one row so the "add/remove" UI always has an anchor.
    companyDomains:
      response.company_domains.length > 0 ? [...response.company_domains] : [''],
    personalAccountPolicy: response.personal_account_policy,
    rawRetentionDays: String(response.raw_retention_days),
  };
}

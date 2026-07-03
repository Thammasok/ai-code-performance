import { useId, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { Button, ErrorState, Spinner } from '@/components/ui';
import { getApiClient, isApiError } from '@/lib/api';
import type { GovernancePolicyResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  DEFAULT_FORM_VALUES,
  PERSONAL_ACCOUNT_POLICIES,
  RETENTION_MAX,
  RETENTION_MIN,
  formValuesFromResponse,
  validatePolicyForm,
  type PolicyFormErrors,
  type PolicyFormValues,
} from './policy-form';

/** Submission lifecycle. No auto-retry: `error` is terminal until the admin resubmits. */
type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: GovernancePolicyResponse }
  | { status: 'error'; error: unknown };

const POLICY_LABELS: Record<(typeof PERSONAL_ACCOUNT_POLICIES)[number], string> = {
  flag_only: 'Flag only (redact tokens, cost & project)',
  collect_full: 'Collect full usage',
};

const fieldClasses =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Turn an ApiError (or any thrown value) into a message tuned for this screen. */
function errorProps(error: unknown): { title: string; message: string } {
  if (isApiError(error)) {
    switch (error.kind) {
      case 'authorization':
        return {
          title: 'Not permitted',
          message:
            'Updating governance policy requires the platform_admin role. Your account does not have it.',
        };
      case 'auth':
        return {
          title: 'Session expired',
          message: 'Your session is no longer valid. Sign in again and retry.',
        };
      case 'validation':
        return {
          title: 'Rejected by server',
          message: error.message || 'The server rejected the submitted policy values.',
        };
      case 'rate_limit':
        return {
          title: 'Too many requests',
          message: 'The request was throttled. Wait a moment before submitting again.',
        };
      case 'network':
        return {
          title: 'Network error',
          message: 'Could not reach the server. Check your connection and submit again.',
        };
      default:
        return { title: 'Update failed', message: error.message || 'Unexpected error.' };
    }
  }
  return {
    title: 'Update failed',
    message: error instanceof Error ? error.message : 'Unexpected error.',
  };
}

/**
 * Governance policy editor form. Rendered only for platform admins (the route
 * guard and the parent screen both enforce this). Submits via
 * `updateGovernancePolicy`, which throws on any non-OK response — failures are
 * surfaced visibly and there is no silent retry.
 */
export function GovernancePolicyForm() {
  const [values, setValues] = useState<PolicyFormValues>(DEFAULT_FORM_VALUES);
  const [errors, setErrors] = useState<PolicyFormErrors>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' });

  const retentionId = useId();
  const policyId = useId();
  const domainsLabelId = useId();

  const submitting = submit.status === 'submitting';

  function updateDomain(index: number, value: string) {
    setValues((prev) => {
      const next = [...prev.companyDomains];
      next[index] = value;
      return { ...prev, companyDomains: next };
    });
  }

  function addDomain() {
    setValues((prev) => ({ ...prev, companyDomains: [...prev.companyDomains, ''] }));
  }

  function removeDomain(index: number) {
    setValues((prev) => {
      const next = prev.companyDomains.filter((_, i) => i !== index);
      // Keep one row so there is always an input to type into.
      return { ...prev, companyDomains: next.length > 0 ? next : [''] };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validatePolicyForm(values);
    if (!validation.ok) {
      setErrors(validation.errors);
      setSubmit({ status: 'idle' });
      return;
    }

    setErrors({});
    setSubmit({ status: 'submitting' });
    try {
      const result = await getApiClient().updateGovernancePolicy(validation.body);
      // Reflect the server's effective policy back into the form.
      setValues(formValuesFromResponse(result));
      setSubmit({ status: 'success', result });
    } catch (error) {
      // Fail visibly; do NOT auto-retry.
      setSubmit({ status: 'error', error });
    }
  }

  const domainErrors = errors.companyDomains ?? {};

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* Company domains ---------------------------------------------------- */}
      <fieldset className="space-y-3" aria-labelledby={domainsLabelId}>
        <legend id={domainsLabelId} className="text-sm font-medium text-foreground">
          Company domains
        </legend>
        <p className="text-sm text-muted-foreground">
          Email domains treated as company accounts. Other domains are classified
          as personal.
        </p>
        <ul className="space-y-2">
          {values.companyDomains.map((domain, index) => {
            const entryError = domainErrors[index];
            const errorId = entryError ? `${domainsLabelId}-err-${index}` : undefined;
            return (
              <li key={index} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => updateDomain(index, e.target.value)}
                    placeholder="example.com"
                    aria-label={`Company domain ${index + 1}`}
                    aria-invalid={entryError ? true : undefined}
                    aria-describedby={errorId}
                    className={cn(fieldClasses, entryError && 'border-destructive')}
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeDomain(index)}
                    disabled={submitting}
                    aria-label={`Remove company domain ${index + 1}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {entryError && (
                  <p id={errorId} className="text-sm text-destructive">
                    {entryError}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addDomain}
          disabled={submitting}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add domain
        </Button>
      </fieldset>

      {/* Personal account policy ------------------------------------------- */}
      <div className="space-y-2">
        <label htmlFor={policyId} className="block text-sm font-medium text-foreground">
          Personal account policy
        </label>
        <select
          id={policyId}
          value={values.personalAccountPolicy}
          onChange={(e) =>
            setValues((prev) => ({
              ...prev,
              // Value comes from a fixed option set; validation double-checks.
              personalAccountPolicy: e.target
                .value as PolicyFormValues['personalAccountPolicy'],
            }))
          }
          aria-invalid={errors.personalAccountPolicy ? true : undefined}
          aria-describedby={
            errors.personalAccountPolicy ? `${policyId}-err` : undefined
          }
          className={cn(
            fieldClasses,
            errors.personalAccountPolicy && 'border-destructive',
          )}
          disabled={submitting}
        >
          {PERSONAL_ACCOUNT_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {POLICY_LABELS[policy]}
            </option>
          ))}
        </select>
        {errors.personalAccountPolicy && (
          <p id={`${policyId}-err`} className="text-sm text-destructive">
            {errors.personalAccountPolicy}
          </p>
        )}
      </div>

      {/* Raw retention days ------------------------------------------------- */}
      <div className="space-y-2">
        <label
          htmlFor={retentionId}
          className="block text-sm font-medium text-foreground"
        >
          Raw retention (days)
        </label>
        <input
          id={retentionId}
          type="number"
          inputMode="numeric"
          min={RETENTION_MIN}
          max={RETENTION_MAX}
          step={1}
          value={values.rawRetentionDays}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, rawRetentionDays: e.target.value }))
          }
          aria-invalid={errors.rawRetentionDays ? true : undefined}
          aria-describedby={
            errors.rawRetentionDays ? `${retentionId}-err` : `${retentionId}-hint`
          }
          className={cn(
            fieldClasses,
            'max-w-40',
            errors.rawRetentionDays && 'border-destructive',
          )}
          disabled={submitting}
        />
        {errors.rawRetentionDays ? (
          <p id={`${retentionId}-err`} className="text-sm text-destructive">
            {errors.rawRetentionDays}
          </p>
        ) : (
          <p id={`${retentionId}-hint`} className="text-sm text-muted-foreground">
            How long raw events are kept before pruning ({RETENTION_MIN}–
            {RETENTION_MAX}).
          </p>
        )}
      </div>

      {/* Submit ------------------------------------------------------------- */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner size="sm" className="text-current" />}
          {submitting ? 'Saving…' : 'Save policy'}
        </Button>
      </div>

      {/* Result feedback ---------------------------------------------------- */}
      {submit.status === 'error' && (
        <ErrorState {...errorProps(submit.error)} />
      )}

      {submit.status === 'success' && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground"
        >
          <CheckCircle2
            className="mt-0.5 h-5 w-5 text-primary"
            aria-hidden="true"
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Policy updated.</p>
            <p className="text-muted-foreground">
              Last updated{' '}
              <time dateTime={submit.result.updated_at}>
                {new Date(submit.result.updated_at).toLocaleString()}
              </time>{' '}
              by <span className="font-medium">{submit.result.updated_by}</span>.
            </p>
          </div>
        </div>
      )}
    </form>
  );
}

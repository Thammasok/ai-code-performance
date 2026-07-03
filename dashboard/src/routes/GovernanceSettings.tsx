import { ErrorState } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-context';
import { GovernancePolicyForm } from '@/features/governance/GovernancePolicyForm';

/**
 * Governance policy editor (platform_admin only), route "/settings/governance".
 *
 * The route is already role-guarded by <RequireRole platform_admin> in App.tsx.
 * This component re-checks the role as defense-in-depth: if it is ever rendered
 * for a non-admin, it shows an authorization error instead of the editable form.
 */
export function GovernanceSettings() {
  const { user } = useAuth();

  if (!user || user.role !== 'platform_admin') {
    return (
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Governance</h1>
        </header>
        <ErrorState
          title="Not permitted"
          message="Governance policy settings require the platform_admin role."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Governance</h1>
        <p className="text-muted-foreground">
          Configure account classification and data-retention policy. Changes
          apply without a redeploy.
        </p>
      </header>
      <div className="max-w-2xl">
        <GovernancePolicyForm />
      </div>
    </section>
  );
}

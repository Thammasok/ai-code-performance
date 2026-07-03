import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Activity, LogOut, User } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { useAuth, type AuthUser, type Role } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  /** When set, the link only shows for users whose role is included. */
  roles?: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/settings', label: 'Settings', end: true },
  {
    to: '/settings/governance',
    label: 'Governance',
    end: false,
    roles: ['platform_admin'],
  },
  {
    to: '/audit',
    label: 'Audit',
    end: false,
    roles: ['platform_admin', 'auditor'],
  },
];

/** Human-readable labels for the RBAC roles (ADR-005). */
const ROLE_LABELS: Record<Role, string> = {
  developer: 'Developer',
  manager: 'Manager',
  platform_admin: 'Platform Admin',
  auditor: 'Auditor',
};

/** Dropdown user menu showing identity + role and a sign-out action. */
function UserMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm" aria-label="Account menu">
          <User className="h-4 w-4" aria-hidden="true" />
          <span className="ml-1.5 hidden max-w-[10rem] truncate sm:inline">
            {user.email}
          </span>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border border-border bg-card p-1 text-card-foreground shadow-md"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={onSignOut}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** App shell: top bar with role-gated nav, theme toggle, user menu, and outlet. */
export function RootLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Defense-in-depth: only surface links the current role may use. The server
  // remains the authority; guards still enforce access if a URL is entered.
  const visibleNav = NAV.filter(
    (item) => !item.roles || (user !== null && item.roles.includes(user.role)),
  );

  function handleSignOut() {
    signOut();
    navigate('/sign-in', { replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <span className="flex shrink-0 items-center gap-2 font-semibold">
            <Activity className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">AI Usage</span>
          </span>

          <nav
            className="flex flex-1 items-center gap-1 overflow-x-auto"
            aria-label="Primary"
          >
            {visibleNav.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {user && <UserMenu user={user} onSignOut={handleSignOut} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

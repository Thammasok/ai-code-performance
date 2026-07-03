import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { RequireAuth, RequireRole } from '@/lib/auth/guards';
import { RootLayout } from '@/layouts/RootLayout';
import { DashboardHome } from '@/routes/DashboardHome';
import { Settings } from '@/routes/Settings';
import { GovernanceSettings } from '@/routes/GovernanceSettings';
import { AuditLog } from '@/routes/AuditLog';
import { SignIn } from '@/routes/SignIn';
import { NotFound } from '@/routes/NotFound';

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public route */}
            <Route path="/sign-in" element={<SignIn />} />

            {/* Everything below requires an authenticated session */}
            <Route element={<RequireAuth />}>
              <Route element={<RootLayout />}>
                <Route index element={<DashboardHome />} />
                <Route path="settings" element={<Settings />} />

                {/* Governance editing — platform_admin only */}
                <Route element={<RequireRole roles={['platform_admin']} />}>
                  <Route
                    path="settings/governance"
                    element={<GovernanceSettings />}
                  />
                </Route>

                {/* Audit log — platform_admin + auditor */}
                <Route
                  element={
                    <RequireRole roles={['platform_admin', 'auditor']} />
                  }
                >
                  <Route path="audit" element={<AuditLog />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

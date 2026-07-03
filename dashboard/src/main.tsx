import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setTokenGetter } from '@/lib/api';
import { getAuthToken } from '@/lib/auth/token-store';
import './index.css';

// Wire the API client (T-002) to the auth token store (T-003) so every
// authenticated request carries the current bearer token from one source of truth.
setTokenGetter(getAuthToken);

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

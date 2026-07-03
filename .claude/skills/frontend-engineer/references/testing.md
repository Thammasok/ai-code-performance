# Testing Reference

## Test structure conventions

```
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx        ← co-located unit test
├── hooks/
│   ├── useUsers.ts
│   └── useUsers.test.ts
└── lib/
    └── utils.test.ts

tests/
├── e2e/
│   ├── auth.spec.ts           ← Playwright E2E
│   └── checkout.spec.ts
└── integration/
    └── createUser.test.tsx    ← full form integration test

src/stories/
├── Button.stories.tsx         ← Storybook
└── UserCard.stories.tsx
```

---

## React Testing Library (RTL)

### Setup

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});

// tests/setup.ts
import '@testing-library/jest-dom';
```

### Component unit test (Arrange / Act / Assert)

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateUserForm } from './CreateUserForm';

describe('CreateUserForm', () => {
  it('shows validation error when email is invalid', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CreateUserForm onSubmit={vi.fn()} />);

    // Act
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email/i);
  });

  it('calls onSubmit with valid data', async () => {
    // Arrange
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateUserForm onSubmit={onSubmit} />);

    // Act
    await user.type(screen.getByLabelText(/name/i),  'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    // Assert
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'Alice', email: 'alice@example.com',
    }));
  });

  it('disables submit while pending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => new Promise(r => setTimeout(r, 1000)));
    render(<CreateUserForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/name/i),  'Bob');
    await user.type(screen.getByLabelText(/email/i), 'bob@example.com');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
```

### Testing with TanStack Query

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../mocks/server'; // MSW
import { http, HttpResponse } from 'msw';

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

it('displays users from API', async () => {
  server.use(
    http.get('/api/users', () =>
      HttpResponse.json([{ id: '1', name: 'Alice' }])
    )
  );
  renderWithQuery(<UserList />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();
});
```

### MSW setup (Mock Service Worker)

```ts
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () =>
    HttpResponse.json([{ id: '1', name: 'Alice', email: 'alice@example.com' }])
  ),
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: '2', ...body }, { status: 201 });
  }),
];

// tests/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);

// tests/setup.ts
beforeAll(()  => server.listen({ onUnhandledRequest: 'error' }));
afterEach(()  => server.resetHandlers());
afterAll(()   => server.close());
```

### Custom hook testing

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useUsers } from './useUsers';

it('returns users on success', async () => {
  const { result } = renderHook(() => useUsers({}), { wrapper: QueryWrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(1);
});
```

---

## Playwright E2E

```ts
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can log in with valid credentials', async ({ page }) => {
    // Arrange
    await page.goto('/login');

    // Act
    await page.getByLabel('Email').fill('alice@example.com');
    await page.getByLabel('Password').fill('secret123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Assert
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(/invalid credentials/i);
  });
});
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
});
```

---

## Storybook

```tsx
// components/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['default', 'destructive', 'outline', 'ghost'] },
    size:    { control: 'radio',  options: ['sm', 'md', 'lg'] },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default:     Story = { args: { children: 'Click me' } };
export const Destructive: Story = { args: { children: 'Delete', variant: 'destructive' } };
export const Loading:     Story = { args: { children: 'Saving…', disabled: true } };
```

---

## Accessibility testing

```tsx
// RTL: use getByRole — exercises ARIA tree
screen.getByRole('button', { name: /submit/i });
screen.getByRole('textbox', { name: /email/i });
screen.getByRole('dialog', { name: /confirm delete/i });

// Automated a11y: axe-core
import { axe } from 'jest-axe';
it('has no accessibility violations', async () => {
  const { container } = render(<MyForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

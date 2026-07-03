# Data Fetching Reference

## Server-side fetch (Server Components — preferred)

```tsx
// Cached by default (Next.js extends fetch)
async function getUser(id: string) {
  const res = await fetch(`${process.env.API_URL}/users/${id}`, {
    next: { revalidate: 60 },   // ISR: revalidate every 60s
    // next: { tags: ['user', id] } // on-demand revalidation
  });
  if (!res.ok) {
    if (res.status === 404) notFound();
    throw new Error(`Failed to fetch user: ${res.status}`);
  }
  return res.json() as Promise<User>;
}

// Parallel fetching — avoid sequential waterfalls
export default async function DashboardPage() {
  const [user, orders, analytics] = await Promise.all([
    getUser(userId),
    getOrders(userId),
    getAnalytics(userId),
  ]);
  return <Dashboard user={user} orders={orders} analytics={analytics} />;
}
```

---

## TanStack Query (Client Components — mutations, polling, optimistic updates)

### Setup

```tsx
// app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:  60 * 1000,   // 1 min
        gcTime:     5  * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));
  return (
    <QueryClientProvider client={client}>
      {children}
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}
```

### Typed query hooks

```tsx
// hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const userKeys = {
  all:    ['users']          as const,
  list:   (filters: string) => ['users', 'list', filters] as const,
  detail: (id: string)      => ['users', 'detail', id]    as const,
};

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(JSON.stringify(filters)),
    queryFn:  () => api.users.list(filters),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn:  () => api.users.get(id),
    enabled:  !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserDto) => api.users.create(data),
    onSuccess: (newUser) => {
      // Optimistic: update list cache immediately
      queryClient.setQueryData(userKeys.detail(newUser.id), newUser);
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
```

### Optimistic updates

```tsx
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.users.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: userKeys.all });
      const snapshot = queryClient.getQueryData(userKeys.all);
      queryClient.setQueryData(userKeys.all, (old: User[]) =>
        old.filter(u => u.id !== id)
      );
      return { snapshot }; // rollback context
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(userKeys.all, ctx?.snapshot);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
```

---

## Typed API client

```ts
// lib/api.ts
class ApiClient {
  private base: string;

  constructor(base: string) { this.base = base; }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.message ?? res.statusText);
    }
    return res.json() as Promise<T>;
  }

  users = {
    list:   (filters?: UserFilters) =>
              this.request<User[]>(`/users?${new URLSearchParams(filters as any)}`),
    get:    (id: string)            => this.request<User>(`/users/${id}`),
    create: (body: CreateUserDto)   =>
              this.request<User>('/users', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string)            =>
              this.request<void>(`/users/${id}`, { method: 'DELETE' }),
  };
}

export const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL!);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
```

---

## Pagination with TanStack Query

```tsx
function useUsersPaginated(page: number) {
  return useQuery({
    queryKey: userKeys.list(`page=${page}`),
    queryFn:  () => api.users.list({ page, limit: 20 }),
    placeholderData: keepPreviousData, // no flash on page change
  });
}

// Infinite scroll
function useUsersInfinite() {
  return useInfiniteQuery({
    queryKey: userKeys.all,
    queryFn:  ({ pageParam = 1 }) => api.users.list({ page: pageParam }),
    getNextPageParam: (last, all) => last.hasMore ? all.length + 1 : undefined,
    initialPageParam: 1,
  });
}
```

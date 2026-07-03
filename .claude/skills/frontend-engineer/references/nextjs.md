# Next.js App Router Reference

## Server vs Client Component decision tree

```
Does it use: onClick, onChange, hooks (useState/useEffect),
             browser APIs (window, localStorage), animations?
  YES → 'use client'
  NO  → Server Component (default, no directive needed)
```

Push `'use client'` as far down the tree as possible — keep Server Components as the
outer shell, Client Components as small interactive leaves.

---

## Server Component patterns

```tsx
// app/users/page.tsx — async Server Component
import { Suspense } from 'react';
import { UserList } from './_components/UserList';
import { UserListSkeleton } from './_components/UserListSkeleton';

export const metadata = {
  title: 'Users',
  description: 'Manage your team members',
};

export default function UsersPage() {
  return (
    <main>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      {/* Streaming: Suspense boundary per async section */}
      <Suspense fallback={<UserListSkeleton />}>
        <UserList />
      </Suspense>
    </main>
  );
}

// _components/UserList.tsx — also a Server Component
async function UserList() {
  const users = await db.user.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>
          {user.name}
          <DeleteUserButton userId={user.id} /> {/* Client island */}
        </li>
      ))}
    </ul>
  );
}
```

---

## Server Actions

```tsx
// app/users/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { createUserSchema } from '@/lib/validations';

export async function createUser(formData: FormData) {
  // 1. Auth check FIRST — always
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  // 2. Validate
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten() };

  // 3. Mutate
  await db.user.create({ data: parsed.data });

  // 4. Revalidate + redirect
  revalidatePath('/users');
  redirect('/users');
}

// In a Client Component:
'use client';
import { useActionState } from 'react'; // React 19
import { createUser } from '../actions';

export function CreateUserForm() {
  const [state, action, isPending] = useActionState(createUser, null);
  return (
    <form action={action}>
      <input name="name" required />
      <input name="email" type="email" required />
      {state?.error && <p role="alert">{state.error.formErrors[0]}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create User'}
      </button>
    </form>
  );
}
```

---

## Dynamic routes and params

```tsx
// app/posts/[slug]/page.tsx
interface PageProps {
  params: Promise<{ slug: string }>;        // Next.js 15+: params are async
  searchParams: Promise<{ page?: string }>;
}

export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);
  return {
    title: post.title,
    openGraph: { title: post.title, description: post.excerpt },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return <Article post={post} />;
}
```

---

## Route handlers (API routes)

```ts
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Number(searchParams.get('page') ?? '1');
  const users = await db.user.findMany({ skip: (page - 1) * 20, take: 20 });
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const user = await db.user.create({ data: parsed.data });
  return NextResponse.json(user, { status: 201 });
}
```

---

## Middleware (auth guard, redirects)

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');

  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/login'],
};
```

---

## Loading UI and Suspense streaming

```tsx
// app/dashboard/loading.tsx — automatic Suspense boundary
export default function Loading() {
  return (
    <div className="grid grid-cols-3 gap-6 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-muted" />
      ))}
    </div>
  );
}
```

---

## next.config.ts hardening

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: { typedRoutes: true },
  images: {
    remotePatterns: [{ hostname: 'res.cloudinary.com' }],
    formats: ['image/avif', 'image/webp'],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options',        value: 'DENY' },
        { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
export default config;
```

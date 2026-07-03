# Performance Reference

## Core Web Vitals targets

| Metric | Good   | Needs work | Poor   |
|--------|--------|------------|--------|
| LCP    | ≤2.5s  | ≤4.0s      | >4.0s  |
| INP    | ≤200ms | ≤500ms     | >500ms |
| CLS    | ≤0.1   | ≤0.25      | >0.25  |
| FCP    | ≤1.8s  | ≤3.0s      | >3.0s  |

---

## Image optimization

```tsx
// Always use next/image — never raw <img> for content images
import Image from 'next/image';

// Above the fold: priority + explicit dimensions
<Image
  src="/hero.jpg"
  alt="Product hero"
  width={1200}
  height={630}
  priority            // disables lazy loading, adds preload link
  className="w-full h-auto"
/>

// Below the fold: lazy (default)
<Image
  src={user.avatar}
  alt={user.name}
  width={48}
  height={48}
  className="rounded-full"
/>

// Dynamic width (fill mode)
<div className="relative aspect-video">
  <Image src={thumbnail} alt={title} fill className="object-cover rounded-lg" />
</div>
```

---

## Code splitting with dynamic imports

```tsx
import dynamic from 'next/dynamic';

// Heavy chart library — only load when needed
const Chart = dynamic(() => import('@/components/Chart'), {
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" />,
  ssr: false,  // client-only (uses canvas/WebGL)
});

// Modal — only load when opened
const HeavyModal = dynamic(() => import('./HeavyModal'));

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <HeavyModal onClose={() => setOpen(false)} />}  {/* loaded on first open */}
    </>
  );
}
```

---

## Memoization patterns

```tsx
// memo: prevent re-renders when props are shallow-equal
const UserCard = memo(function UserCard({ user }: { user: User }) {
  return <div>{user.name}</div>;
});

// When memo is worthwhile:
// ✅ Expensive render (large list item, complex chart)
// ✅ Parent re-renders frequently (context subscriber)
// ❌ Simple components that render fast anyway

// Stable callbacks to preserve memo
const Parent = () => {
  const handleDelete = useCallback((id: string) => {
    deleteUser(id);
  }, []); // stable ref → UserCard memo preserved

  return <UserCard user={user} onDelete={handleDelete} />;
};
```

---

## Bundle analysis

```bash
# Analyze bundle
ANALYZE=true next build

# Or with @next/bundle-analyzer
npm install @next/bundle-analyzer
```

```ts
// next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer';
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
export default withBundleAnalyzer({ /* config */ });
```

**Common bundle fixes:**

| Problem | Fix |
|---|---|
| `moment` (330KB) | Replace with `date-fns` or `dayjs` |
| Importing all of `lodash` | `import debounce from 'lodash/debounce'` |
| Large icon library | Tree-shake: `import { X } from 'lucide-react'` |
| `recharts` on every page | `dynamic(() => import('./Chart'), { ssr: false })` |

---

## Virtualization for long lists

```tsx
// npm install @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: User[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count:           items.length,
    getScrollElement: () => parentRef.current,
    estimateSize:    () => 72, // estimated row height in px
    overscan:        5,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: virtual.getTotalSize() }} className="relative">
        {virtual.getVirtualItems().map(row => (
          <div
            key={row.index}
            style={{ transform: `translateY(${row.start}px)` }}
            className="absolute w-full"
          >
            <UserRow user={items[row.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Font optimization (Next.js)

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono  = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

---

## Preventing CLS (layout shift)

```tsx
// Reserve space for async content — never let elements appear and push content
<div className="min-h-[120px]">   {/* reserve height */}
  <Suspense fallback={<Skeleton className="h-[120px]" />}>
    <AsyncContent />
  </Suspense>
</div>

// Aspect ratio for images/embeds
<div className="aspect-video">
  <Image fill src={src} alt={alt} className="object-cover" />
</div>
```

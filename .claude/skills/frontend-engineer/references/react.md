# React Patterns Reference

## Custom hooks

Extract stateful logic into hooks — never repeat `useState` + `useEffect` pairs inline.

```tsx
// hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// hooks/useLocalStorage.ts
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [stored, setStored] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStored(prev => {
      const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value;
      window.localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  return [stored, setValue] as const;
}
```

---

## useReducer for complex state machines

```tsx
type CartState = {
  items: CartItem[];
  coupon: string | null;
};

type CartAction =
  | { type: 'ADD_ITEM';    item: CartItem }
  | { type: 'REMOVE_ITEM'; id: string }
  | { type: 'APPLY_COUPON'; code: string }
  | { type: 'CLEAR' };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.item] };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.id) };
    case 'APPLY_COUPON':
      return { ...state, coupon: action.code };
    case 'CLEAR':
      return { items: [], coupon: null };
  }
}
```

---

## Context: only for low-frequency, wide-scope state

Context re-renders every consumer on every change. Use it for theme, locale, auth user —
NOT for frequently-updated state (use Zustand for that).

```tsx
interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const toggleTheme = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), []);
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

---

## Zustand for client-side global state

```tsx
// stores/useCartStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  total: () => number;
}

export const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        addItem: (item) => set(s => ({ items: [...s.items, item] })),
        removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
        clearCart: () => set({ items: [] }),
        total: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
      }),
      { name: 'cart-storage' }
    )
  )
);
```

---

## Compound component pattern

```tsx
// components/ui/Card.tsx
interface CardProps { children: React.ReactNode; className?: string }

function Card({ children, className }: CardProps) {
  return <div className={cn('rounded-xl border bg-card p-6', className)}>{children}</div>;
}

Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between mb-4">{children}</div>;
};
Card.Title = function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold">{children}</h3>;
};
Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
};

export { Card };
```

---

## Render prop / headless pattern

```tsx
// For logic-sharing without UI coupling
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  renderToolbar?: (table: Table<T>) => React.ReactNode;
}

// slots pattern (more React-idiomatic than render props in modern code)
interface DialogProps {
  trigger: React.ReactNode;    // slot
  title: string;
  children: React.ReactNode;   // content slot
  footer?: React.ReactNode;    // optional slot
}
```

---

## useMemo and useCallback — when to use

```tsx
// ✅ useMemo: expensive derivation, complex object/array used as dependency
const filteredUsers = useMemo(
  () => users.filter(u => u.role === selectedRole),
  [users, selectedRole]
);

// ✅ useCallback: function passed to memoized child or used in dependency array
const handleSubmit = useCallback(async (data: FormData) => {
  await createUser(data);
}, []); // stable reference prevents child re-renders

// ❌ Don't memo-ize everything — profile first, optimize second
// Premature memoization adds overhead without benefit
```

---

## Error boundaries

```tsx
// app/error.tsx (Next.js App Router built-in)
'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center gap-4 p-8">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="btn-primary">Try again</button>
    </div>
  );
}
```

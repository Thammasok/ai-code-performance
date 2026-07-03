# Styling Reference

## Tailwind CSS conventions

```tsx
// Always use cn() for conditional classes — never string concatenation
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?:    'sm' | 'md' | 'lg';
}

const buttonVariants = cva(
  // base
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:     'border border-input bg-background hover:bg-accent',
        ghost:       'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'h-8  px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

---

## CSS Modules (when Tailwind isn't enough)

```tsx
// components/Sparkline.module.css
.container { position: relative; overflow: hidden; }
.line { stroke: var(--color-primary); stroke-width: 2; fill: none; }
.area { fill: url(#gradient); opacity: 0.15; }

// Component
import styles from './Sparkline.module.css';
<svg className={styles.container}>…</svg>
```

---

## shadcn/ui — extend, don't override

Install components into your repo — they're yours to modify.

```bash
npx shadcn@latest add button dialog table form
```

```tsx
// Extend shadcn components via className prop (no wrapper needed)
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function ConfirmDialog({ open, onOpenChange, onConfirm, message }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Framer Motion

```tsx
'use client';
import { motion, AnimatePresence } from 'framer-motion';

// Fade + slide in
const fadeIn = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeIn}>
      {children}
    </motion.div>
  );
}

// List with staggered children
const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
};

export function AnimatedList({ items }: { items: string[] }) {
  return (
    <motion.ul variants={container} initial="hidden" animate="visible">
      {items.map(i => (
        <motion.li key={i} variants={item}>{i}</motion.li>
      ))}
    </motion.ul>
  );
}

// Presence animation (mount/unmount)
export function Toast({ show, message }: { show: boolean; message: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{    opacity: 0, y: 20 }}
          role="status"
          aria-live="polite"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Reduced motion: always respect user preference
import { useReducedMotion } from 'framer-motion';

function AnimatedCard() {
  const reduce = useReducedMotion();
  return (
    <motion.div animate={{ y: reduce ? 0 : -4 }} whileHover={{ y: reduce ? 0 : -8 }}>
      …
    </motion.div>
  );
}
```

---

## Responsive design conventions

```tsx
// Mobile-first, breakpoint scale: sm(640) md(768) lg(1024) xl(1280) 2xl(1536)
<div className="
  grid grid-cols-1
  sm:grid-cols-2
  lg:grid-cols-3
  gap-4 md:gap-6
">
```

---

## Dark mode

```tsx
// tailwind.config.ts
export default {
  darkMode: 'class',  // or 'media'
  // …
};

// Use semantic CSS variables (shadcn convention):
// bg-background, text-foreground, border-border, bg-muted, text-muted-foreground
// These swap automatically between light/dark themes.
```

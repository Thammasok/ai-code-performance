# Accessibility Reference

## WCAG 2.1 AA checklist (minimum bar for production)

- **1.4.3** Text contrast ≥ 4.5:1 (3:1 for large text ≥18px/14px bold)
- **1.4.11** UI component contrast ≥ 3:1 against adjacent colors
- **2.1.1** All functionality operable by keyboard
- **2.4.3** Focus order is logical (matches visual/DOM order)
- **2.4.7** Focus indicator is visible (never `outline: none` without a replacement)
- **3.3.1** Error identification: describe what's wrong, not just "invalid"
- **4.1.2** All interactive elements have name + role + state/value

---

## Semantic HTML first

```tsx
// ✅ Semantic — screen readers announce role automatically
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</nav>

<main>
  <h1>Page Title</h1>
  <article>…</article>
</main>

<footer>…</footer>

// ❌ Div soup — forces ARIA workaround
<div class="nav"><div class="link" onclick="…">Dashboard</div></div>
```

---

## Accessible interactive patterns

### Button vs link

```tsx
// Use <a> for navigation (changes URL)
<a href="/posts/1">Read article</a>

// Use <button> for actions (doesn't navigate)
<button onClick={handleDelete}>Delete</button>
<button type="submit">Save</button>

// Never: <div onClick={…}> — not keyboard reachable, no role, no enter/space
```

### Icon-only buttons

```tsx
<button
  aria-label="Close dialog"
  onClick={onClose}
  className="focus-visible:ring-2"
>
  <X aria-hidden="true" className="h-4 w-4" />
</button>
```

### Toggle buttons

```tsx
<button
  aria-pressed={isLiked}
  onClick={() => setIsLiked(v => !v)}
>
  {isLiked ? 'Unlike' : 'Like'}
</button>
```

### Expandable sections

```tsx
<button
  aria-expanded={isOpen}
  aria-controls="section-content"
  onClick={() => setIsOpen(v => !v)}
>
  {isOpen ? 'Collapse' : 'Expand'} Details
</button>
<div id="section-content" hidden={!isOpen}>
  …
</div>
```

---

## Focus management

```tsx
// Focus trap inside modal (use Radix Dialog — it handles this)
// If building custom: use focus-trap-react or the Floating UI useFocusTrap

// Return focus when modal closes
'use client';
export function Modal({ isOpen, onClose, children }: ModalProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      prevFocusRef.current = document.activeElement;
    } else {
      (prevFocusRef.current as HTMLElement)?.focus();
    }
  }, [isOpen]);

  // …
}

// Skip navigation link (must be first element in body)
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-white px-4 py-2 rounded"
>
  Skip to main content
</a>
<main id="main-content" tabIndex={-1}>…</main>
```

---

## Live regions for dynamic content

```tsx
// Announce changes without moving focus
<p aria-live="polite" aria-atomic="true" className="sr-only">
  {statusMessage}   {/* update this string to announce */}
</p>

// For urgent interruptions (errors):
<p aria-live="assertive" role="alert">
  {errorMessage}
</p>

// Toast notifications — always use role="status" or role="alert"
<div role="status" aria-live="polite">
  {toasts.map(t => <Toast key={t.id} {...t} />)}
</div>
```

---

## Form accessibility

```tsx
// Every input needs a visible label — not just placeholder
<div>
  <label htmlFor="email" className="block text-sm font-medium mb-1">
    Email address
    <span aria-hidden="true" className="text-destructive"> *</span>
    <span className="sr-only"> (required)</span>
  </label>
  <input
    id="email"
    type="email"
    required
    aria-required="true"
    aria-describedby={error ? 'email-error' : 'email-hint'}
    aria-invalid={!!error}
    className={cn('input', error && 'border-destructive')}
  />
  <p id="email-hint" className="text-xs text-muted-foreground mt-1">
    We'll never share your email.
  </p>
  {error && (
    <p id="email-error" role="alert" className="text-xs text-destructive mt-1">
      {error}
    </p>
  )}
</div>
```

---

## Screen-reader-only utility

```tsx
// Tailwind class: sr-only
// Hides visually but keeps in accessibility tree

<span className="sr-only">Loading user profile…</span>

// For meaningful icons next to text — hide the icon, not the text
<button>
  <Trash2 aria-hidden="true" className="h-4 w-4 mr-2" />
  Delete account
</button>
```

---

## Keyboard navigation for custom widgets

```tsx
// Arrow-key navigation in a listbox
function Listbox({ options, value, onChange }: ListboxProps) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(options[Math.min(index + 1, options.length - 1)]);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(options[Math.max(index - 1, 0)]);
    }
    if (e.key === 'Home') { e.preventDefault(); onChange(options[0]); }
    if (e.key === 'End')  { e.preventDefault(); onChange(options.at(-1)!); }
  };

  return (
    <ul role="listbox" aria-label="Select option">
      {options.map((opt, i) => (
        <li
          key={opt.value}
          role="option"
          aria-selected={value === opt.value}
          tabIndex={value === opt.value ? 0 : -1}
          onClick={() => onChange(opt)}
          onKeyDown={e => handleKeyDown(e, i)}
        >
          {opt.label}
        </li>
      ))}
    </ul>
  );
}
```

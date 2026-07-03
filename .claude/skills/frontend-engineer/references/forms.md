# Forms & Validation Reference

## Zod schema-first approach

Define schemas once — use for both client validation and Server Action parsing.

```ts
// lib/validations.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Invalid email address'),
  role:     z.enum(['admin', 'editor', 'viewer']),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
```

---

## React Hook Form + Zod resolver

```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, type CreateUserDto } from '@/lib/validations';
import { useCreateUser } from '@/hooks/useUsers';

export function CreateUserForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<CreateUserDto>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'viewer' },
  });

  const { mutateAsync: createUser } = useCreateUser();

  const onSubmit = async (data: CreateUserDto) => {
    try {
      await createUser(data);
      reset();
    } catch (err) {
      // Map API errors back to form fields
      if (err instanceof ApiError && err.status === 409) {
        setError('email', { message: 'Email already in use' });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="name">Full name</label>
        <input id="name" type="text" aria-describedby="name-error" {...register('name')} />
        {errors.name && (
          <p id="name-error" role="alert" className="text-destructive text-sm">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" aria-describedby="email-error" {...register('email')} />
        {errors.email && (
          <p id="email-error" role="alert" className="text-destructive text-sm">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="role">Role</label>
        <select id="role" {...register('role')}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create user'}
      </button>
    </form>
  );
}
```

---

## Controlled multi-step form

```tsx
'use client';

type Step = 'account' | 'profile' | 'review';

const steps: Step[] = ['account', 'profile', 'review'];

export function MultiStepForm() {
  const [step, setStep] = useState<Step>('account');
  const methods = useForm<FullFormData>({ resolver: zodResolver(fullSchema) });

  const currentIndex = steps.indexOf(step);
  const isLast = currentIndex === steps.length - 1;

  const next = async () => {
    const fields = stepFields[step];
    const valid = await methods.trigger(fields);
    if (valid) setStep(steps[currentIndex + 1]);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onFinalSubmit)}>
        <StepIndicator current={currentIndex} total={steps.length} />
        {step === 'account' && <AccountStep />}
        {step === 'profile' && <ProfileStep />}
        {step === 'review'  && <ReviewStep />}
        <div className="flex gap-2">
          {currentIndex > 0 && (
            <button type="button" onClick={() => setStep(steps[currentIndex - 1])}>
              Back
            </button>
          )}
          {isLast
            ? <button type="submit">Submit</button>
            : <button type="button" onClick={next}>Next</button>
          }
        </div>
      </form>
    </FormProvider>
  );
}
```

---

## File upload with validation

```tsx
const uploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine(f => f.size <= 5 * 1024 * 1024, 'Max file size is 5MB')
    .refine(
      f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
      'Only JPEG, PNG, and WebP are allowed'
    ),
});

// In component:
const { register } = useForm<{ file: File }>({
  resolver: zodResolver(uploadSchema),
});

<input
  type="file"
  accept="image/jpeg,image/png,image/webp"
  {...register('file', { setValueAs: (v: FileList) => v[0] })}
/>
```

---

## Form with Server Action (progressive enhancement)

```tsx
// Works without JS (form POST), enhanced with JS when available
'use client';
import { useActionState } from 'react';
import { createUser } from '../actions';

export function ServerActionForm() {
  const [state, formAction, isPending] = useActionState(createUser, {
    errors: null,
    message: null,
  });

  return (
    <form action={formAction}>
      <input name="name"  required />
      <input name="email" type="email" required />
      {state.errors?.name && (
        <p role="alert">{state.errors.name[0]}</p>
      )}
      <button aria-disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
```

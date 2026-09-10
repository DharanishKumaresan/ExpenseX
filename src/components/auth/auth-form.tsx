'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { signIn, signUp } from '@/server/actions/auth';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/ui/primitives';

/**
 * Sign in / sign up.
 *
 * One component for both modes: the fields and the failure handling are
 * identical, and keeping them together stops the two screens drifting apart.
 * Field-level errors come back from the same Zod schemas the server enforces.
 */
export function AuthForm({ mode, next }: { mode: 'signin' | 'signup'; next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSignUp = mode === 'signup';

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = isSignUp ? await signUp(formData) : await signIn(formData);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      router.push(result.data.redirectTo);
      // The layout reads the session on the server; refresh so the shell
      // renders with the signed-in user rather than a stale anonymous tree.
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <p className="ex-label">{isSignUp ? 'Create account' : 'Welcome back'}</p>
        <h1 className="text-[2rem] leading-[1.05] font-bold tracking-[-0.035em] text-ink sm:text-[2.5rem]">
          {isSignUp ? (
            <>
              <span className="block font-normal text-ink-faint">Start tracking</span>
              your money
            </>
          ) : (
            <>
              <span className="block font-normal text-ink-faint">Sign in to</span>
              ExpenseX
            </>
          )}
        </h1>
      </header>

      {formError ? <ErrorNote title="Could not continue" message={formError} /> : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {isSignUp ? (
          <Field label="Your name" htmlFor="name" required error={fieldErrors.name}>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              placeholder="Dharanish"
              aria-invalid={Boolean(fieldErrors.name)}
            />
          </Field>
        ) : null}

        <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete={isSignUp ? 'email' : 'username'}
            required
            maxLength={254}
            placeholder="you@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          error={fieldErrors.password}
          hint={isSignUp ? 'At least 10 characters. A short phrase works well.' : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            minLength={isSignUp ? 10 : undefined}
            maxLength={200}
            placeholder="••••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>

        <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
          {isSignUp ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="text-[0.875rem] text-ink-3">
        {isSignUp ? 'Already have an account? ' : 'New here? '}
        <Link
          href={isSignUp ? '/login' : '/signup'}
          className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
        >
          {isSignUp ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}

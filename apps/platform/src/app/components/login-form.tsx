'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email');
    const password = formData.get('password');
    const result = await signIn('credentials', {
      callbackUrl: '/dashboard',
      email: typeof email === 'string' ? email : '',
      password: typeof password === 'string' ? password : '',
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setErrorMessage('Email or password is incorrect.');
      return;
    }

    router.replace(result.url ?? '/dashboard');
    router.refresh();
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium text-slate-800" htmlFor="email">
        Email
        <input
          autoComplete="email"
          className="rounded-lg border border-slate-300 px-3 py-2 text-slate-950"
          id="email"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-800" htmlFor="password">
        Password
        <input
          autoComplete="current-password"
          className="rounded-lg border border-slate-300 px-3 py-2 text-slate-950"
          id="password"
          name="password"
          required
          type="password"
        />
      </label>
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      <button
        className="rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

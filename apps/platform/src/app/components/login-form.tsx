'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { withAppBasePath } from '@/lib/app-path';

export function LoginForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email');
    const password = formData.get('password');
    const result = await signIn('credentials', {
      callbackUrl: withAppBasePath('/dashboard'),
      email: typeof email === 'string' ? email : '',
      password: typeof password === 'string' ? password : '',
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setErrorMessage('Email or password is incorrect.');
      return;
    }

    router.replace(result.url ?? withAppBasePath('/dashboard'));
    router.refresh();
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium text-slate-300" htmlFor="email">
        Email address
        <input
          autoComplete="email"
          className="h-12 rounded-xl border border-slate-300/15 bg-[#06111a]/95 px-4 text-sm text-white shadow-inner shadow-black/30 outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:ring-4 focus:ring-sky-400/10"
          id="email"
          name="email"
          placeholder="Enter your email"
          required
          type="email"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-300" htmlFor="password">
        Password
        <span className="flex h-12 overflow-hidden rounded-xl border border-slate-300/15 bg-[#06111a]/95 shadow-inner shadow-black/30 transition focus-within:border-sky-300/60 focus-within:ring-4 focus-within:ring-sky-400/10">
          <input
            autoComplete="current-password"
            className="min-w-0 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-slate-500"
            id="password"
            name="password"
            placeholder="Enter password"
            required
            type={isPasswordVisible ? 'text' : 'password'}
          />
          <button
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            className="border-l border-slate-400/10 px-3 text-xs font-medium text-sky-200 transition hover:bg-white/5 hover:text-white"
            onClick={() => setIsPasswordVisible((current) => !current)}
            type="button"
          >
            {isPasswordVisible ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      {errorMessage ? (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</p>
      ) : null}
      <button
        className="mt-2 h-12 rounded-xl border border-slate-300/30 bg-linear-to-b from-slate-400/60 via-[#121b25] to-[#07111b] text-sm font-semibold text-white shadow-lg shadow-black/35 transition hover:from-slate-300/70 hover:via-[#17232f] hover:to-[#0a1621] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="mt-1 text-center text-xs leading-5 text-slate-400">
        <span aria-hidden="true" className="mr-2 text-sky-300">
          ◈
        </span>
        Confidential workspace. Authorized access only.
      </p>
    </form>
  );
}

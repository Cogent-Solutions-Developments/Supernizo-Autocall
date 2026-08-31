import { LoginForm } from '@/app/components/login-form';

export const metadata = {
  title: 'Sign in | Supernizo Autocall',
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.2em] text-blue-600 uppercase">
          Supernizo Autocall
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Staff sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use your provisioned staff account to access the dashboard.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}

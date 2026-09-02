import Image from 'next/image';

import { AuthClientProvider } from '@/app/components/auth-client-provider';
import { LoginForm } from '@/app/components/login-form';
import loginBackground from '@/assets/loging  background.webp';
import supernizoLogo from '@/assets/logo-transparent.png';

export const metadata = {
  title: 'Sign in | Supernizo Autocall',
};

export default function LoginPage() {
  return (
    <main className="relative grid h-dvh min-h-screen place-items-center overflow-hidden bg-[#071019] px-4 py-5 sm:px-6 sm:py-8">
      <Image
        alt=""
        className="object-cover opacity-20"
        fill
        priority
        sizes="100vw"
        src={loginBackground}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_8%,rgba(32,114,150,0.36),transparent_36%),radial-gradient(circle_at_15%_100%,rgba(10,62,84,0.28),transparent_34%)]" />
      <section className="relative w-full max-w-[28rem] overflow-hidden rounded-[1.6rem] border border-slate-200/45 bg-[radial-gradient(circle_at_82%_6%,rgba(28,105,140,0.54),transparent_38%),linear-gradient(135deg,rgba(25,36,46,0.91),rgba(7,18,27,0.9))] px-7 py-8 shadow-2xl shadow-black/60 backdrop-blur-xl sm:px-8 sm:py-9">
        <div className="mx-auto w-full max-w-[21rem]">
          <Image
            alt="Supernizo Autocall"
            className="mx-auto h-auto w-64 max-w-full"
            priority
            src={supernizoLogo}
          />
          <p className="mt-5 text-center text-base font-medium text-slate-300">
            Sign in for Visitor engagement
          </p>
          <AuthClientProvider>
            <LoginForm />
          </AuthClientProvider>
        </div>
      </section>
    </main>
  );
}

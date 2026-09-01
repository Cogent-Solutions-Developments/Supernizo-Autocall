import Image from 'next/image';

import loginAnimation from '@/assets/login animation.svg';
import loginBackground from '@/assets/loging  background.webp';
import supernizoLogo from '@/assets/logo-transparent.png';

export default function Loading() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#071019] px-5 py-8">
      <Image
        alt=""
        className="object-cover opacity-25"
        fill
        priority
        sizes="100vw"
        src={loginBackground}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_5%,rgba(35,119,153,0.38),transparent_35%)]" />
      <section className="relative grid w-full max-w-sm place-items-center rounded-[1.75rem] border border-slate-200/35 bg-[#0d1c26]/75 px-8 py-10 text-center shadow-2xl shadow-black/60 backdrop-blur-xl">
        <Image alt="Supernizo Autocall" className="h-auto w-56" priority src={supernizoLogo} />
        <Image
          alt="Loading"
          className="mt-5 h-40 w-40"
          priority
          src={loginAnimation}
          unoptimized
        />
        <p className="mt-1 text-sm font-medium text-slate-300">Preparing your workspace…</p>
      </section>
    </main>
  );
}

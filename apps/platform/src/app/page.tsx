const readinessItems = [
  'Next.js App Router application',
  'Strict TypeScript workspace',
  'Shared schemas and browser tracker package',
];

export default function DashboardLandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16 sm:px-10">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold tracking-[0.2em] text-blue-600 uppercase">
          Supernizo Autocall
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Visitor intelligence foundation is ready.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          The dashboard application is running. Tracking, realtime intelligence, chat, and browser
          calling will be added in their planned phases.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {readinessItems.map((item) => (
            <li key={item} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

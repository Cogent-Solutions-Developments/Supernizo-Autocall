export default function Loading() {
  return (
    <main className="workspace-theme grid min-h-dvh place-items-center bg-[#01040a] px-5">
      <div role="status" aria-live="polite" className="grid justify-items-center gap-4">
        <span aria-hidden="true" className="h-0.5 w-12 rounded-full bg-blue-500" />
        <p className="text-sm font-light text-muted">Loading your workspace…</p>
      </div>
    </main>
  );
}

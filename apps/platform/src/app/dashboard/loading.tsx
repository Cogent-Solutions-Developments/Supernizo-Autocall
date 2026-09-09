export default function WorkspaceLoading() {
  return (
    <section className="workspace-loading" aria-busy="true" aria-label="Loading workspace">
      <div className="workspace-skeleton h-4 w-28" />
      <div className="workspace-skeleton h-10 w-2/3 max-w-lg" />
      <div className="workspace-skeleton mt-8 h-16 w-full" />
      <div className="workspace-skeleton h-72 w-full" />
      <p className="text-sm text-muted">Loading your workspace…</p>
    </section>
  );
}

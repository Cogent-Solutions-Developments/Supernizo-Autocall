// Recheck open tabs as well as initial page loads. Never overlap requests.
export function watchSessionValidation(
  check: () => Promise<void>,
  host = window,
  visibility = document,
): () => void {
  let stopped = false;
  let pending = false;
  const refresh = async () => {
    if (stopped || pending) return;
    pending = true;
    try {
      await check();
    } catch {
      /* The caller owns error handling; keep retrying. */
    } finally {
      pending = false;
    }
  };
  const onVisible = () => {
    if (visibility.visibilityState === 'visible') void refresh();
  };
  const onFocus = () => {
    void refresh();
  };
  const timer = host.setInterval(onFocus, 15_000);
  host.addEventListener('focus', onFocus);
  host.addEventListener('online', onFocus);
  visibility.addEventListener('visibilitychange', onVisible);
  void refresh();
  return () => {
    stopped = true;
    host.clearInterval(timer);
    host.removeEventListener('focus', onFocus);
    host.removeEventListener('online', onFocus);
    visibility.removeEventListener('visibilitychange', onVisible);
  };
}

import { afterEach, expect, it, vi } from 'vitest';
import { watchSessionValidation } from './session-validation';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('checks on a timer and focus, suppresses overlap, retries failures and removes listeners', async () => {
  vi.useFakeTimers();
  const host = Object.assign(new EventTarget(), { setInterval, clearInterval });
  const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', host);
  vi.stubGlobal('document', visibility);
  let release = () => {};
  const check = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValue(undefined);
  const stop = watchSessionValidation(check);
  expect(check).toHaveBeenCalledTimes(1);
  host.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(15_000);
  expect(check).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(check).toHaveBeenCalledTimes(2);
  host.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  visibility.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  host.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(check).toHaveBeenCalledTimes(5);
  stop();
  host.dispatchEvent(new Event('focus'));
  visibility.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(check).toHaveBeenCalledTimes(5);
});

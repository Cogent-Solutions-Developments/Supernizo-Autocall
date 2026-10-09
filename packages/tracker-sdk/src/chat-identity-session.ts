// Keep the browser bundle independent of server/shared runtime modules.
export const CHAT_IDENTITY_TIMEOUT_MS = 45_000;

type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Only the header identity expires. The durable thread and messages stay available.
export class ChatIdentitySession {
  private lastSeenAt: number;
  private startedAt: string;

  public constructor(
    private readonly key: string,
    startedAt: string,
    private readonly storage?: SessionStorage,
    now = Date.now(),
  ) {
    this.startedAt = startedAt;
    this.lastSeenAt = now;
    try {
      const savedStart = storage?.getItem(`${key}:start`);
      const savedLastSeen = storage?.getItem(`${key}:last_seen`);
      if (savedStart && Date.parse(savedStart) > Date.parse(startedAt)) {
        this.startedAt = savedStart;
      }
      if (savedLastSeen && Number.isFinite(Number(savedLastSeen))) {
        this.lastSeenAt = Number(savedLastSeen);
      }
    } catch {
      // Storage restrictions must not break the host page.
    }
  }

  public currentStart(visible: boolean, now = Date.now()): string {
    if (visible) {
      if (now - this.lastSeenAt >= CHAT_IDENTITY_TIMEOUT_MS) {
        this.startedAt = new Date(Math.max(now, Date.parse(this.startedAt))).toISOString();
      }
      this.lastSeenAt = now;
    }
    try {
      this.storage?.setItem(`${this.key}:start`, this.startedAt);
      this.storage?.setItem(`${this.key}:last_seen`, String(this.lastSeenAt));
    } catch {
      // Keep the boundary in memory when session storage is unavailable.
    }
    return this.startedAt;
  }
}

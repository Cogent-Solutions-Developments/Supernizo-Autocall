import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceTrackingRateLimit } from '@/server/infrastructure/security/rate-limit';
import {
  saveVisitorContact,
  getVisitorContactPrompt,
} from '@/server/composition/chat/chat-contact-service';
import { ForbiddenError } from '@/server/domain/errors/app-error';
import { GET, POST } from './route';
vi.mock('@/server/infrastructure/security/rate-limit', () => ({
  enforceTrackingRateLimit: vi.fn(),
}));
vi.mock('@/server/composition/chat/chat-contact-service', () => ({
  saveVisitorContact: vi.fn(),
  getVisitorContactPrompt: vi.fn(),
}));
const context = {
  sitePublicKey: 'site_contact_local',
  visitorId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
};
const contact = { channel: 'EMAIL', email: 'visitor@example.com', consent: true };
function request(body: unknown, origin = 'https://site.example') {
  return new Request('http://localhost/api/chat/visitor/contact', {
    method: 'POST',
    headers: origin ? { origin } : {},
    body: JSON.stringify(body),
  });
}
describe('public visitor contact API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saveVisitorContact).mockResolvedValue({ saved: true });
  });
  it('validates and rate-limits before saving and returns no contact values', async () => {
    const response = await POST(request({ context, contact }));
    expect(response.status).toBe(200);
    expect(enforceTrackingRateLimit).toHaveBeenCalledWith(
      'https://site.example',
      'chat-contact-write',
    );
    expect(saveVisitorContact).toHaveBeenCalledWith(
      'https://site.example',
      context,
      undefined,
      contact,
    );
    expect(await response.json()).toMatchObject({ data: { saved: true } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects missing consent, invalid JSON and missing Origin', async () => {
    expect((await POST(request({ context, contact: { ...contact, consent: false } }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          new Request('http://localhost/api/chat/visitor/contact', {
            method: 'POST',
            headers: { origin: 'https://site.example' },
            body: '{',
          }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(request({ context, contact }, ''))).status).toBe(403);
    expect(saveVisitorContact).not.toHaveBeenCalled();
  });
  it('keeps denied site access private', async () => {
    vi.mocked(saveVisitorContact).mockRejectedValue(new ForbiddenError('Site not allowed'));
    expect((await POST(request({ context, contact }))).status).toBe(403);
  });
  it('returns only availability and saved state on GET', async () => {
    vi.mocked(getVisitorContactPrompt).mockResolvedValue({ available: false, saved: true });
    const response = await GET(
      new Request('http://localhost/api/chat/visitor/contact?' + new URLSearchParams(context), {
        headers: { origin: 'https://site.example' },
      }),
    );
    expect(await response.json()).toMatchObject({ data: { available: false, saved: true } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/server/auth/access';
import { ServiceUnavailableError } from '@/server/errors/app-error';
import { heartbeatAgent } from '@/server/services/agent-presence-service';
import { reconcileStaleCallsForAgent } from '@/server/services/call-service';

import { POST } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/logging/logger', () => ({ logger: { log: vi.fn() } }));
vi.mock('@/server/services/agent-presence-service', () => ({ heartbeatAgent: vi.fn() }));
vi.mock('@/server/services/call-service', () => ({ reconcileStaleCallsForAgent: vi.fn() }));

describe('POST /api/dashboard/agent-presence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue({
      email: 'agent@example.com',
      id: 'agent-1',
      name: 'Agent',
      role: 'AGENT',
      signInMethod: 'supernizo',
    });
    vi.mocked(reconcileStaleCallsForAgent).mockResolvedValue(0);
  });

  it('returns a service-unavailable response when Redis presence storage fails', async () => {
    vi.mocked(heartbeatAgent).mockRejectedValue(
      new ServiceUnavailableError('Agent presence is temporarily unavailable.'),
    );

    const response = await POST(
      new Request('http://localhost/api/dashboard/agent-presence', {
        body: JSON.stringify({ availability: 'AVAILABLE' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'service_unavailable',
        message: 'Agent presence is temporarily unavailable.',
      },
    });
  });

  it('returns the refreshed availability when dependencies are healthy', async () => {
    vi.mocked(heartbeatAgent).mockResolvedValue({
      availability: 'AVAILABLE',
      updatedAt: '2026-09-18T09:00:00.000Z',
    });

    const response = await POST(
      new Request('http://localhost/api/dashboard/agent-presence', {
        body: JSON.stringify({ availability: 'AVAILABLE' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { availability: 'AVAILABLE' },
    });
  });
});

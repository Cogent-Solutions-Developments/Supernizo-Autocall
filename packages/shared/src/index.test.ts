import { describe, expect, it } from 'vitest';

import { VisitorEventSchema } from './index';

describe('VisitorEventSchema', () => {
  it('accepts a bounded custom event payload', () => {
    const event = VisitorEventSchema.parse({
      type: 'custom',
      name: 'pricing_calculator_opened',
      occurredAt: '2026-08-31T08:00:00.000Z',
      properties: { plan: 'growth' },
    });

    expect(event.properties).toEqual({ plan: 'growth' });
  });

  it('rejects an empty event name', () => {
    expect(() =>
      VisitorEventSchema.parse({
        type: 'cta',
        name: ' ',
        occurredAt: '2026-08-31T08:00:00.000Z',
      }),
    ).toThrow();
  });
});

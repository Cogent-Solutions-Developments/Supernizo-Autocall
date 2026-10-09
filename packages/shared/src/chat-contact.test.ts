import { describe, expect, it } from 'vitest';
import { ChatContactInputSchema } from './contracts';
describe('conversation contact consent', () => {
  it.each([
    { channel: 'EMAIL', email: 'visitor@example.com', consent: true },
    { channel: 'WHATSAPP', whatsapp: '+94771234567', consent: true },
    { channel: 'BOTH', email: 'visitor@example.com', whatsapp: '+94771234567', consent: true },
  ])('accepts the selected contact channel: $channel', (input) => {
    expect(ChatContactInputSchema.safeParse(input).success).toBe(true);
  });
  it.each([
    { channel: 'EMAIL', email: 'visitor@example.com', consent: false },
    { channel: 'EMAIL', email: 'not-an-email', consent: true },
    { channel: 'WHATSAPP', whatsapp: '0771234567', consent: true },
    { channel: 'WHATSAPP', whatsapp: '+001234', consent: true },
    { channel: 'BOTH', email: 'visitor@example.com', consent: true },
    { channel: 'EMAIL', email: 'visitor@example.com' },
  ])('rejects invalid or unconsented contact data', (input) => {
    expect(ChatContactInputSchema.safeParse(input).success).toBe(false);
  });
  it('discards details for channels the visitor did not select', () => {
    expect(
      ChatContactInputSchema.parse({
        channel: 'EMAIL',
        email: 'visitor@example.com',
        whatsapp: '+94771234567',
        consent: true,
      }),
    ).not.toHaveProperty('whatsapp');
  });
});

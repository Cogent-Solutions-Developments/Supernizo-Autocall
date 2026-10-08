'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  ChatFollowUpSchema,
  ChatFollowUpStatusSchema,
  type ChatFollowUp,
  type ChatFollowUpStatus,
} from '@supernizo/shared';
import { fetchAppApi } from '@/lib/app-fetch';
const ResponseSchema = z.object({ data: ChatFollowUpSchema });
export const followUpLabels: Record<ChatFollowUpStatus, string> = {
  NEEDS_REPLY: 'Needs reply',
  FOLLOW_UP_PENDING: 'Follow-up pending',
  RESOLVED: 'Resolved',
};
export function ChatFollowUpPanel({
  threadId,
  onChange,
}: Readonly<{ threadId: string; onChange?: ((status: ChatFollowUpStatus) => void) | undefined }>) {
  const [details, setDetails] = useState<ChatFollowUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetchAppApi(
          `/api/chat/threads/${encodeURIComponent(threadId)}/follow-up`,
          { credentials: 'same-origin', cache: 'no-store' },
        );
        if (!response.ok) throw new Error();
        const parsed = ResponseSchema.parse(await response.json());
        if (active) {
          setDetails(parsed.data);
          setError(null);
        }
      } catch {
        if (active) setError('Contact details could not be loaded.');
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [threadId]);
  async function updateStatus(status: ChatFollowUpStatus) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetchAppApi(
        `/api/chat/threads/${encodeURIComponent(threadId)}/follow-up`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) throw new Error();
      const parsed = ResponseSchema.parse(await response.json());
      setDetails(parsed.data);
      onChange?.(parsed.data.status);
    } catch {
      setError('The follow-up status could not be saved.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="max-h-56 shrink-0 overflow-y-auto border-b border-line bg-surface px-4 py-3 text-xs text-body">
      <summary className="cursor-pointer font-semibold">
        Contact and follow-up · {details ? followUpLabels[details.status] : 'Loading…'}
        {details?.contact ? ' · Contact saved' : ''}
      </summary>
      {details ? (
        <div className="mt-3 grid gap-2">
          {details.contact ? (
            <>
              <p>
                Preferred channel:{' '}
                {details.contact.channel === 'BOTH'
                  ? 'Email and WhatsApp'
                  : details.contact.channel === 'EMAIL'
                    ? 'Email'
                    : 'WhatsApp'}
              </p>
              {details.contact.email ? (
                <a
                  className="break-all text-accent underline"
                  href={'mailto:' + encodeURIComponent(details.contact.email)}
                >
                  Email: {details.contact.email}
                </a>
              ) : null}
              {details.contact.whatsapp ? (
                <a
                  className="text-accent underline"
                  href={'https://wa.me/' + details.contact.whatsapp.slice(1)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp: {details.contact.whatsapp}
                </a>
              ) : null}
              <p className="text-muted">
                Unverified details. Permission for this conversation only, recorded{' '}
                <time dateTime={details.contact.consentAt}>
                  {new Date(details.contact.consentAt).toLocaleString()}
                </time>
                .
              </p>
            </>
          ) : (
            <p className="text-muted">The visitor has not shared contact details.</p>
          )}
          <label>
            Follow-up status
            <select
              aria-label="Follow-up status"
              className="ml-2 rounded border border-line bg-surface p-2 text-strong"
              disabled={saving}
              value={details.status}
              onChange={(e) => {
                const result = ChatFollowUpStatusSchema.safeParse(e.target.value);
                if (result.success) void updateStatus(result.data);
              }}
            >
              {ChatFollowUpStatusSchema.options.map((status) => (
                <option
                  key={status}
                  value={status}
                  disabled={status === 'FOLLOW_UP_PENDING' && !details.contact}
                >
                  {followUpLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-rose-400">
          {error}
        </p>
      ) : null}
    </details>
  );
}

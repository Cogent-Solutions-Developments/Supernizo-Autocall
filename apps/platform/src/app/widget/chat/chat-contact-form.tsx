'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRightIcon, EnvelopeSimpleIcon, WhatsappLogoIcon, XIcon } from '@phosphor-icons/react';
import {
  CHAT_CONTACT_CONSENT_TEXT,
  ChatContactInputSchema,
  type ChatContactInput,
  type ChatContactPrompt,
} from '@supernizo/shared';
export function ChatContactForm({
  prompt,
  hasVisitorMessage,
  state,
  onSave,
}: Readonly<{
  prompt: ChatContactPrompt;
  hasVisitorMessage: boolean;
  state: 'idle' | 'saving' | 'saved' | 'error';
  onSave: (contact: ChatContactInput) => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsApp] = useState('');
  const [consent, setConsent] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const saved = prompt.saved || state === 'saved';
  const visible =
    (expanded || (!dismissed && !saved && (hasVisitorMessage || prompt.available === false))) &&
    !(attempted && state === 'saved');
  useEffect(() => {
    const dialog = dialogRef.current;
    if (visible && !dialog?.open) dialog?.showModal();
    if (!visible && dialog?.open) dialog.close();
  }, [visible]);
  function close() {
    setDismissed(true);
    setExpanded(false);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    const phone = whatsapp.trim().replace(/[\s()-]/g, '');
    const channel = address && phone ? 'BOTH' : address ? 'EMAIL' : 'WHATSAPP';
    const parsed = ChatContactInputSchema.safeParse({
      channel,
      email: address,
      whatsapp: phone,
      consent,
    });
    if (!parsed.success) {
      setValidationError(
        'Add a valid email or WhatsApp number with country code, and allow us to follow up.',
      );
      return;
    }
    setValidationError(null);
    setAttempted(true);
    onSave(parsed.data);
  }
  return (
    <>
      <div className="shrink-0 px-4 pb-3 text-center text-[11px] text-[#71717a]">
        {saved ? (
          <span role="status" className="mr-1 text-emerald-700">
            Contact details saved.
          </span>
        ) : null}
        <button
          type="button"
          className="underline decoration-black/20 underline-offset-4 hover:text-[#18181b]"
          onClick={() => {
            setAttempted(false);
            setExpanded(true);
            setConsent(false);
            setValidationError(null);
          }}
        >
          {saved ? 'Update details' : 'Leave contact details for a reply later'}
        </button>
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby="contact-heading"
        aria-describedby="contact-description"
        onCancel={close}
        onClose={close}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto border-0 bg-[#fbfbfa] p-0 text-[#18181b] backdrop:bg-black/20"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_left,rgba(85,201,133,0.18),transparent_65%)]" />
        <div className="relative flex min-h-full flex-col px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#85858d]">
              Stay in touch
            </span>
            <button
              type="button"
              aria-label="Close contact form"
              onClick={close}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white/80 text-[#71717a] shadow-sm hover:text-[#18181b]"
            >
              <XIcon size={16} weight="bold" />
            </button>
          </div>
          <form
            aria-label="Contact details for follow-up"
            onSubmit={submit}
            className="my-auto py-3"
          >
            <div className="mb-4 flex h-12 [@media(max-height:600px)]:hidden w-12 items-center justify-center rounded-2xl border border-white bg-white/80 text-[#26834c] shadow-sm">
              <EnvelopeSimpleIcon size={25} weight="duotone" />
            </div>
            <h2
              id="contact-heading"
              className="m-0 text-[26px] leading-[1.1] font-semibold tracking-[-0.045em]"
            >
              Let’s keep
              <br />
              the conversation going.
            </h2>
            <p id="contact-description" className="mt-3 text-[12px] leading-5 text-[#71717a]">
              Leave your email, WhatsApp, or both so our team can get back to you. It’s completely
              optional.
            </p>
            <label className="mt-4 block text-[11px] font-medium">
              Email address
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 focus-within:border-[#55a875] focus-within:ring-2 focus-within:ring-[#55c985]/15">
                <EnvelopeSimpleIcon
                  aria-hidden="true"
                  size={17}
                  className="shrink-0 text-[#a1a1aa]"
                />
                <input
                  className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                  autoComplete="email"
                  type="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>
            <label className="mt-3 block text-[11px] font-medium">
              WhatsApp number
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 focus-within:border-[#55a875] focus-within:ring-2 focus-within:ring-[#55c985]/15">
                <WhatsappLogoIcon
                  aria-hidden="true"
                  size={17}
                  className="shrink-0 text-[#a1a1aa]"
                />
                <input
                  className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                  type="tel"
                  autoComplete="tel"
                  maxLength={25}
                  placeholder="+94 77 123 4567"
                  aria-describedby="whatsapp-hint"
                  value={whatsapp}
                  onChange={(e) => setWhatsApp(e.target.value)}
                />
              </div>
            </label>
            <p id="whatsapp-hint" className="mt-1.5 text-[10px] text-[#85858d]">
              Include your country code, starting with +.
            </p>
            <label className="mt-4 flex items-start gap-2.5 text-[10px] leading-4 text-[#71717a]">
              <input
                className="mt-0.5 accent-[#18181b]"
                type="checkbox"
                checked={consent}
                required
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>{CHAT_CONTACT_CONSENT_TEXT}</span>
            </label>
            {validationError || state === 'error' ? (
              <p role="alert" className="mt-2 text-[11px] text-red-700">
                {validationError ?? 'We could not save your details. Please try again.'}
              </p>
            ) : null}
            <button
              className="mt-4 flex h-10 w-full items-center justify-between rounded-xl bg-[#18181b] px-4 text-[12px] font-medium text-white shadow-sm hover:bg-[#303036] disabled:opacity-50"
              disabled={state === 'saving'}
              type="submit"
            >
              {state === 'saving' ? 'Saving…' : 'Save contact details'}
              <ArrowRightIcon aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              className="mt-2 w-full py-1 text-[11px] text-[#85858d] hover:text-[#18181b]"
              onClick={close}
            >
              Maybe later
            </button>
          </form>
          <p className="text-center text-[9px] text-[#a1a1aa]">
            Only about this conversation. No marketing messages.
          </p>
        </div>
      </dialog>
    </>
  );
}

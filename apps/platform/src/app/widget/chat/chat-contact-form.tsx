'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRightIcon, EnvelopeSimpleIcon, WhatsappLogoIcon, XIcon } from '@phosphor-icons/react';
import {
  CHAT_CONTACT_CONSENT_TEXT,
  ChatContactInputSchema,
  type ChatContactInput,
  type ChatContactPrompt,
} from '@supernizo/shared';

import { FlowingRibbons } from '@/components/flowing-ribbons';
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
      <div className="flex shrink-0 flex-col items-center gap-1 px-4 pb-3 text-center text-[11px] text-[#71717a]">
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
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto rounded-[22px] border border-black/10 bg-[#fbfbfa] p-0 text-[#18181b] shadow-[0_24px_68px_rgba(24,24,27,0.18),0_3px_12px_rgba(24,24,27,0.08)] backdrop:bg-black/20"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[22px]"
        >
          <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_16%_4%,rgba(85,201,133,0.11),transparent_46%),radial-gradient(circle_at_92%_8%,rgba(24,24,27,0.055),transparent_38%)]" />
          <div className="absolute inset-0 opacity-[0.94]">
            {visible ? (
              <FlowingRibbons
                animationSpeed={0.34}
                backgroundColor="transparent"
                lineColor="rgba(63,63,70,0.18)"
                placement="bottom"
              />
            ) : null}
          </div>
        </div>
        <div className="relative flex min-h-full flex-col px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#85858d]">
              Stay in touch
            </span>
            <button
              type="button"
              aria-label="Close contact form"
              onClick={close}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/[0.06] bg-white/70 text-[#71717a] shadow-[0_1px_2px_rgba(24,24,27,0.04)] backdrop-blur-md transition-[background-color,color,transform] duration-200 hover:bg-white hover:text-[#18181b] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] motion-reduce:transition-none"
            >
              <XIcon size={16} weight="bold" />
            </button>
          </div>
          <form
            aria-label="Contact details for follow-up"
            onSubmit={submit}
            className="my-auto w-full max-w-80 self-center py-3"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[15px] border border-black/[0.07] bg-white/80 text-[#18181b] shadow-[0_1px_2px_rgba(24,24,27,0.04)] backdrop-blur-md [@media(max-height:600px)]:hidden">
              <EnvelopeSimpleIcon size={25} weight="duotone" />
            </div>
            <h2
              id="contact-heading"
              className="m-0 text-center text-[28px] leading-[1.08] font-semibold tracking-[-0.045em]"
            >
              Let’s keep
              <br />
              the conversation going.
            </h2>
            <p
              id="contact-description"
              className="mt-3 text-center text-[13px] leading-5 text-[#71717a]"
            >
              Leave your email, WhatsApp, or both so our team can get back to you. It’s completely
              optional.
            </p>
            <label className="mt-4 block text-[11px] font-medium">
              Email address
              <div className="mt-1.5 flex items-center gap-2 rounded-[15px] border border-black/10 bg-white/90 px-3.5 shadow-[0_1px_3px_rgba(24,24,27,0.04)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 focus-within:border-black/25 focus-within:shadow-[0_0_0_3px_rgba(24,24,27,0.04)] motion-reduce:transition-none">
                <EnvelopeSimpleIcon
                  aria-hidden="true"
                  size={17}
                  className="shrink-0 text-[#a1a1aa]"
                />
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-[#18181b] outline-none placeholder:text-[#a1a1aa]"
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
              <div className="mt-1.5 flex items-center gap-2 rounded-[15px] border border-black/10 bg-white/90 px-3.5 shadow-[0_1px_3px_rgba(24,24,27,0.04)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 focus-within:border-black/25 focus-within:shadow-[0_0_0_3px_rgba(24,24,27,0.04)] motion-reduce:transition-none">
                <WhatsappLogoIcon
                  aria-hidden="true"
                  size={17}
                  className="shrink-0 text-[#a1a1aa]"
                />
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-[#18181b] outline-none placeholder:text-[#a1a1aa]"
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
              className="mx-auto mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[11px] bg-[#18181b] px-4 text-[13px] font-medium text-white shadow-[0_4px_12px_rgba(24,24,27,0.15)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-black hover:shadow-[0_6px_16px_rgba(24,24,27,0.22)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none"
              disabled={state === 'saving'}
              type="submit"
            >
              {state === 'saving' ? 'Saving…' : 'Save contact details'}
              <ArrowRightIcon aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              className="mx-auto mt-2 flex min-h-9 w-fit cursor-pointer items-center justify-center rounded-lg px-4 text-center text-[11px] text-[#85858d] transition-colors hover:text-[#18181b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] motion-reduce:transition-none"
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
      <style jsx>{`
        dialog {
          scrollbar-width: none;
        }
        dialog::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
}

'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

import type { Call } from '@supernizo/shared';

import { IncomingCallWorkspace } from './incoming-call-workspace';

type IncomingCallModalProps = Readonly<{
  call: Call;
  eventName?: string;
  onClose: () => void;
  visitorLocation?: string;
}>;

export function IncomingCallModal({
  call,
  eventName,
  onClose,
  visitorLocation,
}: IncomingCallModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-label="Incoming visitor call"
      aria-modal="true"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4"
      role="dialog"
    >
      <div className="relative w-full max-w-3xl">
        <button
          aria-label="Close incoming call"
          className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-hover hover:text-strong"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
        <IncomingCallWorkspace
          initialCall={call}
          {...(eventName ? { eventName } : {})}
          {...(visitorLocation ? { visitorLocation } : {})}
        />
      </div>
    </div>
  );
}

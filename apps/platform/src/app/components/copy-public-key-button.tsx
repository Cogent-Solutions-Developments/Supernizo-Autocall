'use client';

import { useState } from 'react';

type CopyPublicKeyButtonProps = Readonly<{
  publicKey: string;
}>;

export function CopyPublicKeyButton({ publicKey }: CopyPublicKeyButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);

  async function copyPublicKey(): Promise<void> {
    await navigator.clipboard.writeText(publicKey);
    setHasCopied(true);
  }

  return (
    <button
      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
      onClick={() => void copyPublicKey()}
      type="button"
    >
      {hasCopied ? 'Copied' : 'Copy key'}
    </button>
  );
}

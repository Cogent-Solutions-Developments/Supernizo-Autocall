'use client';

import Image from 'next/image';
import { useState } from 'react';

export function AgentAvatar({
  name,
  imageUrl,
  variant = 'avatar',
  className = '',
}: Readonly<{
  name: string;
  imageUrl?: string | null;
  variant?: 'avatar' | 'cover';
  className?: string;
}>) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[#efefec] font-semibold text-[#71717a] ${variant === 'avatar' ? 'rounded-full border border-[#e4e4e7] text-sm' : 'text-7xl'} ${className}`}
    >
      {imageUrl && failedUrl !== imageUrl ? (
        <Image
          alt=""
          className="object-cover object-[50%_18%]"
          fill
          onError={() => setFailedUrl(imageUrl)}
          sizes={variant === 'cover' ? '350px' : '44px'}
          src={imageUrl}
          unoptimized
        />
      ) : (
        <span>{initials || '?'}</span>
      )}
    </div>
  );
}

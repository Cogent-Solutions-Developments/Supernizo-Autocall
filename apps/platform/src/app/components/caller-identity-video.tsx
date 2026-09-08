'use client';

import { useEffect, useRef } from 'react';

import { withAppBasePath } from '@/lib/app-path';

type CallerIdentityVideoProps = Readonly<{
  className?: string;
  variant?: 'avatar' | 'cover';
}>;

export function CallerIdentityVideo({
  className = '',
  variant = 'avatar',
}: CallerIdentityVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => {
      if (mediaQuery.matches) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };

    syncPlayback();
    mediaQuery.addEventListener('change', syncPlayback);
    return () => mediaQuery.removeEventListener('change', syncPlayback);
  }, []);

  const shellClassName =
    variant === 'cover'
      ? 'h-full w-full overflow-hidden bg-[#efefec]'
      : 'h-full w-full overflow-hidden rounded-full border border-[#e4e4e7] bg-[#efefec] shadow-[0_9px_24px_rgba(24,24,27,0.14)]';

  return (
    <div aria-hidden="true" className={`${shellClassName} ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        className="h-full w-full object-cover object-[50%_18%]"
        disablePictureInPicture
        loop
        muted
        playsInline
        poster={withAppBasePath('/sdk/assets/cta-hover-loop1-poster.jpg')}
        preload="auto"
      >
        <source src={withAppBasePath('/sdk/assets/cta-hover-loop1.mp4')} type="video/mp4" />
      </video>
    </div>
  );
}

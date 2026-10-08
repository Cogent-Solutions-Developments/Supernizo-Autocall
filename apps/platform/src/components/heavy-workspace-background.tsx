'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';

const Dither = dynamic(() => import('./heavy-dither'), { ssr: false });

// The background layers and shader settings shared by Heavy's CS Database / My Leads pages.
export function HeavyWorkspaceBackground() {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#01040a]"
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage:
            'radial-gradient(ellipse 86% 74% at 50% 54%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.82) 34%, rgba(0,0,0,0.46) 62%, rgba(0,0,0,0.12) 84%, transparent 100%)',
        }}
      >
        <Dither
          waveColor={[0.002, 0.04, 0.055]}
          disableAnimation={reducedMotion === true}
          enableMouseInteraction={false}
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.1}
        />
        <div className="absolute inset-x-0 top-0 h-[54dvh] bg-gradient-to-b from-black/78 via-black/52 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-[28vw] bg-gradient-to-r from-black/70 via-black/42 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-[28vw] bg-gradient-to-l from-black/70 via-black/42 to-transparent" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,3,8,0.76)_0%,rgba(0,3,8,0.42)_44%,rgba(0,3,8,0.92)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_52%_42%,rgba(14,165,233,0.10)_0%,rgba(1,4,10,0.42)_38%,rgba(1,4,10,0.88)_82%)]" />
      <div className="absolute inset-x-0 top-0 h-28 border-t border-sky-200/8 bg-gradient-to-b from-[#01040a] to-transparent" />
    </div>
  );
}

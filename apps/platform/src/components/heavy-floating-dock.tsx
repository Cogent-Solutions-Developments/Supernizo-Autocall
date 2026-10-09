'use client';

import Link from 'next/link';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
  useReducedMotion,
} from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
// Adapted from Supernizo Heavy's shared floating dock. Autocall owns its routes and auth.
function cn(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(' ');
}

export type FloatingDockItem = {
  title: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
};

export function FloatingDock({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: FloatingDockItem[];
  desktopClassName?: string | undefined;
  mobileClassName?: string | undefined;
}) {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
}

function FloatingDockMobile({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div className={cn('relative block md:hidden', className)}>
      <AnimatePresence>
        {open ? (
          <motion.button
            key="mobile-dock-backdrop"
            type="button"
            aria-label="Close navigation dock"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-0 bg-black/25 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          />
        ) : null}
        {open ? (
          <motion.div
            key="mobile-dock-items"
            layoutId="mobile-floating-dock"
            className="absolute inset-x-0 bottom-full z-10 mb-3 flex flex-col items-center gap-2"
          >
            {items.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ delay: (items.length - 1 - index) * 0.025 }}
              >
                <DockAction item={item} compact onSelect={() => setOpen(false)} />
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        ref={toggleRef}
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/24 bg-[rgba(12,18,30,0.52)] text-zinc-100 ring-1 ring-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_14px_30px_-18px_rgba(2,10,27,0.92),0_0_30px_-20px_rgba(56,189,248,0.48)] backdrop-blur-[28px] transition hover:bg-[rgba(17,26,42,0.62)]"
        aria-label={open ? 'Close navigation dock' : 'Open navigation dock'}
      >
        <ChevronUp className={cn('h-5 w-5 transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  );
}

function FloatingDockDesktop({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string | undefined;
}) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.nav
      onMouseMove={(event) => mouseX.set(event.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'relative mx-auto hidden h-16 items-end gap-3 overflow-visible rounded-2xl border border-white/24 bg-[rgba(10,16,28,0.54)] pl-3 pr-4 pb-3 ring-1 ring-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_18px_40px_-24px_rgba(2,10,27,0.92),0_0_36px_-22px_rgba(56,189,248,0.45)] backdrop-blur-[28px] md:flex',
        className,
      )}
      aria-label="Autocall navigation"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(155deg,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0.06)_32%,rgba(15,23,42,0.08)_56%,rgba(15,23,42,0.22)_100%)]"
      />
      {items.map((item) => (
        <IconContainer key={item.title} mouseX={mouseX} item={item} />
      ))}
    </motion.nav>
  );
}

function IconContainer({ mouseX, item }: { mouseX: MotionValue<number>; item: FloatingDockItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { left: 0, width: 0 };
    return value - bounds.left - bounds.width / 2;
  });

  const size = useSpring(
    useTransform(distance, [-150, 0, 150], reducedMotion ? [40, 40, 40] : [40, 72, 40]),
    {
      mass: 0.12,
      stiffness: 170,
      damping: 14,
    },
  );
  const iconSize = useSpring(
    useTransform(distance, [-150, 0, 150], reducedMotion ? [20, 20, 20] : [20, 34, 20]),
    {
      mass: 0.12,
      stiffness: 170,
      damping: 14,
    },
  );

  return (
    <div onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
      <DockAction item={item}>
        <motion.div
          ref={ref}
          style={{ width: size, height: size }}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            'relative flex aspect-square items-center justify-center rounded-full border transition-colors',
            item.active
              ? 'border-blue-500/70 bg-blue-600 text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.8)]'
              : 'border-white/22 bg-[rgba(16,24,38,0.6)] text-zinc-100 ring-1 ring-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_12px_24px_-16px_rgba(2,10,27,0.84),0_0_24px_-18px_rgba(56,189,248,0.44)] backdrop-blur-[24px] hover:bg-[rgba(20,30,47,0.72)] hover:text-white',
            item.disabled && 'cursor-not-allowed opacity-55',
          )}
        >
          <AnimatePresence>
            {hovered ? (
              <motion.div
                initial={{ opacity: 0, y: 8, x: '-50%' }}
                animate={{ opacity: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, y: 4, x: '-50%' }}
                className="absolute -top-9 left-1/2 w-max rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 shadow-sm dark:border-white/15 dark:bg-zinc-900/78 dark:text-zinc-100 dark:backdrop-blur-xl"
              >
                {item.title}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div
            style={{ width: iconSize, height: iconSize }}
            className="flex items-center justify-center"
          >
            {item.icon}
          </motion.div>
        </motion.div>
      </DockAction>
    </div>
  );
}

function DockAction({
  item,
  compact = false,
  children,
  onSelect,
}: {
  item: FloatingDockItem;
  compact?: boolean;
  children?: ReactNode;
  onSelect?: () => void;
}) {
  if (item.href?.startsWith('http')) {
    return (
      <a
        href={item.href}
        aria-label={item.title}
        className="relative inline-flex"
        onClick={() => onSelect?.()}
      >
        {children ?? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/22 bg-[rgba(16,24,38,0.6)] text-zinc-100">
            <span className="h-5 w-5">{item.icon}</span>
          </span>
        )}
      </a>
    );
  }

  if (children) {
    if (item.href) {
      return (
        <Link
          href={item.href}
          prefetch={false}
          aria-label={item.title}
          aria-current={item.active ? 'page' : undefined}
          onClick={() => onSelect?.()}
          className={cn(
            'relative inline-flex overflow-visible',
            item.disabled && 'pointer-events-none',
          )}
        >
          {children}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          onSelect?.();
          item.onClick?.();
        }}
        disabled={item.disabled}
        aria-label={item.title}
        aria-current={item.active ? 'page' : undefined}
        className="relative inline-flex overflow-visible"
      >
        {children}
      </button>
    );
  }

  const className = cn(
    'flex h-11 w-11 items-center justify-center rounded-full border transition',
    item.active
      ? 'border-blue-500/70 bg-blue-600 text-white'
      : 'border-white/22 bg-[rgba(16,24,38,0.6)] text-zinc-100 ring-1 ring-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_12px_24px_-16px_rgba(2,10,27,0.84),0_0_24px_-18px_rgba(56,189,248,0.44)] backdrop-blur-[24px] hover:bg-[rgba(20,30,47,0.72)] hover:text-white',
    compact && 'h-10 w-10',
    item.disabled && 'cursor-not-allowed opacity-55',
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        prefetch={false}
        aria-label={item.title}
        aria-current={item.active ? 'page' : undefined}
        className={className}
        onClick={() => onSelect?.()}
      >
        <span className="h-5 w-5">{item.icon}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.();
        item.onClick?.();
      }}
      disabled={item.disabled}
      aria-label={item.title}
      aria-current={item.active ? 'page' : undefined}
      className={className}
    >
      <span className="h-5 w-5">{item.icon}</span>
    </button>
  );
}

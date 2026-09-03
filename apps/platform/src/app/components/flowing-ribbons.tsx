'use client';

import { useCallback, useEffect, useRef } from 'react';

type Point = Readonly<{ x: number; y: number }>;
type Disturbance = Readonly<{ intensity: number; time: number; x: number; y: number }>;

type FlowingRibbonsProps = Readonly<{
  animationSpeed?: number;
  backgroundColor?: string;
  lineColor?: string;
  removeWaveLine?: boolean;
}>;

function mouseInfluence(x: number, y: number, pointer: Point | null): number {
  if (!pointer) return 0;
  const distance = Math.hypot(x - pointer.x, y - pointer.y);
  return Math.max(0, 1 - distance / 200);
}

function disturbanceAt(
  x: number,
  y: number,
  currentTime: number,
  disturbances: readonly Disturbance[],
): number {
  return disturbances.reduce((total, disturbance) => {
    const age = currentTime - disturbance.time;
    const maxAge = 3_000;
    if (age >= maxAge) return total;

    const distance = Math.hypot(x - disturbance.x, y - disturbance.y);
    const waveRadius = (age / maxAge) * 400;
    const waveWidth = 80;
    const distanceFromWave = Math.abs(distance - waveRadius);
    if (distanceFromWave >= waveWidth) return total;

    const strength = (1 - age / maxAge) * disturbance.intensity;
    const proximity = 1 - distanceFromWave / waveWidth;
    return total + strength * proximity * Math.sin((distance - waveRadius) * 0.1);
  }, 0);
}

function deform(
  x: number,
  y: number,
  time: number,
  progress: number,
  pointer: Point | null,
  disturbances: readonly Disturbance[],
  currentTime: number,
): Point {
  const pointerAmount = mouseInfluence(x, y, pointer);
  const disturbance = disturbanceAt(x, y, currentTime, disturbances);
  const primaryWave = Math.sin(progress * Math.PI * 4 + time * 0.01) * 30;
  const secondaryWave = Math.sin(progress * Math.PI * 7 - time * 0.008) * 15;
  const harmonic = Math.sin(x * 0.02 + y * 0.015 + time * 0.005) * 10;
  const pointerWave = pointerAmount * Math.sin(time * 0.02 + progress * Math.PI * 2) * 20;
  const disturbanceWave = disturbance * Math.sin(time * 0.015 + progress * Math.PI * 3) * 25;

  return {
    x: primaryWave + harmonic + pointerWave + disturbanceWave,
    y: secondaryWave + pointerWave * 0.5 + disturbanceWave * 0.7,
  };
}

export function FlowingRibbons({
  animationSpeed = 0.3,
  backgroundColor = '#f0eee6',
  lineColor = '#777777',
  removeWaveLine = true,
}: FlowingRibbonsProps) {
  const edgeFadeMask =
    'radial-gradient(ellipse 82% 76% at 50% 50%, #000 0%, #000 30%, rgba(0, 0, 0, 0.72) 52%, rgba(0, 0, 0, 0.22) 74%, transparent 100%)';
  const automaticDisturbanceIndex = useRef(0);
  const automaticDisturbanceTimer = useRef<number | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<Point | null>(null);
  const previousFrameTimeRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const disturbancesRef = useRef<Disturbance[]>([]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const rect = parent.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.style.height = `${rect.height}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.getContext('2d')?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const currentTime = performance.now();
    const previousFrameTime = previousFrameTimeRef.current;
    const elapsedTime = previousFrameTime === null ? 1000 / 60 : currentTime - previousFrameTime;
    previousFrameTimeRef.current = currentTime;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const gridDensity = Math.max(48, Math.min(84, Math.round(width / 4)));
    // Overscan the mesh so the largest deformation still extends beyond every card edge.
    const ribbonWidth = width * 1.8;
    const ribbonOffset = (width - ribbonWidth) / 2;
    const disturbances = disturbancesRef.current;
    timeRef.current += Math.min(elapsedTime, 50) * animationSpeed * 0.25;

    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = lineColor;
    context.lineWidth = 0.5;

    for (let column = 0; column < gridDensity; column += 1) {
      const x = ribbonOffset + (column / gridDensity) * ribbonWidth;
      context.beginPath();
      for (let row = 0; row <= gridDensity; row += 1) {
        const progress = (row / gridDensity) * 1.5 - 0.25;
        const y = progress * height;
        const offset = deform(
          x,
          y,
          timeRef.current,
          progress,
          pointerRef.current,
          disturbances,
          currentTime,
        );
        if (row === 0) context.moveTo(x + offset.x, y + offset.y);
        else context.lineTo(x + offset.x, y + offset.y);
      }
      context.stroke();
    }

    for (let row = 0; row < gridDensity; row += 1) {
      const progress = (row / gridDensity) * 1.5 - 0.25;
      const y = progress * height;
      context.beginPath();
      for (let column = 0; column <= gridDensity; column += 1) {
        const x = ribbonOffset + (column / gridDensity) * ribbonWidth;
        const offset = deform(
          x,
          y,
          timeRef.current,
          progress,
          pointerRef.current,
          disturbances,
          currentTime,
        );
        if (column === 0) context.moveTo(x + offset.x, y + offset.y);
        else context.lineTo(x + offset.x, y + offset.y);
      }
      context.stroke();
    }

    if (!removeWaveLine) {
      disturbances.forEach((disturbance) => {
        const age = currentTime - disturbance.time;
        if (age >= 3_000) return;
        const progress = age / 3_000;
        context.beginPath();
        context.arc(disturbance.x, disturbance.y, progress * 400, 0, Math.PI * 2);
        context.strokeStyle = `rgba(100, 100, 100, ${(1 - progress) * 0.2 * disturbance.intensity})`;
        context.lineWidth = 2;
        context.stroke();
        context.strokeStyle = lineColor;
        context.lineWidth = 0.5;
      });
    }

    disturbancesRef.current = disturbances.filter(
      (disturbance) => currentTime - disturbance.time < 3_000,
    );
  }, [animationSpeed, backgroundColor, lineColor, removeWaveLine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      pointerRef.current = inside
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : null;
    };
    const addDisturbance = (event: PointerEvent) => {
      updatePointer(event);
      if (!pointerRef.current || reducedMotion) return;
      disturbancesRef.current.push({
        intensity: 2,
        time: performance.now(),
        ...pointerRef.current,
      });
    };
    const render = () => {
      drawFrame();
      if (!reducedMotion) animationFrameId.current = window.requestAnimationFrame(render);
    };
    const restartForMotionPreference = () => {
      reducedMotion = motionPreference.matches;
      if (animationFrameId.current !== null) window.cancelAnimationFrame(animationFrameId.current);
      if (automaticDisturbanceTimer.current !== null) {
        window.clearTimeout(automaticDisturbanceTimer.current);
      }
      animationFrameId.current = null;
      automaticDisturbanceTimer.current = null;
      render();
      if (!reducedMotion) {
        automaticDisturbanceTimer.current = window.setTimeout(addAutomaticDisturbance, 350);
      }
    };
    const addAutomaticDisturbance = () => {
      if (reducedMotion) return;
      const positions: readonly Point[] = [
        { x: 0.22, y: 0.2 },
        { x: 0.76, y: 0.38 },
        { x: 0.34, y: 0.72 },
        { x: 0.72, y: 0.82 },
      ];
      const position = positions[automaticDisturbanceIndex.current % positions.length];
      automaticDisturbanceIndex.current += 1;
      if (position) {
        disturbancesRef.current.push({
          intensity: 2,
          time: performance.now(),
          x: position.x * canvas.clientWidth,
          y: position.y * canvas.clientHeight,
        });
      }
      automaticDisturbanceTimer.current = window.setTimeout(addAutomaticDisturbance, 1_400);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      if (reducedMotion) drawFrame();
    });
    resizeObserver.observe(parent);
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerdown', addDisturbance, { passive: true });
    motionPreference.addEventListener('change', restartForMotionPreference);
    render();
    if (!reducedMotion) {
      automaticDisturbanceTimer.current = window.setTimeout(addAutomaticDisturbance, 350);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerdown', addDisturbance);
      motionPreference.removeEventListener('change', restartForMotionPreference);
      if (animationFrameId.current !== null) window.cancelAnimationFrame(animationFrameId.current);
      if (automaticDisturbanceTimer.current !== null) {
        window.clearTimeout(automaticDisturbanceTimer.current);
      }
      animationFrameId.current = null;
      automaticDisturbanceTimer.current = null;
      automaticDisturbanceIndex.current = 0;
      disturbancesRef.current = [];
      pointerRef.current = null;
      previousFrameTimeRef.current = null;
      timeRef.current = 0;
    };
  }, [drawFrame, resizeCanvas]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      style={{
        WebkitMaskImage: edgeFadeMask,
        backgroundColor,
        maskImage: edgeFadeMask,
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

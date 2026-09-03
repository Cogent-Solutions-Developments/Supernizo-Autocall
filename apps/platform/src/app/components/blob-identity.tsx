'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { blobFragmentShader, blobVertexShader } from './blob-identity-shaders';

type BlobIdentityProps = Readonly<{
  className?: string;
}>;

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
}

function AnimatedBlob({ reducedMotion }: Readonly<{ reducedMotion: boolean }>) {
  const mesh = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>>(null);
  const uniforms = useMemo(
    () => ({
      u_intensity: { value: 0.28 },
      u_time: { value: 0 },
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (!mesh.current || reducedMotion) return;
    const elapsed = clock.getElapsedTime();
    const timeUniform = mesh.current.material.uniforms.u_time;
    if (timeUniform) timeUniform.value += delta * 0.42;
    mesh.current.rotation.x = Math.sin(elapsed * 0.22) * 0.08;
    mesh.current.rotation.y = elapsed * 0.09;
    const scale = 1.42 + Math.sin(elapsed * 0.5) * 0.025;
    mesh.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={mesh} scale={1.42}>
      <sphereGeometry args={[1.05, 64, 64]} />
      <shaderMaterial
        fragmentShader={blobFragmentShader}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={blobVertexShader}
      />
    </mesh>
  );
}

function BlobFallback() {
  return (
    <span className="flex h-full w-full items-center justify-center bg-transparent">
      <span className="block h-[48%] w-[54%] rotate-[-8deg] rounded-[48%_52%_43%_57%/55%_44%_56%_45%] bg-[#18181b]" />
    </span>
  );
}

export function BlobIdentity({ className = '' }: BlobIdentityProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className={`h-full w-full overflow-hidden bg-transparent ${className}`}>
      <Canvas
        camera={{ fov: 38, position: [0, 0, 6] }}
        dpr={[1, 1.5]}
        fallback={<BlobFallback />}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        onCreated={({ gl }) => gl.setClearColor('#000000', 0)}
      >
        <AnimatedBlob reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}

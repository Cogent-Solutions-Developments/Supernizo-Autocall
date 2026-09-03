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
  const blobGroup = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Group>(null);
  const leftPupil = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>>(null);
  const rightEye = useRef<THREE.Group>(null);
  const rightPupil = useRef<THREE.Group>(null);
  const uniforms = useMemo(
    () => ({
      u_intensity: { value: 0.36 },
      u_time: { value: 0 },
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (!mesh.current || !blobGroup.current || reducedMotion) return;
    const elapsed = clock.getElapsedTime();
    const timeUniform = mesh.current.material.uniforms.u_time;
    const intensityUniform = mesh.current.material.uniforms.u_intensity;
    if (timeUniform) timeUniform.value += delta * 0.82;
    if (intensityUniform) intensityUniform.value = 0.36 + Math.sin(elapsed * 0.9) * 0.045;
    mesh.current.rotation.x = Math.sin(elapsed * 0.5) * 0.14;
    mesh.current.rotation.y = elapsed * 0.24;
    mesh.current.rotation.z = Math.sin(elapsed * 0.34) * 0.07;
    const scale = 1.42 + Math.sin(elapsed * 1.05) * 0.045 + Math.sin(elapsed * 0.43) * 0.018;
    blobGroup.current.scale.setScalar(scale);

    const blinkPhase = (elapsed + 1.2) % 4.6;
    const eyeScaleY = blinkPhase < 0.18 ? 1 - Math.sin((blinkPhase / 0.18) * Math.PI) * 0.88 : 1;
    if (leftEye.current) leftEye.current.scale.y = eyeScaleY;
    if (rightEye.current) rightEye.current.scale.y = eyeScaleY;

    const gazeX = Math.sin(elapsed * 0.72) * 0.035;
    const gazeY = Math.sin(elapsed * 0.47 + 0.6) * 0.024;
    if (leftPupil.current) leftPupil.current.position.set(gazeX, gazeY, 0.14);
    if (rightPupil.current) rightPupil.current.position.set(gazeX, gazeY, 0.14);
  });

  return (
    <group ref={blobGroup} scale={1.42}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1.05, 64, 64]} />
        <shaderMaterial
          fragmentShader={blobFragmentShader}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={blobVertexShader}
        />
      </mesh>

      <group ref={leftEye} position={[-0.3, 0.13, 0.99]}>
        <mesh renderOrder={1} scale={[0.92, 1.08, 0.72]}>
          <sphereGeometry args={[0.145, 32, 32]} />
          <meshBasicMaterial color="#f4f3ed" depthTest={false} toneMapped={false} />
        </mesh>
        <group ref={leftPupil} position={[0, 0, 0.14]}>
          <mesh renderOrder={2} scale={[0.88, 1.08, 0.52]}>
            <sphereGeometry args={[0.058, 24, 24]} />
            <meshBasicMaterial color="#18181b" depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      </group>

      <group ref={rightEye} position={[0.31, 0.1, 0.985]}>
        <mesh renderOrder={1} scale={[0.96, 1, 0.72]}>
          <sphereGeometry args={[0.135, 32, 32]} />
          <meshBasicMaterial color="#f4f3ed" depthTest={false} toneMapped={false} />
        </mesh>
        <group ref={rightPupil} position={[0, 0, 0.14]}>
          <mesh renderOrder={2} scale={[0.9, 1.05, 0.52]}>
            <sphereGeometry args={[0.055, 24, 24]} />
            <meshBasicMaterial color="#18181b" depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
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

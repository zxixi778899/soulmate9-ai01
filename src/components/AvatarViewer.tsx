// @ts-nocheck -- R3F intrinsic JSX elements not picked up by tsconfig types
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useState } from 'react';

export default function AvatarViewer({ avatar }: { avatar: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(avatar, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
  }, [avatar]);

  return (
    <div className="w-full h-[520px] bg-black rounded-3xl overflow-hidden border border-rose-500/30 relative">
      <Canvas camera={{ position: [0, 0, 6] }}>
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-rose-400">加载 3D 视图...</div>}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} color="#ff0088" />
          {texture ? (
            <mesh>
              <planeGeometry args={[4, 5.5]} />
              <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
            </mesh>
          ) : null}
          <Environment preset="night" />
          <OrbitControls enablePan={false} minDistance={3} maxDistance={10} />
        </Suspense>
      </Canvas>
    </div>
  );
}
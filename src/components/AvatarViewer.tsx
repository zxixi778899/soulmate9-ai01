'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense } from 'react';

export default function AvatarViewer({ avatar }: { avatar: string }) {
  return (
    <div className="w-full h-[520px] bg-black rounded-3xl overflow-hidden border border-rose-500/30 relative">
      <Canvas camera={{ position: [0, 0, 6] }}>
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-rose-400">加载 3D 视图...</div>}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} color="#ff0088" />
          <mesh>
            <planeGeometry args={[4, 5.5]} />
            <meshStandardMaterial map={new THREE.TextureLoader().load(avatar)} side={THREE.DoubleSide} />
          </mesh>
          <Environment preset="night" />
          <OrbitControls enablePan={false} minDistance={3} maxDistance={10} />
        </Suspense>
      </Canvas>
    </div>
  );
}
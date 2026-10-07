import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useStore } from '../store';
import TaskSphere from './TaskSphere';
import ConnectionLine from './ConnectionLine';

function GalaxyContent() {
  const { nodes, connections, selectedNodeId, hoveredNodeId, focusMode } = useStore();

  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId || !focusMode) return new Set<string>();
    const connected = new Set<string>([selectedNodeId]);
    connections.forEach((conn) => {
      if (conn.source === selectedNodeId) connected.add(conn.target);
      if (conn.target === selectedNodeId) connected.add(conn.source);
    });
    return connected;
  }, [selectedNodeId, connections, focusMode]);

  const highlightedConnectionIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return new Set(
      connections
        .filter((conn) => conn.source === selectedNodeId || conn.target === selectedNodeId)
        .map((conn) => conn.id)
    );
  }, [selectedNodeId, connections]);

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#6366f1" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ec4899" />
      <pointLight position={[0, 20, 0]} intensity={0.4} color="#06b6d4" />

      <Stars
        radius={100}
        depth={80}
        count={5000}
        factor={4}
        saturation={0.5}
        fade
        speed={0.5}
      />

      {connections.map((conn) => (
        <ConnectionLine
          key={conn.id}
          connection={conn}
          nodes={nodes}
          isHighlighted={highlightedConnectionIds.has(conn.id)}
          isDimmed={focusMode && !highlightedConnectionIds.has(conn.id)}
        />
      ))}

      {nodes.map((node) => (
        <TaskSphere
          key={node.id}
          node={node}
        />
      ))}

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        panSpeed={0.8}
        minDistance={5}
        maxDistance={100}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.DOLLY,
        }}
      />

      <EffectComposer>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export default function Galaxy() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 10, 30], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#030712');
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <GalaxyContent />
      </Canvas>
    </div>
  );
}

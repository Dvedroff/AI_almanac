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
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.35} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.15} color="#a5b4fc" />

      <Stars
        radius={120}
        depth={90}
        count={2500}
        factor={3}
        saturation={0.3}
        fade
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
          intensity={0.35}
          luminanceThreshold={0.4}
          luminanceSmoothing={0.8}
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
          gl.setClearColor('#0a0a0f');
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <GalaxyContent />
      </Canvas>
    </div>
  );
}

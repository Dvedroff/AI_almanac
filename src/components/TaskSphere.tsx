import { useRef, useState } from 'react';
import { Sphere, Html } from '@react-three/drei';
import { useStore } from '../store';
import { TaskNode } from '../types';
import * as THREE from 'three';

interface TaskSphereProps {
  node: TaskNode;
}

export default function TaskSphere({ node }: TaskSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  const selectNode = useStore(s => s.selectNode);
  const hoverNode = useStore(s => s.hoverNode);
  const connectingMode = useStore(s => s.connectingMode);
  const connectingFrom = useStore(s => s.connectingFrom);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const focusMode = useStore(s => s.focusMode);
  const connections = useStore(s => s.connections);
  
  const isSelected = selectedNodeId === node.id;
  const isConnectingTarget = connectingMode && connectingFrom === node.id;
  
  // Определяем, isConnected ли эта нода к выбранной
  const isConnected = focusMode && selectedNodeId && connections.some(
    conn => (conn.source === selectedNodeId && conn.target === node.id) ||
            (conn.target === selectedNodeId && conn.source === node.id)
  );
  
  const isDimmed = focusMode && selectedNodeId && !isSelected && !isConnected;
  
  const color = node.color;
  const emissiveIntensity = hovered || isSelected ? 0.8 : 0.3;
  const scale = hovered || isSelected ? 1.1 : 1;
  const opacity = isDimmed ? 0.3 : 1;

  return (
    <group position={node.position}>
      {/* Glow sphere */}
      {(hovered || isSelected) && (
        <Sphere args={[node.size * 1.3, 32, 32]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </Sphere>
      )}

      {/* Main sphere */}
      <Sphere
        ref={meshRef}
        args={[node.size * 0.7, 48, 48]}
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          selectNode(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          hoverNode(node.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          hoverNode(null);
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={opacity}
        />
      </Sphere>

      {/* Inner core */}
      <Sphere args={[node.size * 0.3, 24, 24]}>
        <meshBasicMaterial
          color="white"
          transparent
          opacity={(hovered || isSelected ? 0.8 : 0.2) * opacity}
        />
      </Sphere>

      {/* Ring for stars */}
      {node.status === 'star' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[node.size * 1.1, node.size * 1.3, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={(hovered || isSelected ? 0.6 : 0.25) * opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Black hole effect */}
      {node.status === 'blackhole' && (
        <Sphere args={[node.size * 1.2, 32, 32]}>
          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.8 * opacity}
          />
        </Sphere>
      )}

      {/* Connecting mode indicator */}
      {isConnectingTarget && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[node.size * 1.4, node.size * 1.6, 64]} />
          <meshBasicMaterial
            color="#ec4899"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Label */}
      {(hovered || isSelected) && !isDimmed && (
        <Html
          center
          distanceFactor={15}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-lg px-3 py-1.5 whitespace-nowrap shadow-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">
                {node.status === 'galaxy_center' ? '🌌' : 
                 node.status === 'star' ? '⭐' : 
                 node.status === 'planet' ? '🪐' : 
                 node.status === 'satellite' ? '🛰️' : 
                 node.status === 'blackhole' ? '🕳️' : '☄️'}
              </span>
              <span className="text-white text-xs font-medium">{node.label}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { Connection, TaskNode } from '../types';

interface ConnectionLineProps {
  connection: Connection;
  nodes: TaskNode[];
  isHighlighted: boolean;
  isDimmed: boolean;
}

export default function ConnectionLine({ connection, nodes, isHighlighted, isDimmed }: ConnectionLineProps) {
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  const color = useMemo(() => {
    if (connection.type === 'semantic') return '#06b6d4';
    if (connection.type === 'suggested') return '#ec4899';
    return sourceNode?.color || '#6366f1';
  }, [connection.type, sourceNode]);

  const points = useMemo(() => {
    if (!sourceNode || !targetNode) return [];
    
    const start = new THREE.Vector3(...sourceNode.position);
    const end = new THREE.Vector3(...targetNode.position);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    
    const direction = new THREE.Vector3().subVectors(end, start);
    const perpendicular = new THREE.Vector3()
      .crossVectors(direction, new THREE.Vector3(0, 1, 0))
      .normalize();
    
    if (perpendicular.length() < 0.01) {
      perpendicular.set(1, 0, 0);
    }
    
    const offset = perpendicular.multiplyScalar(start.distanceTo(end) * 0.12);
    mid.add(offset);
    mid.y += start.distanceTo(end) * 0.08;
    
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return curve.getPoints(40).map(p => [p.x, p.y, p.z] as [number, number, number]);
  }, [sourceNode, targetNode]);

  if (points.length === 0) return null;

  let baseOpacity = isDimmed ? 0.05 : 0.2;
  if (isHighlighted) baseOpacity = 0.5;
  
  if (connection.type === 'suggested' && !connection.revealed) {
    baseOpacity = isDimmed ? 0.05 : 0.3;
  }
  
  if (connection.type === 'suggested' && connection.revealed) {
    baseOpacity = isDimmed ? 0.1 : 0.6;
  }

  const lineWidth = isHighlighted ? 1.8 : 1;

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={lineWidth}
        transparent
        opacity={baseOpacity}
      />

      {isHighlighted && (
        <Line
          points={points}
          color={color}
          lineWidth={3}
          transparent
          opacity={0.15}
        />
      )}
    </group>
  );
}

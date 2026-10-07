export type NodeStatus = 'star' | 'planet' | 'satellite' | 'asteroid' | 'blackhole' | 'galaxy_center';

export interface TaskNode {
  id: string;
  label: string;
  description: string;
  status: NodeStatus;
  tags: string[];
  sources: Source[];
  color: string;
  position: [number, number, number];
  size: number;
  constellation?: string;
  isCenter?: boolean;
  distanceFromCenter?: number;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  type: 'hierarchy' | 'semantic' | 'suggested';
  strength: number;
  revealed?: boolean;
}

export interface Source {
  id: string;
  type: 'text' | 'link' | 'file';
  title: string;
  content: string;
  addedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: string;
  nodeId?: string;
}

export interface AISuggestion {
  id: string;
  type: 'link' | 'task' | 'restructure';
  source: string;
  target?: string;
  reason: string;
  confidence: number;
  timestamp: string;
}

export interface AIConfig {
  provider: 'demo' | 'openai' | 'ollama' | 'custom';
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

import { create } from 'zustand';
import { TaskNode, Connection, ChatMessage, AISuggestion, NodeStatus, AIConfig, Source } from './types';

const uuid = () => crypto.randomUUID();

interface GalaxyState {
  nodes: TaskNode[];
  connections: Connection[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  chatMessages: ChatMessage[];
  suggestions: AISuggestion[];
  sidebarOpen: boolean;
  sidebarTab: 'details' | 'ai' | 'sources';
  searchQuery: string;
  focusMode: boolean;
  agentActive: boolean;
  aiConfig: AIConfig;
  connectingMode: boolean;
  connectingFrom: string | null;

  addNode: (position: [number, number, number], data?: Partial<TaskNode>) => void;
  updateNode: (id: string, data: Partial<TaskNode>) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  updateNodeStatus: (id: string, status: NodeStatus) => void;

  addConnection: (source: string, target: string, type?: Connection['type']) => void;
  deleteConnection: (id: string) => void;
  acceptSuggestion: (suggestionId: string) => void;
  dismissSuggestion: (suggestionId: string) => void;

  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChat: () => void;

  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: 'details' | 'ai' | 'sources') => void;
  setSearchQuery: (query: string) => void;
  setFocusMode: (focus: boolean) => void;
  setAgentActive: (active: boolean) => void;
  setAIConfig: (config: Partial<AIConfig>) => void;
  setConnectingMode: (active: boolean) => void;
  setConnectingFrom: (id: string | null) => void;
  calculateDistances: () => void;
  getAccessibleSources: (taskId: string) => { source: Source; nodeId: string; weight: number; taskLabel: string }[];

  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const defaultNodes: TaskNode[] = [
  {
    id: 'center',
    label: 'Работа',
    description: 'Центр галактики — корневая категория',
    status: 'galaxy_center',
    tags: ['корень'],
    sources: [],
    color: '#fbbf24',
    position: [0, 0, 0],
    size: 3,
    constellation: 'main',
    isCenter: true,
  },
  {
    id: '1',
    label: 'Разработка Галактики',
    description: 'Главный проект — 3D планировщик задач с ИИ-агентом',
    status: 'star',
    tags: ['основное', 'проект'],
    sources: [],
    color: '#fbbf24',
    position: [8, 2, -3],
    size: 1.8,
    constellation: 'main',
  },
  {
    id: '2',
    label: 'Дизайн UI',
    description: 'Макеты и прототипы интерфейса',
    status: 'planet',
    tags: ['дизайн', 'ui'],
    sources: [],
    color: '#06b6d4',
    position: [12, 4, -5],
    size: 1.2,
    constellation: 'main',
  },
  {
    id: '3',
    label: 'Интеграция с ИИ',
    description: 'Подключение LLM через API или локально',
    status: 'planet',
    tags: ['ai', 'backend'],
    sources: [],
    color: '#a855f7',
    position: [10, -2, -1],
    size: 1.2,
    constellation: 'main',
  },
  {
    id: '4',
    label: 'Налоговая декларация',
    description: 'Сложная бюрократическая задача',
    status: 'blackhole',
    tags: ['финансы', 'бюрократия'],
    sources: [],
    color: '#6b21a8',
    position: [-10, -3, 6],
    size: 1.6,
    constellation: 'main',
  },
];

const defaultConnections: Connection[] = [
  { id: 'c1', source: 'center', target: '1', type: 'hierarchy', strength: 1 },
  { id: 'c2', source: '1', target: '2', type: 'hierarchy', strength: 0.9 },
  { id: 'c3', source: '1', target: '3', type: 'hierarchy', strength: 0.9 },
  { id: 'c6', source: 'center', target: '4', type: 'hierarchy', strength: 0.7 },
];

export const useStore = create<GalaxyState>((set, get) => ({
  nodes: defaultNodes,
  connections: defaultConnections,
  selectedNodeId: null,
  hoveredNodeId: null,
  chatMessages: [],
  suggestions: [],
  sidebarOpen: true,
  sidebarTab: 'details',
  searchQuery: '',
  focusMode: false,
  agentActive: true,
  aiConfig: {
    provider: 'demo',
    endpoint: '',
    apiKey: '',
    model: '',
    systemPrompt: 'Ты — ИИ-агент для планирования задач.',
  },
  connectingMode: false,
  connectingFrom: null,

  addNode: (position: [number, number, number], data?: Partial<TaskNode>) => {
    const newNode: TaskNode = {
      id: uuid(),
      label: data?.label || 'Новая звезда',
      description: data?.description || '',
      status: data?.status || 'asteroid',
      tags: data?.tags || [],
      sources: data?.sources || [],
      color: data?.color || '#8b5cf6',
      position,
      size: data?.size || 1,
      constellation: data?.constellation,
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
    get().calculateDistances();
    get().saveToStorage();
  },

  updateNode: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, ...data } : node
      ),
    }));
    get().saveToStorage();
  },

  deleteNode: (id) => {
    set((state) => {
      const updatedConnections = state.connections.map((conn) => {
        if (conn.type === 'suggested' && (conn.source === id || conn.target === id)) {
          return { ...conn, revealed: true };
        }
        return conn;
      });

      return {
        nodes: state.nodes.filter((node) => node.id !== id),
        connections: updatedConnections.filter(
          (conn) => conn.source !== id && conn.target !== id
        ),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
    });
    get().calculateDistances();
    get().saveToStorage();
  },

  selectNode: (id) => {
    const state = get();
    
    if (state.connectingMode && state.connectingFrom && id && id !== state.connectingFrom) {
      const existingConnection = state.connections.find(
        conn => (conn.source === state.connectingFrom && conn.target === id) ||
                (conn.source === id && conn.target === state.connectingFrom)
      );
      
      if (!existingConnection) {
        get().addConnection(state.connectingFrom, id, 'semantic');
      }
      
      set({ connectingMode: false, connectingFrom: null });
      return;
    }
    
    if (state.connectingMode && !state.connectingFrom && id) {
      set({ connectingFrom: id });
      return;
    }
    
    set({ selectedNodeId: id, sidebarOpen: id !== null, focusMode: id !== null });
    if (id) set({ sidebarTab: 'details' });
  },

  hoverNode: (id) => set({ hoveredNodeId: id }),

  updateNodeStatus: (id, status) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, status } : node
      ),
    }));
    get().saveToStorage();
  },

  addConnection: (source: string, target: string, type: Connection['type'] = 'hierarchy') => {
    const newConn: Connection = {
      id: uuid(),
      source,
      target,
      type,
      strength: type === 'suggested' ? 0.5 : 1,
      revealed: type !== 'suggested',
    };
    set((state) => ({ connections: [...state.connections, newConn] }));
    get().saveToStorage();
  },

  deleteConnection: (id) => {
    set((state) => ({
      connections: state.connections.filter((conn) => conn.id !== id),
    }));
    get().saveToStorage();
  },

  acceptSuggestion: (suggestionId) => {
    const suggestion = get().suggestions.find((s) => s.id === suggestionId);
    if (suggestion && suggestion.type === 'link' && suggestion.target) {
      get().addConnection(suggestion.source, suggestion.target, 'semantic');
    }
    set((state) => ({
      suggestions: state.suggestions.filter((s) => s.id !== suggestionId),
    }));
  },

  dismissSuggestion: (suggestionId) => {
    set((state) => ({
      suggestions: state.suggestions.filter((s) => s.id !== suggestionId),
    }));
  },

  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: uuid(),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({ chatMessages: [...state.chatMessages, newMessage] }));
  },

  clearChat: () => set({ chatMessages: [] }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFocusMode: (focus) => set({ focusMode: focus }),
  setAgentActive: (active) => set({ agentActive: active }),
  setAIConfig: (config) => set((state) => ({ aiConfig: { ...state.aiConfig, ...config } })),
  setConnectingMode: (active) => set({ connectingMode: active, connectingFrom: null }),
  setConnectingFrom: (id) => set({ connectingFrom: id }),
  
  calculateDistances: () => {
    const state = get();
    const centerNode = state.nodes.find(n => n.isCenter || n.status === 'galaxy_center');
    if (!centerNode) return;
    
    const updatedNodes = state.nodes.map(node => {
      if (node.id === centerNode.id) {
        return { ...node, distanceFromCenter: 0 };
      }
      
      const dx = node.position[0] - centerNode.position[0];
      const dy = node.position[1] - centerNode.position[1];
      const dz = node.position[2] - centerNode.position[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      return { ...node, distanceFromCenter: distance };
    });
    
    set({ nodes: updatedNodes });
  },
  
  getAccessibleSources: (taskId) => {
    const state = get();
    const task = state.nodes.find(n => n.id === taskId);
    if (!task) return [];
    
    const accessibleSources: { source: Source; nodeId: string; weight: number; taskLabel: string }[] = [];
    
    task.sources.forEach(source => {
      accessibleSources.push({
        source,
        nodeId: task.id,
        weight: 1.0,
        taskLabel: task.label,
      });
    });
    
    const connectedTasks = state.connections
      .filter(conn => conn.source === taskId || conn.target === taskId)
      .map(conn => conn.source === taskId ? conn.target : conn.source);
    
    connectedTasks.forEach(connectedId => {
      const connectedNode = state.nodes.find(n => n.id === connectedId);
      if (!connectedNode) return;
      
      const distance = connectedNode.distanceFromCenter || 0;
      const weight = 1 / (1 + distance * 0.1);
      
      connectedNode.sources.forEach(source => {
        accessibleSources.push({
          source,
          nodeId: connectedNode.id,
          weight,
          taskLabel: connectedNode.label,
        });
      });
    });
    
    const parentConnections = state.connections.filter(
      conn => conn.target === taskId && conn.type === 'hierarchy'
    );
    
    parentConnections.forEach(conn => {
      const parentNode = state.nodes.find(n => n.id === conn.source);
      if (!parentNode) return;
      
      const distance = parentNode.distanceFromCenter || 0;
      const weight = 0.5 / (1 + distance * 0.15);
      
      parentNode.sources.forEach(source => {
        accessibleSources.push({
          source,
          nodeId: parentNode.id,
          weight,
          taskLabel: parentNode.label,
        });
      });
    });
    
    return accessibleSources;
  },

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem('galaxy-ai-data-v2');
      if (saved) {
        const data = JSON.parse(saved);
        set({
          nodes: data.nodes || defaultNodes,
          connections: data.connections || defaultConnections,
          chatMessages: data.chatMessages || [],
          suggestions: data.suggestions || [],
          aiConfig: data.aiConfig || get().aiConfig,
        });
      }
      setTimeout(() => get().calculateDistances(), 0);
    } catch (e) {
      console.error('Failed to load from storage:', e);
    }
  },

  saveToStorage: () => {
    try {
      const state = get();
      localStorage.setItem('galaxy-ai-data-v2', JSON.stringify({
        nodes: state.nodes,
        connections: state.connections,
        chatMessages: state.chatMessages,
        suggestions: state.suggestions,
        aiConfig: state.aiConfig,
      }));
    } catch (e) {
      console.error('Failed to save to storage:', e);
    }
  },
}));

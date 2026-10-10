import { create } from 'zustand';
import {
  TaskNode, Connection, ChatMessage, AISuggestion, NodeStatus,
  AIConfig, Source, SemanticKind, LifecycleStage, SemanticRelationType,
  AnalysisResult, AIAnalysisMeta,
} from './types';
import { analyzeNewThought, preliminaryClassify } from './utils/aiAgent';
import { connectionDuplicate, hasHierarchyCycle } from './utils/connectionGuards';
import { verifyQuotes, verifyClaims } from './utils/evidenceVerifier';

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function defaultAIAnalysis(): AIAnalysisMeta {
  return {
    state: 'not_started',
    suggestedKind: 'unknown',
    suggestedCosmicType: 'asteroid',
    confidence: 0,
    reasoning: '',
    lastAnalyzedAt: null,
    errorMessage: null,
  };
}

function createNode(
  overrides: Partial<TaskNode> & { id: string; label: string; position: [number, number, number] }
): TaskNode {
  const t = now();
  return {
    description: '',
    status: 'asteroid',
    kind: 'unknown',
    lifecycle: 'unknown',
    tags: [],
    sources: [],
    color: '#8b5cf6',
    size: 1,
    createdAt: t,
    updatedAt: t,
    aiAnalysis: defaultAIAnalysis(),
    ...overrides,
  };
}

interface GalaxyState {
  nodes: TaskNode[];
  connections: Connection[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  chatMessages: ChatMessage[];
  suggestions: AISuggestion[];
  sidebarOpen: boolean;
  sidebarTab: 'details' | 'ai' | 'sources' | 'inbox';
  searchQuery: string;
  focusMode: boolean;
  agentActive: boolean;
  aiConfig: AIConfig;
  connectingMode: boolean;
  connectingFrom: string | null;
  dataVersion: number;
  processingNodeIds: string[];

  addNode: (position: [number, number, number], data?: Partial<TaskNode>) => string;
  updateNode: (id: string, data: Partial<TaskNode>) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  updateNodeStatus: (id: string, status: NodeStatus) => void;

  addThought: (originalText: string) => string;
  analyzeNode: (nodeId: string) => Promise<void>;
  applyAnalysisResult: (nodeId: string, result: AnalysisResult) => void;

  addConnection: (source: string, target: string, type?: Connection['type']) => void;
  deleteConnection: (id: string) => void;
  acceptSuggestion: (suggestionId: string) => void;
  acceptParentSuggestion: (suggestionId: string) => void;
  dismissSuggestion: (suggestionId: string) => void;
  rejectSuggestion: (suggestionId: string) => void;
  rejectAllNodeSuggestions: (nodeId: string) => void;

  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChat: () => void;

  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: 'details' | 'ai' | 'sources' | 'inbox') => void;
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
const VALID_KINDS = new Set<SemanticKind>(["idea","goal","project","task","observation","question","fact","problem","decision","resource","event","habit","unknown"]);
const VALID_LIFECYCLES = new Set<LifecycleStage>(["inbox","proposed","confirmed","planned","active","waiting","done","someday","archived","unknown"]);
const VALID_STATUS = new Set<NodeStatus>(["galaxy_center","star","cluster","system","planet","satellite","asteroid","comet","meteor","blackhole"]);
const VALID_ANALYSIS_STATES = new Set(["not_started","processing","completed","fallback","failed"]);

function migrateNodes(rawNodes: any[]): TaskNode[] {
  if (!Array.isArray(rawNodes)) return [];
  return rawNodes.filter(Boolean).map((n: any) => {
    const t = now();
    const kind = VALID_KINDS.has(n.kind) ? n.kind : "unknown";
    const lifecycle = VALID_LIFECYCLES.has(n.lifecycle) ? n.lifecycle : (n.isCenter || n.status === "galaxy_center" ? "confirmed" : "unknown");
    const status = VALID_STATUS.has(n.status) ? n.status : "asteroid";
    const ai = (n.aiAnalysis && typeof n.aiAnalysis === "object")
      ? { state: VALID_ANALYSIS_STATES.has(n.aiAnalysis.state)
          ? n.aiAnalysis.state
          : (n.aiAnalysis.state === "error" ? "failed" : "not_started"),
          suggestedKind: VALID_KINDS.has(n.aiAnalysis.suggestedKind) ? n.aiAnalysis.suggestedKind : "unknown",
          suggestedCosmicType: VALID_STATUS.has(n.aiAnalysis.suggestedCosmicType) ? n.aiAnalysis.suggestedCosmicType : "asteroid",
          confidence: typeof n.aiAnalysis.confidence === "number" ? Math.max(0, Math.min(1, n.aiAnalysis.confidence)) : 0,
          reasoning: typeof n.aiAnalysis.reasoning === "string" ? n.aiAnalysis.reasoning : "",
          lastAnalyzedAt: typeof n.aiAnalysis.lastAnalyzedAt === "string" ? n.aiAnalysis.lastAnalyzedAt : null,
          errorMessage: typeof n.aiAnalysis.errorMessage === "string" ? n.aiAnalysis.errorMessage : null,
          analysisSource: n.aiAnalysis.analysisSource === "ai" || n.aiAnalysis.analysisSource === "heuristic" ? n.aiAnalysis.analysisSource : undefined,
        }
      : defaultAIAnalysis();
    return {
      id: typeof n.id === "string" && n.id ? n.id : uuid(),
      label: typeof n.label === "string" ? n.label : "без названия",
      description: typeof n.description === "string" ? n.description : "",
      status, kind, lifecycle,
      originalText: typeof n.originalText === "string" ? n.originalText : undefined,
      aiAnalysis: ai,
      tags: Array.isArray(n.tags) ? n.tags.filter((t: any) => typeof t === "string") : [],
      sources: Array.isArray(n.sources) ? n.sources.filter((s: any) => s && typeof s.id === "string").map((s: any) => ({
        id: s.id, type: ["text","link","file"].includes(s.type) ? s.type : "text",
        title: typeof s.title === "string" ? s.title : "",
        content: typeof s.content === "string" ? s.content : "",
        addedAt: typeof s.addedAt === "string" ? s.addedAt : t,
      })) : [],
      color: typeof n.color === "string" ? n.color : "#8b5cf6",
      position: Array.isArray(n.position) && n.position.length === 3 ? n.position : [Math.random()*4-2, Math.random()*2, Math.random()*4-2],
      size: typeof n.size === "number" && n.size > 0 ? n.size : 1,
      constellation: typeof n.constellation === "string" ? n.constellation : undefined,
      isCenter: !!n.isCenter,
      distanceFromCenter: typeof n.distanceFromCenter === "number" ? n.distanceFromCenter : undefined,
      createdAt: typeof n.createdAt === "string" ? n.createdAt : t,
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : t,
    };
  });
}
function migrateNodesV2toV3(rawNodes: any[]): TaskNode[] {
  return migrateNodes(rawNodes).map((n) => {
    if (!n.originalText) {
      return { ...n, originalText: undefined, lifecycle: n.isCenter || n.status === "galaxy_center" ? "confirmed" : "unknown", aiAnalysis: { ...n.aiAnalysis, state: "not_started" as const } };
    }
    return n;
  });
}

/** Миграция v3→v4: гарантирует один корень «Я» (galaxy_center), добавляет meteor-статус. */
function migrateToV4(nodes: TaskNode[]): TaskNode[] {
  const galaxyCenters = nodes.filter((n) => n.status === "galaxy_center");
  let root: TaskNode | undefined;
  if (galaxyCenters.length === 1) {
    root = galaxyCenters[0];
  } else if (galaxyCenters.length > 1) {
    // Несколько центров — оставляем первый, остальные переводим в star
    root = galaxyCenters[0];
    nodes = nodes.map((n) => {
      if (n.status === "galaxy_center" && n.id !== root!.id) {
        return { ...n, status: "star" as NodeStatus, isCenter: false, lifecycle: "unknown" as const };
      }
      return n;
    });
  }
  if (!root) {
    // Если центра нет, находим любой с isCenter или создаём новый
    const candidate = nodes.find((n) => n.isCenter);
    if (candidate) {
      root = { ...candidate, status: "galaxy_center", isCenter: true, lifecycle: "confirmed" };
      nodes = nodes.map((n) => n.id === root!.id ? root! : n);
    } else {
      root = createNode({ id: uuid(), label: "Я", description: "Центр галактики — пользователь и его общий контекст", status: "galaxy_center", kind: "unknown", lifecycle: "confirmed", tags: ["корень"], color: "#fbbf24", position: [0, 0, 0], size: 3, constellation: "main", isCenter: true });
      nodes = [root, ...nodes];
    }
  }
  // Гарантируем isCenter и lifecycle у корня
  nodes = nodes.map((n) => {
    if (n.id === root!.id) return { ...n, isCenter: true, lifecycle: "confirmed" as const, status: "galaxy_center" as NodeStatus };
    return n;
  });
  return nodes;
}

function getSmartPosition(nodes: TaskNode[]): [number, number, number] {
  const tooClose = (x: number, y: number, z: number) =>
    nodes.some((n) => { const dx=n.position[0]-x, dy=n.position[1]-y, dz=n.position[2]-z; return dx*dx+dy*dy+dz*dz < 4; });
  let angle = Math.random()*Math.PI*2, radius = 10+Math.random()*4;
  let x = Math.cos(angle)*radius, z = Math.sin(angle)*radius, y = (Math.random()-0.5)*3;
  let attempts = 0;
  while (tooClose(x,y,z) && attempts < 20) { angle+=0.6; radius+=1; x=Math.cos(angle)*radius; z=Math.sin(angle)*radius; y=(Math.random()-0.5)*4; attempts++; }
  return [x, y, z];
}

function positionNearParent(parent: TaskNode): [number, number, number] {
  const angle = Math.random()*Math.PI*2, dist = parent.size*1.8+1.5;
  return [parent.position[0]+Math.cos(angle)*dist, parent.position[1]+(Math.random()-0.5)*1.5, parent.position[2]+Math.sin(angle)*dist];
}

const defaultNodes: TaskNode[] = [
  createNode({ id: "center", label: "Я", description: "Центр галактики — пользователь и его общий контекст", status: "galaxy_center", kind: "unknown", lifecycle: "confirmed", tags: ["корень"], color: "#fbbf24", position: [0,0,0], size: 3, constellation: "main", isCenter: true }),
  createNode({ id: "1", label: "Разработка Галактики", description: "Главный проект — 3D планировщик задач с ИИ-агентом", status: "star", kind: "project", lifecycle: "active", tags: ["основное","проект"], color: "#fbbf24", position: [8,2,-3], size: 1.8, constellation: "main" }),
  createNode({ id: "2", label: "Дизайн UI", description: "Макеты и прототипы интерфейса", status: "planet", kind: "task", lifecycle: "planned", tags: ["дизайн","ui"], color: "#06b6d4", position: [12,4,-5], size: 1.2, constellation: "main" }),
  createNode({ id: "3", label: "Интеграция с ИИ", description: "Подключение LLM через API или локально", status: "planet", kind: "task", lifecycle: "active", tags: ["ai","backend"], color: "#a855f7", position: [10,-2,-1], size: 1.2, constellation: "main" }),
  createNode({ id: "4", label: "Налоговая декларация", description: "Сложная бюрократическая задача", status: "blackhole", kind: "problem", lifecycle: "waiting", tags: ["финансы","бюрократия"], color: "#6b21a8", position: [-10,-3,6], size: 1.6, constellation: "main" }),
];

const defaultConnections: Connection[] = [
  { id: uuid(), source: "1", target: "center", type: "hierarchy", strength: 1, revealed: true },
  { id: uuid(), source: "2", target: "1", type: "hierarchy", strength: 1, revealed: true },
  { id: uuid(), source: "3", target: "1", type: "hierarchy", strength: 1, revealed: true },
  { id: uuid(), source: "4", target: "center", type: "hierarchy", strength: 1, revealed: true },
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
  aiConfig: { provider: 'demo' as const, endpoint: '', apiKey: '', model: '', systemPrompt: 'Ты — ИИ-агент для планирования задач.' },
  connectingMode: false,
  connectingFrom: null,
  dataVersion: 3,
  processingNodeIds: [],

  addNode: (position, data = {}) => {
    const newNode = createNode({
      id: uuid(), label: data.label ?? 'Новая звезда', description: data.description ?? '',
      status: data.status ?? 'asteroid', kind: data.kind ?? 'unknown', lifecycle: data.lifecycle ?? 'unknown',
      tags: data.tags ?? [], sources: data.sources ?? [], color: data.color ?? '#8b5cf6',
      position, size: data.size ?? 1, constellation: data.constellation, isCenter: data.isCenter,
      originalText: data.originalText, aiAnalysis: data.aiAnalysis,
    });
    set((s) => ({ nodes: [...s.nodes, newNode] }));
    get().calculateDistances();
    get().saveToStorage();
    return newNode.id;
  },

  updateNode: (id, data) => {
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...data, updatedAt: now() } : n)) }));
    get().calculateDistances();
    get().saveToStorage();
  },

  deleteNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      connections: state.connections.filter((c) => c.source !== id && c.target !== id),
      suggestions: state.suggestions.filter((s) => s.source !== id && s.target !== id && s.analyzedNodeId !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      processingNodeIds: state.processingNodeIds.filter((pid) => pid !== id),
    }));
    get().calculateDistances();
    get().saveToStorage();
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  hoverNode: (id) => set({ hoveredNodeId: id }),
  updateNodeStatus: (id, status) => get().updateNode(id, { status }),

  addThought: (originalText) => {
    if (!originalText.trim()) return '';
    const id = get().addNode(getSmartPosition(get().nodes), {
      label: originalText.slice(0, 60), description: '',
      status: 'asteroid', kind: 'unknown', lifecycle: 'inbox',
      originalText, color: '#06b6d4', size: 0.9, aiAnalysis: defaultAIAnalysis(),
    });
    // Автозапуск ИИ-анализа управляется из HUD (сохранение → анализ),
    // чтобы рабочее место имело единую точку контроля и блокировки повторной отправки.
    return id;
  },

  analyzeNode: async (nodeId) => {
    const state = get();
    if (state.processingNodeIds.includes(nodeId)) return;
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    get().updateNode(nodeId, { aiAnalysis: { ...(node.aiAnalysis || defaultAIAnalysis()), state: 'processing', processingStartedAt: now(), errorMessage: null } });
    set((s) => ({ processingNodeIds: [...s.processingNodeIds, nodeId] }));
    try {
      const result = await analyzeNewThought(node, get().nodes, get().connections, get().aiConfig);
      get().applyAnalysisResult(nodeId, result);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      get().updateNode(nodeId, { aiAnalysis: { ...(get().nodes.find((n) => n.id === nodeId)?.aiAnalysis || defaultAIAnalysis()), state: 'failed', errorMessage: errorMsg, lastAnalyzedAt: now() } });
    } finally {
      set((s) => ({ processingNodeIds: s.processingNodeIds.filter((pid) => pid !== nodeId) }));
    }
  },

  applyAnalysisResult: (nodeId, result) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Верификация доказательств ИИ клиентом
    const verified = verifyClaims(result.claims, node);
    const isLowConfidence = result.confidence < 0.35;
    get().updateNode(nodeId, {
      kind: isLowConfidence ? 'unknown' : result.kind,
      status: isLowConfidence ? 'asteroid' : result.cosmicType,
      lifecycle: isLowConfidence ? 'inbox' : result.lifecycle,
      label: result.suggestedLabel || node.label,
      description: result.suggestedDescription || node.description,
      aiAnalysis: { state: 'completed', suggestedKind: result.kind, suggestedCosmicType: result.cosmicType, confidence: result.confidence, reasoning: result.reasoning, lastAnalyzedAt: now(), errorMessage: null, analysisSource: 'ai', claims: verified },
    });
    const newSuggestions: AISuggestion[] = [];
    if (result.proposedParentId && result.proposedParentId !== nodeId && !hasHierarchyCycle(state.connections, result.proposedParentId, nodeId) && !connectionDuplicate(state.connections, nodeId, result.proposedParentId, 'hierarchy')) {
      newSuggestions.push({ id: uuid(), type: 'link', source: nodeId, target: result.proposedParentId, connectionType: 'hierarchy', reason: result.reasoning || 'Предложено ИИ', confidence: result.confidence, timestamp: now(), analyzedNodeId: nodeId });
    }
    for (const rel of result.proposedRelations) {
      if (rel.targetId !== nodeId && !connectionDuplicate(state.connections, nodeId, rel.targetId, 'semantic')) {
        const evidence = verifyQuotes(rel.evidence, node);  // клиентская проверка
        newSuggestions.push({ id: uuid(), type: 'link', source: nodeId, target: rel.targetId, connectionType: 'semantic', relationKind: rel.relationType, reason: rel.reason || result.reasoning || 'Предложено ИИ', confidence: rel.confidence, timestamp: now(), analyzedNodeId: nodeId, evidence });
      }
    }
    if (newSuggestions.length > 0) set((s) => ({ suggestions: [...s.suggestions, ...newSuggestions] }));
    get().saveToStorage();
  },
addConnection: (source, target, type = 'hierarchy') => {
    const state = get();
    if (connectionDuplicate(state.connections, source, target, type)) return;
    if (type === 'hierarchy' && hasHierarchyCycle(state.connections, source, target)) return;
    if (!state.nodes.find((n) => n.id === source) || !state.nodes.find((n) => n.id === target)) return;
    if (source === target) return;
    set((s) => ({ connections: [...s.connections, { id: uuid(), source, target, type, strength: type === 'suggested' ? 0.5 : 1, revealed: type !== 'suggested' }] }));
    get().saveToStorage();
  },

  deleteConnection: (id) => { set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })); get().saveToStorage(); },

  acceptSuggestion: (suggestionId) => {
    const suggestion = get().suggestions.find((s) => s.id === suggestionId);
    if (suggestion && suggestion.type === 'link' && suggestion.target) {
      const node = get().nodes.find((n) => n.id === suggestion.source);
      if (suggestion.connectionType === 'hierarchy') {
        get().addConnection(suggestion.source, suggestion.target, 'hierarchy');
        if (node) get().updateNode(suggestion.source, { lifecycle: 'confirmed', position: positionNearParent(node) });
      } else {
        // Семантическая связь: проверяем существование обоих узлов и дубликат
        const state = get();
        const targetExists = state.nodes.some((n) => n.id === suggestion.target);
        const sourceExists = state.nodes.some((n) => n.id === suggestion.source);
        if (sourceExists && targetExists && !connectionDuplicate(state.connections, suggestion.source, suggestion.target, 'semantic')) {
          set((s) => ({ connections: [...s.connections, { id: uuid(), source: suggestion.source, target: suggestion.target, type: 'semantic', relationKind: suggestion.relationKind || 'related_to', strength: 1, revealed: true }] }));
        }
      }
    }
    set((s) => ({ suggestions: s.suggestions.filter((s) => s.id !== suggestionId) }));
    get().saveToStorage();
  },

  acceptParentSuggestion: (suggestionId) => {
    const suggestion = get().suggestions.find((s) => s.id === suggestionId && s.connectionType === 'hierarchy' && s.target);
    if (!suggestion || !suggestion.target) { set((s) => ({ suggestions: s.suggestions.filter((s) => s.id !== suggestionId) })); return; }
    get().addConnection(suggestion.source, suggestion.target, 'hierarchy');
    get().updateNode(suggestion.source, { lifecycle: 'confirmed' });
    const node = get().nodes.find((n) => n.id === suggestion.source);
    if (node) get().updateNode(suggestion.source, { position: positionNearParent(node) });
    set((s) => ({ suggestions: s.suggestions.filter((s) => s.id !== suggestionId) }));
    get().saveToStorage();
  },

  dismissSuggestion: (suggestionId) => { set((s) => ({ suggestions: s.suggestions.filter((s) => s.id !== suggestionId) })); get().saveToStorage(); },
  rejectSuggestion: (suggestionId) => { set((s) => ({ suggestions: s.suggestions.filter((s) => s.id !== suggestionId) })); get().saveToStorage(); },
  rejectAllNodeSuggestions: (nodeId) => { set((s) => ({ suggestions: s.suggestions.filter((s) => s.source !== nodeId && s.analyzedNodeId !== nodeId) })); get().saveToStorage(); },

  addChatMessage: (message) => { set((s) => ({ chatMessages: [...s.chatMessages, { ...message, id: uuid(), timestamp: now() }] })); get().saveToStorage(); },
  clearChat: () => { set({ chatMessages: [] }); get().saveToStorage(); },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFocusMode: (focus) => set({ focusMode: focus }),
  setAgentActive: (active) => { set({ agentActive: active }); get().saveToStorage(); },
  setAIConfig: (config) => { set((s) => ({ aiConfig: { ...s.aiConfig, ...config } })); get().saveToStorage(); },
  setConnectingMode: (active) => set({ connectingMode: active }),
  setConnectingFrom: (id) => set({ connectingFrom: id }),
calculateDistances: () => {
    set((state) => {
      const centerNode = state.nodes.find((n) => n.isCenter || n.status === 'galaxy_center');
      if (!centerNode) return {};
      const updatedNodes = state.nodes.map((node) => {
        if (node.id === centerNode.id) return { ...node, distanceFromCenter: 0 };
        const dx = node.position[0] - centerNode.position[0];
        const dy = node.position[1] - centerNode.position[1];
        const dz = node.position[2] - centerNode.position[2];
        return { ...node, distanceFromCenter: Math.sqrt(dx * dx + dy * dy + dz * dz) };
      });
      return { nodes: updatedNodes };
    });
  },

  getAccessibleSources: (taskId) => {
    const state = get();
    const task = state.nodes.find((n) => n.id === taskId);
    if (!task) return [];
    const result: { source: Source; nodeId: string; weight: number; taskLabel: string }[] = [];
    task.sources.forEach((source) => result.push({ source, nodeId: task.id, weight: 1.0, taskLabel: task.label }));
    const connectedTasks = state.connections
      .filter((conn) => conn.source === taskId || conn.target === taskId)
      .map((conn) => conn.source === taskId ? conn.target : conn.source);
    connectedTasks.forEach((connectedId) => {
      const connectedNode = state.nodes.find((n) => n.id === connectedId);
      if (!connectedNode) return;
      const distance = connectedNode.distanceFromCenter || 0;
      const weight = 1 / (1 + distance * 0.1);
      connectedNode.sources.forEach((source) => result.push({ source, nodeId: connectedNode.id, weight, taskLabel: connectedNode.label }));
    });
    return result;
  },

  loadFromStorage: () => {
    try {
      let saved = localStorage.getItem('galaxy-ai-data-v4');
      if (saved) {
        const data = JSON.parse(saved);
        set({
          nodes: migrateToV4(migrateNodes(data.nodes || [])),
          connections: data.connections || [],
          chatMessages: data.chatMessages || [],
          suggestions: data.suggestions || [],
          aiConfig: data.aiConfig || get().aiConfig,
          agentActive: data.agentActive ?? true,
          dataVersion: 4,
        });
      } else {
        saved = localStorage.getItem('galaxy-ai-data-v3');
        if (saved) {
          const data = JSON.parse(saved);
          set({
            nodes: migrateToV4(migrateNodes(data.nodes || [])),
            connections: data.connections || [],
            chatMessages: data.chatMessages || [],
            suggestions: data.suggestions || [],
            aiConfig: data.aiConfig || get().aiConfig,
            agentActive: data.agentActive ?? true,
            dataVersion: 4,
          });
        } else {
          saved = localStorage.getItem('galaxy-ai-data-v2');
          if (saved) {
            const data = JSON.parse(saved);
            set({
              nodes: migrateToV4(migrateNodesV2toV3(data.nodes || [])),
              connections: data.connections || [],
              chatMessages: data.chatMessages || [],
              suggestions: data.suggestions || [],
              aiConfig: data.aiConfig || get().aiConfig,
              agentActive: data.agentActive ?? true,
              dataVersion: 4,
            });
          }
        }
      }
      setTimeout(() => get().calculateDistances(), 0);
    } catch (e) { console.error('Failed to load from storage:', e); }
  },

  saveToStorage: () => {
    try {
      const state = get();
      localStorage.setItem('galaxy-ai-data-v4', JSON.stringify({
        dataVersion: 4,
        nodes: state.nodes,
        connections: state.connections,
        chatMessages: state.chatMessages,
        suggestions: state.suggestions,
        aiConfig: state.aiConfig,
        agentActive: state.agentActive,
        sidebarOpen: state.sidebarOpen,
        sidebarTab: state.sidebarTab,
      }));
    } catch (e) { console.error('Failed to save:', e); }
  },
}));
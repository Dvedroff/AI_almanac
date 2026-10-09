export type NodeStatus =
  | 'galaxy_center'
  | 'star'
  | 'cluster'
  | 'system'
  | 'planet'
  | 'satellite'
  | 'asteroid'
  | 'comet'
  | 'blackhole';

/** Смысловой тип записи (независим от космического класса и жизненного цикла). */
export type SemanticKind =
  | 'idea'
  | 'goal'
  | 'project'
  | 'task'
  | 'observation'
  | 'question'
  | 'fact'
  | 'problem'
  | 'decision'
  | 'resource'
  | 'event'
  | 'habit'
  | 'unknown';

/** Стадия жизненного цикла записи. */
export type LifecycleStage =
  | 'inbox'
  | 'proposed'
  | 'confirmed'
  | 'planned'
  | 'active'
  | 'waiting'
  | 'done'
  | 'someday'
  | 'archived'
  | 'unknown';

/** Состояние ИИ-анализа конкретной записи. */
export type AIAnalysisState =
  | 'not_started'
  | 'processing'
  | 'completed'
  | 'error';

/** Метаданные анализа записи. Позволяет отличить реальный анализ от значений по умолчанию. */
export interface AIAnalysisMeta {
  state: AIAnalysisState;
  suggestedKind: SemanticKind;
  suggestedCosmicType: NodeStatus;
  confidence: number; // 0..1, эвристика уверенности, не доказанная вероятность
  reasoning: string;
  lastAnalyzedAt: string | null;
  errorMessage: string | null;
  processingStartedAt?: string;
}

/** Смысловое отношение между объектами (не иерархическое). */
export type SemanticRelationType =
  | 'related_to'
  | 'supports'
  | 'depends_on'
  | 'conflicts_with'
  | 'duplicate_of'
  | 'derived_from'
  | 'part_of';

export interface TaskNode {
  id: string;
  label: string;
  description: string;
  status: NodeStatus;
  kind: SemanticKind;
  lifecycle: LifecycleStage;
  originalText?: string;
  aiAnalysis?: AIAnalysisMeta;
  tags: string[];
  sources: Source[];
  color: string;
  position: [number, number, number];
  size: number;
  constellation?: string;
  isCenter?: boolean;
  distanceFromCenter?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  type: 'hierarchy' | 'semantic' | 'suggested';
  relationKind?: SemanticRelationType; // смысловой тип для semantic-связей
  strength: number;
  revealed?: boolean;
  /** Для type='suggested' — ID предложения, из которого создана связь */
  suggestionId?: string;
}

export interface Source {
  id: string;
  /**
   * Тип источника.
   * - `text`    — текстовый контент, инжектится в промпт ИИ (RAG).
   * - `link`    — URL-ссылка, в промпт не попадает, хранится как метаданные.
   * - `file`    — файл (пока не обрабатывается RAG, зарезервирован).
   */
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
  /** ID исходного узла (для link — source) */
  source: string;
  /** ID целевого узла (для link — target) */
  target?: string;
  /** Тип связи: hierarchy (родительская) или semantic (смысловая) */
  connectionType?: 'hierarchy' | 'semantic';
  /** Смысловой тип отношения (для connectionType='semantic') */
  relationKind?: SemanticRelationType;
  reason: string;
  confidence: number;
  timestamp: string;
  /** Был ли пользователь уведомлён (для предотвращения повторных предложений) */
  notified?: boolean;
  /** ID узла, который анализировался (для привязки предложения к источнику анализа) */
  analyzedNodeId?: string;
}

/** Структура результата анализа ИИ для одной записи. */
export interface AnalysisResult {
  kind: SemanticKind;
  cosmicType: NodeStatus;
  lifecycle: LifecycleStage;
  suggestedLabel: string;
  suggestedDescription: string;
  proposedParentId: string | null;
  proposedRelations: ProposedRelation[];
  confidence: number;
  reasoning: string;
  clarificationNeeded: boolean;
}

/** Предлагаемая смысловая связь. */
export interface ProposedRelation {
  targetId: string;
  relationType: SemanticRelationType;
  reason: string;
  confidence: number;
}

export interface AIConfig {
  provider: 'demo' | 'openai' | 'ollama' | 'custom';
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

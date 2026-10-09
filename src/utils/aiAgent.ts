import {
  AIConfig,
  AnalysisResult,
  Connection,
  SemanticKind,
  LifecycleStage,
  NodeStatus,
  TaskNode,
  SemanticRelationType,
} from '../types';
import { callLLM, LLMValidationError } from './aiService';

const MAX_CONTEXT_NODES = 25;

const ALL_KINDS: SemanticKind[] = [
  'idea', 'goal', 'project', 'task', 'observation', 'question',
  'fact', 'problem', 'decision', 'resource', 'event', 'habit', 'unknown',
];

const ALL_LIFECYCLES: LifecycleStage[] = [
  'inbox', 'proposed', 'confirmed', 'planned', 'active',
  'waiting', 'done', 'someday', 'archived', 'unknown',
];

const ALL_COSMIC: NodeStatus[] = [
  'galaxy_center', 'star', 'cluster', 'system', 'planet',
  'satellite', 'asteroid', 'comet', 'blackhole',
];

const ALL_RELATIONS: SemanticRelationType[] = [
  'related_to', 'supports', 'depends_on', 'conflicts_with',
  'duplicate_of', 'derived_from', 'part_of',
];

function relevanceScore(text: string, node: TaskNode): number {
  const tokens = text.toLowerCase().split(/[^a-zР°-СЏС‘0-9]+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return 0;
  const haystack = `${node.label} ${node.description}`.toLowerCase();
  let match = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) match += 1;
  }
  let tagMatch = 0;
  for (const tag of node.tags) {
    if (text.toLowerCase().includes(tag.toLowerCase())) tagMatch += 1;
  }
  return (match / tokens.length) * 0.8 + Math.min(tagMatch, 3) * 0.2;
}

interface ContextShape {
  nodes: TaskNode[];
  hierarchy: { parent: string; child: string }[];
  semantic: { source: string; target: string; kind: SemanticRelationType }[];
}

function buildContext(newNode: TaskNode, allNodes: TaskNode[], connections: Connection[]): ContextShape {
  const text = newNode.originalText || newNode.label || '';
  const candidates = allNodes
    .filter((n) => n.id !== newNode.id && n.status !== 'galaxy_center')
    .map((n) => ({ node: n, score: relevanceScore(text, n) }))
    .sort((a, b) => b.score - a.score);
  const top = candidates
    .filter((c) => c.score > 0 || c.node.kind !== 'unknown')
    .slice(0, MAX_CONTEXT_NODES)
    .map((c) => c.node);
  const hierarchy = connections
    .filter((c) => c.type === 'hierarchy')
    .map((c) => ({ parent: c.source, child: c.target }));
  const semantic = connections
    .filter((c) => c.type === 'semantic')
    .map((c) => ({ source: c.source, target: c.target, kind: c.relationKind || 'related_to' as SemanticRelationType }));
  return { nodes: top, hierarchy, semantic };
}
export async function analyzeNewThought(
  newNode: TaskNode,
  allNodes: TaskNode[],
  connections: Connection[],
  aiConfig: AIConfig
): Promise<AnalysisResult> {
  if (aiConfig.provider === 'demo') {
    return heuristicAnalysis(newNode, allNodes, connections);
  }

  const context = buildContext(newNode, allNodes, connections);
  const userText = newNode.originalText || newNode.label;
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(userText, context);

  try {
    const response = await callLLM(aiConfig, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { json: true });
    const parsed = parseAnalysisResponse(response.content);
    return normalizeResult(parsed, newNode, allNodes, connections);
  } catch (e) {
    if (e instanceof LLMValidationError) {
      const heuristic = heuristicAnalysis(newNode, allNodes, connections);
      return { ...heuristic, reasoning: `РћС‚РІРµС‚ РјРѕРґРµР»Рё РЅРµ РїСЂРѕС€С‘Р» РІР°Р»РёРґР°С†РёСЋ: ${e.message}. РСЃРїРѕР»СЊР·РѕРІР°РЅР° СЌРІСЂРёСЃС‚РёРєР°.` };
    }
    const heuristic = heuristicAnalysis(newNode, allNodes, connections);
    return { ...heuristic, reasoning: `РњРѕРґРµР»СЊ РЅРµРґРѕСЃС‚СѓРїРЅР°: ${e instanceof Error ? e.message : 'РѕС€РёР±РєР°'}. РСЃРїРѕР»СЊР·РѕРІР°РЅР° СЌРІСЂРёСЃС‚РёРєР°.` };
  }
}
function buildSystemPrompt(): string {
  const schema = {
    kind: 'idea|goal|project|task|observation|question|fact|problem|decision|resource|event|habit|unknown',
    cosmicType: 'galaxy_center|star|cluster|system|planet|satellite|asteroid|comet|blackhole',
    lifecycle: 'inbox|proposed|confirmed|planned|active|waiting|done|someday|archived|unknown',
    suggestedLabel: 'РєСЂР°С‚РєРѕРµ РЅР°Р·РІР°РЅРёРµ',
    suggestedDescription: 'РєРѕСЂРѕС‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ',
    proposedParentId: 'ID СѓР·Р»Р° РёР· РєРѕРЅС‚РµРєСЃС‚Р° РёР»Рё null',
    proposedRelations: [{ targetId: 'ID', relationType: 'related_to|supports|depends_on|conflicts_with|duplicate_of|derived_from|part_of', reason: 'РїРѕС‡РµРјСѓ', confidence: 0.5 }],
    confidence: 0.7,
    reasoning: 'РєСЂР°С‚РєРѕРµ РѕР±РѕСЃРЅРѕРІР°РЅРёРµ',
    clarificationNeeded: false,
  };

  return [
    'РўС‹ вЂ” РР-Р°СЃСЃРёСЃС‚РµРЅС‚ РїРµСЂСЃРѕРЅР°Р»СЊРЅРѕРіРѕ Р±Р»РѕРєРЅРѕС‚Р°-РіР°Р»Р°РєС‚РёРєРё.',
    'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ РЅРѕРІСѓСЋ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рё РІРµСЂРЅРё СЃС‚СЂРѕРіРѕ JSON Р±РµР· РїРѕСЏСЃРЅРµРЅРёР№.',
    '',
    'РџСЂР°РІРёР»Р°:',
    '- РќРµ РІС‹РґСѓРјС‹РІР°Р№ С„Р°РєС‚С‹. РЎСЃС‹Р»Р°Р№СЃСЏ С‚РѕР»СЊРєРѕ РЅР° СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ ID РёР· РєРѕРЅС‚РµРєСЃС‚Р°.',
    '- РЎР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅР°СЏ Р·Р°РїРёСЃСЊ Р±РµР· СЃРІСЏР·РµР№ вЂ” РґРѕРїСѓСЃС‚РёРјС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚.',
    '- Р•СЃР»Рё РґР°РЅРЅС‹С… РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ, РІРµСЂРЅРё kind="unknown", confidence=0, proposedParentId=null.',
    '- РќРµ РїСЂРёСЃРІР°РёРІР°Р№ lifecycle="active"/"done" Р±РµР· РѕСЃРЅРѕРІР°РЅРёР№.',
    '- РќРµ РјРµРЅСЏР№ РёРµСЂР°СЂС…РёСЋ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёС… Р·Р°РїРёСЃРµР№. РўРѕР»СЊРєРѕ РїСЂРµРґР»РѕР¶Рё СЂРѕРґРёС‚РµР»СЏ РґР»СЏ РЅРѕРІРѕР№.',
    '',
    'Р¤РѕСЂРјР°С‚ РѕС‚РІРµС‚Р° (С‚РѕР»СЊРєРѕ JSON):',
    JSON.stringify(schema, null, 2),
  ].join('\n');
}
function buildUserPrompt(userText: string, context: ContextShape): string {
  const lines: string[] = [];
  lines.push(`РќРћР’РђРЇ Р—РђРџРРЎР¬ (РёСЃС…РѕРґРЅС‹Р№ С‚РµРєСЃС‚): "${userText}"`);
  lines.push('');

  if (context.nodes.length === 0) {
    lines.push('РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ РѕР±СЉРµРєС‚С‹ РіР°Р»Р°РєС‚РёРєРё: (РЅРµС‚)');
  } else {
    lines.push('РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ РѕР±СЉРµРєС‚С‹ РіР°Р»Р°РєС‚РёРєРё (ID, РЅР°Р·РІР°РЅРёРµ, С‚РёРї, СЃС‚Р°С‚СѓСЃ, РѕРїРёСЃР°РЅРёРµ):');
    context.nodes.forEach((n) => {
      lines.push(`- #${n.id} "${n.label}" kind=${n.kind} status=${n.status}${n.description ? ` | ${n.description}` : ''}`);
    });
  }

  if (context.hierarchy.length > 0) {
    lines.push('');
    lines.push('РџРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Рµ РёРµСЂР°СЂС…РёС‡РµСЃРєРёРµ СЃРІСЏР·Рё:');
    context.hierarchy.forEach((h) => lines.push(`- ${h.parent} -> ${h.child}`));
  }

  if (context.semantic.length > 0) {
    lines.push('');
    lines.push('РџРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Рµ СЃРјС‹СЃР»РѕРІС‹Рµ СЃРІСЏР·Рё:');
    context.semantic.forEach((s) => lines.push(`- ${s.source} --${s.kind}--> ${s.target}`));
  }

  lines.push('');
  lines.push('РћРїСЂРµРґРµР»Рё СЃРјС‹СЃР»РѕРІРѕР№ С‚РёРї, РєРѕСЃРјРёС‡РµСЃРєРёР№ РєР»Р°СЃСЃ Рё РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё СЂРѕРґРёС‚РµР»СЏ/СЃРІСЏР·Рё.');
  lines.push('РќРµ РІС‹РґСѓРјС‹РІР°Р№ ID. РќРµ СЃРѕР·РґР°РІР°Р№ СЃРІСЏР·Рё Р±РµР· РѕСЃРЅРѕРІР°РЅРёР№.');
  return lines.join('\n');
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  return 0;
}
function parseAnalysisResponse(content: string): AnalysisResult {
  const cleaned = content
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new LLMValidationError('РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РІР»РµС‡СЊ JSON РёР· РѕС‚РІРµС‚Р° РјРѕРґРµР»Рё');
  }

  const o = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

  const kind = ALL_KINDS.includes(o.kind as SemanticKind) ? (o.kind as SemanticKind) : 'unknown';
  const cosmicType = ALL_COSMIC.includes(o.cosmicType as NodeStatus) ? (o.cosmicType as NodeStatus) : 'asteroid';
  const lifecycle = ALL_LIFECYCLES.includes(o.lifecycle as LifecycleStage)
    ? (o.lifecycle as LifecycleStage)
    : 'unknown';
  const confidence = clampConfidence(o.confidence);
  const rawRelations = Array.isArray(o.proposedRelations) ? o.proposedRelations : [];
  const proposedRelations = rawRelations
    .map((r: unknown) => {
      if (typeof r !== 'object' || r === null) return null;
      const rr = r as Record<string, unknown>;
      const targetId = typeof rr.targetId === 'string' ? rr.targetId : null;
      const relationType = ALL_RELATIONS.includes(rr.relationType as SemanticRelationType)
        ? (rr.relationType as SemanticRelationType)
        : 'related_to';
      if (!targetId) return null;
      return {
        targetId,
        relationType,
        reason: typeof rr.reason === 'string' ? rr.reason : '',
        confidence: clampConfidence(rr.confidence),
      };
    })
    .filter((r: unknown): r is { targetId: string; relationType: SemanticRelationType; reason: string; confidence: number } => r !== null);

  return {
    kind,
    cosmicType,
    lifecycle,
    suggestedLabel: typeof o.suggestedLabel === 'string' ? o.suggestedLabel.trim() : '',
    suggestedDescription: typeof o.suggestedDescription === 'string' ? o.suggestedDescription.trim() : '',
    proposedParentId: typeof o.proposedParentId === 'string' ? o.proposedParentId : null,
    proposedRelations,
    confidence,
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
    clarificationNeeded: !!o.clarificationNeeded,
  };
}

function normalizeResult(
  result: AnalysisResult,
  newNode: TaskNode,
  allNodes: TaskNode[],
  _connections: Connection[]
): AnalysisResult {
  const validIds = new Set(allNodes.map((n) => n.id));
  const parentId = result.proposedParentId && result.proposedParentId !== newNode.id && validIds.has(result.proposedParentId)
    ? result.proposedParentId
    : null;
  const seen = new Set<string>();
  const proposedRelations = result.proposedRelations.filter((r) => {
    if (!validIds.has(r.targetId) || r.targetId === newNode.id) return false;
    if (seen.has(r.targetId)) return false;
    seen.add(r.targetId);
    return true;
  });

  return { ...result, proposedParentId: parentId, proposedRelations };
}
function heuristicAnalysis(
  newNode: TaskNode,
  allNodes: TaskNode[],
  _connections: Connection[]
): AnalysisResult {
  const text = (newNode.originalText || newNode.label || '').toLowerCase();

  let kind: SemanticKind = 'unknown';
  let cosmicType: NodeStatus = 'asteroid';
  let lifecycle: LifecycleStage = 'inbox';
  let confidence = 0.3;

  if (/СЃРѕР·РґР°С‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµ|СЂР°Р·СЂР°Р±РѕС‚Р°С‚СЊ|СЃРґРµР»Р°С‚СЊ (РЅР° |)РїСЂРёР»РѕР¶РµРЅРёРµ|СЃРѕР·РґР°С‚СЊ|РїРѕСЃС‚СЂРѕРёС‚СЊ|СЂРµР°Р»РёР·РѕРІР°С‚СЊ|РЅР°РїРёСЃР°С‚СЊ/.test(text)) {
    kind = 'project';
    cosmicType = 'star';
    confidence = 0.6;
  } else if (/РґРѕР»Р¶РµРЅ|РЅСѓР¶РЅРѕ|РЅРµРѕР±С…РѕРґРёРјРѕ|СЃРґРµР»Р°С‚СЊ|СЂРµР°Р»РёР·РѕРІР°С‚СЊ|РІС‹РїРѕР»РЅРёС‚СЊ|Р·Р°РґР°С‡Р°|СЃСЂРѕС‡РЅРѕ|РЅР°РґРѕ/.test(text)) {
    kind = 'task';
    cosmicType = 'planet';
    confidence = 0.55;
  } else if (/РёРґРµСЏ|РїСЂРёРґСѓРјР°С‚СЊ|РІРѕР·РјРѕР¶РЅРѕ Р±С‹Р»Рѕ Р±С‹|С…РѕСЂРѕС€Рѕ Р±С‹Р»Рѕ Р±С‹/.test(text)) {
    kind = 'idea';
    cosmicType = 'comet';
    confidence = 0.5;
  } else if (/\?|РёРЅС‚РµСЂРµСЃРЅРѕ|РЅРµ РїРѕРЅРёРјР°СЋ|РїРѕС‡РµРјСѓ|РєР°Рє/.test(text)) {
    kind = 'question';
    cosmicType = 'asteroid';
    confidence = 0.45;
  } else if (/РїСЂРѕР±Р»РµРјР°|РЅРµ СЂР°Р±РѕС‚Р°РµС‚|РѕС€РёР±РєР°|СЃР»РѕРјР°РЅ|Р±Р°Рі|Р·Р°СЃС‚СЂРµРІР°РµС‚/.test(text)) {
    kind = 'problem';
    cosmicType = 'blackhole';
    confidence = 0.6;
  } else if (/С„Р°РєС‚|РёР·РІРµСЃС‚РЅРѕ|СѓСЃС‚Р°РЅРѕРІР»РµРЅРѕ|Р·Р°РєРѕРЅ|РїСЂР°РІРёР»Рѕ/.test(text)) {
    kind = 'fact';
    cosmicType = 'planet';
    confidence = 0.5;
  } else if (/С†РµР»СЊ|РґРѕР±РёС‚СЊСЃСЏ|РґРѕСЃС‚РёС‡СЊ|С…РѕС‡Сѓ РґРѕСЃС‚РёРіРЅСѓС‚СЊ/.test(text)) {
    kind = 'goal';
    cosmicType = 'star';
    confidence = 0.55;
  } else if (/Р·Р°РІС‚СЂР°|СЃРµРіРѕРґРЅСЏ|СЃРѕР±С‹С‚РёРµ|РІСЃС‚СЂРµС‡Р°|РґР°С‚Р°|РїРѕРЅРµРґРµР»СЊРЅРёРє|РІС‚РѕСЂРЅРёРє|СЃСЂРµРґР°|С‡РµС‚РІРµСЂРі|РїСЏС‚РЅРёС†Р°|СЃСѓР±Р±РѕС‚Р°|РІРѕСЃРєСЂРµСЃРµРЅСЊРµ/.test(text)) {
    kind = 'event';
    cosmicType = 'comet';
    confidence = 0.5;
  } else if (/РїСЂРёРІС‹С‡РєР°|РµР¶РµРґРЅРµРІРЅРѕ|РєР°Р¶РґС‹Р№ РґРµРЅСЊ|СЂРµРіСѓР»СЏСЂРЅРѕ|РїРѕРІС‚РѕСЂСЏС‚СЊ/.test(text)) {
    kind = 'habit';
    cosmicType = 'satellite';
    confidence = 0.6;
  } else if (/РЅР°Р±Р»СЋРґРµРЅРёРµ|Р·Р°РјРµС‚РёР»|Р·Р°РјРµС‡Р°СЋ|РІРёР¶Сѓ С‡С‚Рѕ/.test(text)) {
    kind = 'observation';
    cosmicType = 'asteroid';
    confidence = 0.5;
  }

  let proposedParentId: string | null = null;
  const tokens = text.split(/[^a-zР°-СЏС‘0-9]+/).filter((t) => t.length > 2);
  let bestScore = -1;
  for (const node of allNodes) {
    if (node.id === newNode.id || node.status === 'galaxy_center') continue;
    const hay = `${node.kind} ${node.label} ${node.description}`.toLowerCase();
    let s = 0;
    for (const tok of tokens) {
      if (tok.length > 2 && hay.includes(tok)) s += 1;
    }
    if (s > bestScore) {
      bestScore = s;
      proposedParentId = node.id;
    }
  }
  if (bestScore < 1) proposedParentId = null;

  const proposedRelations: AnalysisResult['proposedRelations'] = [];
  const seenIds = new Set<string>();
  for (const node of allNodes) {
    if (node.id === newNode.id || node.id === proposedParentId) continue;
    const wordOverlap = keywordsOverlap(text, `${node.label} ${node.description}`);
    if (wordOverlap) {
      if (proposedRelations.length >= 3) break;
      if (!seenIds.has(node.id)) {
        proposedRelations.push({
          targetId: node.id,
          relationType: 'related_to',
          reason: 'РџРµСЂРµСЃРµС‡РµРЅРёРµ РєР»СЋС‡РµРІС‹С… СЃР»РѕРІ',
          confidence: 0.4,
        });
        seenIds.add(node.id);
      }
    }
  }

  const label = deriveLabel(newNode, kind);
  const description = deriveDescription(newNode, kind);

  return {
    kind,
    cosmicType,
    lifecycle,
    suggestedLabel: label,
    suggestedDescription: description,
    proposedParentId,
    proposedRelations,
    confidence,
    reasoning: 'Р­РІСЂРёСЃС‚РёС‡РµСЃРєРёР№ Р°РЅР°Р»РёР· СЃ РїСЂР°РІРёР»Р°РјРё (Р±РµР· РїРѕРґРєР»СЋС‡С‘РЅРЅРѕР№ РР-РјРѕРґРµР»Рё)',
    clarificationNeeded: confidence < 0.4,
  };
}

function keywordsOverlap(a: string, b: string): boolean {
  const setA = new Set(a.toLowerCase().split(/[^a-zР°-СЏС‘0-9]+/).filter((t) => t.length > 3));
  const setB = new Set(b.toLowerCase().split(/[^a-zР°-СЏС‘0-9]+/).filter((t) => t.length > 3));
  let count = 0;
  for (const t of setA) if (setB.has(t)) count += 1;
  return count >= 2;
}

function deriveLabel(node: TaskNode, _kind: SemanticKind): string {
  const src = node.originalText || node.label || '';
  const clean = src.replace(/\s+/g, ' ').trim();
  if (clean.length <= 60) return clean || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ';
  return clean.slice(0, 57).trimEnd() + '...';
}

function deriveDescription(node: TaskNode, kind: SemanticKind): string {
  const src = node.originalText || node.label || '';
  const typeLabel = kind === 'unknown' ? 'РњС‹СЃР»СЊ' : kind.charAt(0).toUpperCase() + kind.slice(1);
  return src ? `${typeLabel}: ${src.trim()}` : '';
}

export const ANALYSIS_PROMPT_CONSTANTS = { MAX_CONTEXT_NODES };

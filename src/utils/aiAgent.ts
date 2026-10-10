import {
  AIConfig,
  AnalysisResult,
  Connection,
  SemanticKind,
  LifecycleStage,
  NodeStatus,
  TaskNode,
  SemanticRelationType,
  EvidenceQuote,
  EvidenceSource,
  Claim,
  ClaimStatus,
} from '../types';
import { callLLM, sanitizeAgainstInjection, LLMValidationError, LLMUnavailableError, LLMTimeoutError } from './aiService';
import { hasHierarchyCycle } from './connectionGuards';

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
  'satellite', 'asteroid', 'comet', 'meteor', 'blackhole',
];

const ALL_RELATIONS: SemanticRelationType[] = [
  'related_to', 'supports', 'depends_on', 'conflicts_with',
  'duplicate_of', 'derived_from', 'part_of',
  'uses_resource', 'contributes_to_goal',
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
  const userText = sanitizeAgainstInjection(newNode.originalText || newNode.label);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(userText, context);
  // Каждый вызов использует свежий массив messages — контекст изолирован, нет глобального кеша ответов.
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  // Логирование: провайдер, модель, время, ID анализируемой мысли.
  const startTime = Date.now();
  const tag = `[aiAgent][${newNode.id.slice(0, 8)}]`;

  // Одна повторная попытка для сетевых/таймаут-ошибок. Ошибки валидации JSON
  // не ретраятся — модель вернула контент, но он некорректен по структуре.
  const MAX_ATTEMPTS = 2;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`${tag} Запрос к ${aiConfig.provider}/${aiConfig.model}, попытка ${attempt}/${MAX_ATTEMPTS}`);
      const response = await callLLM(aiConfig, messages, { json: true });
      console.log(`${tag} Ответ получен за ${Date.now() - startTime} мс`);
      const parsed = parseAnalysisResponse(response.content);
      return normalizeResult(parsed, newNode, allNodes, connections);
    } catch (e) {
      lastError = e;
      const errMsg = e instanceof Error ? e.message : String(e);
      const errType = e instanceof LLMValidationError ? 'LLMValidationError'
        : e instanceof LLMTimeoutError ? 'LLMTimeoutError'
        : e instanceof LLMUnavailableError ? 'LLMUnavailableError'
        : e?.constructor?.name || 'unknown';
      console.warn(`${tag} Ошибка (${errType}, попытка ${attempt}): ${errMsg}`);
      if (e instanceof LLMValidationError) break;
      if (e instanceof LLMUnavailableError || e instanceof LLMTimeoutError) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
      }
      break;
    }
  }

  // Пробрасываем ошибку наверх — store сам решит, применять ли эвристику.
  console.error(`${tag} Модель недоступна после ${Date.now() - startTime} мс`, lastError instanceof Error ? lastError.message : String(lastError));
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
function buildSystemPrompt(): string {
  const schema = {
    kind: 'idea|goal|project|task|observation|question|fact|problem|decision|resource|event|habit|unknown',
    cosmicType: 'galaxy_center|star|cluster|system|planet|satellite|asteroid|comet|meteor|blackhole',
    lifecycle: 'inbox|proposed|confirmed|planned|active|waiting|done|someday|archived|unknown',
    suggestedLabel: 'РєСЂР°С‚РєРѕРµ РЅР°Р·РІР°РЅРёРµ',
    suggestedDescription: 'РєРѕСЂРѕС‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ',
    proposedParentId: 'ID СѓР·Р»Р° РёР· РєРѕРЅС‚РµРєСЃС‚Р° РёР»Рё null',
    proposedRelations: [{ targetId: 'ID', relationType: 'related_to|supports|depends_on|conflicts_with|duplicate_of|derived_from|part_of|uses_resource|contributes_to_goal', reason: 'РїРѕС‡РµРјСѓ', confidence: 0.5 }],
    confidence: 0.7,
    reasoning: 'РєСЂР°С‚РєРѕРµ РѕР±РѕСЃРЅРѕРІР°РЅРёРµ',
    clarificationNeeded: false,
claims: [{ text: 'утверждение', classification: 'factual|interpretation|guess', evidence: [{ text: 'цитата', source: 'original_text' }] }],
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
'- Приведи хотя бы одну цитату (поле evidence/claims) из исходного текста пользователя или описаний узлов для каждой предлагаемой связи и утверждения. Связи без цитат игнорируются.',
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
        evidence: parseEvidence(rr.evidence),
      };
    })
    .filter((r: unknown): r is { targetId: string; relationType: SemanticRelationType; reason: string; confidence: number; evidence?: EvidenceQuote[] } => r !== null);

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
    claims: parseClaims(o.claims),
  };
}

function parseEvidence(raw: unknown): EvidenceQuote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q: unknown): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map((q) => {
      const source = (['original_text', 'description', 'source_document', 'inferred'] as EvidenceSource[])
        .includes(q.source as EvidenceSource)
        ? (q.source as EvidenceSource)
        : 'inferred';
      return {
        text: typeof q.text === 'string' ? q.text : '',
        source,
        position: typeof q.position === 'number' ? q.position : undefined,
        status: ('unchecked' as ClaimStatus),
      };
    })
    .filter((q) => q.text.length > 0);
}

function parseClaims(raw: unknown): Claim[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => {
      const classification = (['factual', 'interpretation', 'guess'] as Claim['classification'][])
        .includes(c.classification as Claim['classification'])
        ? (c.classification as Claim['classification'])
        : 'interpretation';
      return {
        text: typeof c.text === 'string' ? c.text : '',
        classification,
        supported: !!c.supported,
        evidence: parseEvidence(c.evidence),
      };
    })
    .filter((c) => c.text.length > 0);
}

function normalizeResult(
  result: AnalysisResult,
  newNode: TaskNode,
  allNodes: TaskNode[],
  connections: Connection[]
): AnalysisResult {
  const validIds = new Set(allNodes.map((n) => n.id));
  const parentCandidate = result.proposedParentId && result.proposedParentId !== newNode.id && validIds.has(result.proposedParentId)
    ? result.proposedParentId
    : null;
  // Запрещаем предлагать родителя, который создаст цикл в иерархии.
  const parentId = parentCandidate && !hasHierarchyCycle(connections, parentCandidate, newNode.id)
    ? parentCandidate
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
export function heuristicAnalysis(
  newNode: TaskNode,
  allNodes: TaskNode[],
  _connections: Connection[]
): AnalysisResult {
  const text = (newNode.originalText || newNode.label || '').toLowerCase();

  let kind: SemanticKind = 'unknown';
  let cosmicType: NodeStatus = 'asteroid';
  let lifecycle: LifecycleStage = 'inbox';
  let confidence = 0.3;

  // 1. Markers of "thought/idea" — highest priority (not project, not task).
  if (/появилась мысль|пришла идея|пришла мысль|мысль создать|мысль сделать|\bидея\b|придумать|возможно было бы|хорошо было бы/.test(text)) {
    kind = 'idea';
    cosmicType = 'meteor';
    confidence = 0.6;
  }
  // 2. "Want X" (receive/earn/achieve) — a goal, not a task.
  else if (/хочу\s+(получать|зарабатывать|иметь|купить|достичь|добиться|освоить|научиться|изучить)/.test(text)) {
    kind = 'goal';
    cosmicType = 'system';
    confidence = 0.6;
  }
  // 3. Project (creation/development).
  else if (/создать приложение|разработать|сделать (на |)приложение|создать|построить|реализовать|написать/.test(text)) {
    kind = 'project';
    cosmicType = 'star';
    confidence = 0.6;
  } else if (/должен|нужно|необходимо|сделать|реализовать|выполнить|задача|срочно|надо/.test(text)) {
    kind = 'task';
    cosmicType = 'planet';
    confidence = 0.55;
  } else if (/\?|интересно|не понимаю|почему|как/.test(text)) {
    kind = 'question';
    cosmicType = 'asteroid';
    confidence = 0.45;
  } else if (/проблема|не работает|ошибка|сломан|баг|застревает/.test(text)) {
    kind = 'problem';
    cosmicType = 'blackhole';
    confidence = 0.6;
  } else if (/факт|известно|установлено|закон|правило/.test(text)) {
    kind = 'fact';
    cosmicType = 'planet';
    confidence = 0.5;
  } else if (/цель|добиться|достичь|хочу достигнуть/.test(text)) {
    kind = 'goal';
    cosmicType = 'star';
    confidence = 0.55;
  } else if (/завтра|сегодня|событие|встреча|дата|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье/.test(text)) {
    kind = 'event';
    cosmicType = 'comet';
    confidence = 0.5;
  } else if (/привычка|ежедневно|каждый день|регулярно|повторять/.test(text)) {
    kind = 'habit';
    cosmicType = 'satellite';
    confidence = 0.6;
  } else if (/наблюдение|заметил|замечаю|вижу что/.test(text)) {
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


/** Lightweight pre-classification called immediately on thought save.
 * Returns only kind/cosmicType/lifecycle/confidence — no relations.
 * Never returns 'confirmed' lifecycle. */
export function preliminaryClassify(originalText: string): {
  kind: SemanticKind;
  cosmicType: NodeStatus;
  lifecycle: LifecycleStage;
  confidence: number;
} {
  const text = originalText.toLowerCase();
  let kind: SemanticKind = 'unknown';
  let cosmicType: NodeStatus = 'asteroid';
  let confidence = 0.3;

  if (/появилась мысль|пришла идея|пришла мысль|мысль создать|мысль сделать|\bидея\b|придумать|возможно было бы|хорошо было бы/.test(text)) {
    kind = 'idea';
    cosmicType = 'meteor';
    confidence = 0.6;
  }
  else if (/хочу\s+(получать|зарабатывать|иметь|купить|достичь|добиться|освоить|научиться|изучить)/.test(text)) {
    kind = 'goal';
    cosmicType = 'system';
    confidence = 0.6;
  }
  else if (/создать приложение|разработать|сделать (на |)приложение|создать|построить|реализовать|написать/.test(text)) {
    kind = 'project';
    cosmicType = 'star';
    confidence = 0.6;
  }
  else if (/должен|нужно|необходимо|сделать|реализовать|выполнить|задача|срочно|надо/.test(text)) {
    kind = 'task';
    cosmicType = 'planet';
    confidence = 0.55;
  }
  else if (/\?|интересно|не понимаю|почему|как/.test(text)) {
    kind = 'question';
    cosmicType = 'asteroid';
    confidence = 0.45;
  }
  else if (/проблема|не работает|ошибка|сломан|баг|застревает/.test(text)) {
    kind = 'problem';
    cosmicType = 'blackhole';
    confidence = 0.6;
  }
  else if (/факт|известно|установлено|закон|правило/.test(text)) {
    kind = 'fact';
    cosmicType = 'planet';
    confidence = 0.5;
  }
  else if (/цель|добиться|достичь|хочу достигнуть/.test(text)) {
    kind = 'goal';
    cosmicType = 'star';
    confidence = 0.55;
  }
  else if (/завтра|сегодня|событие|встреча|дата|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье/.test(text)) {
    kind = 'event';
    cosmicType = 'comet';
    confidence = 0.5;
  }
  else if (/привычка|ежедневно|каждый день|регулярно|повторять/.test(text)) {
    kind = 'habit';
    cosmicType = 'satellite';
    confidence = 0.6;
  }
  else if (/наблюдение|заметил|замечаю|вижу что/.test(text)) {
    kind = 'observation';
    cosmicType = 'asteroid';
    confidence = 0.5;
  }

  return {
    kind,
    cosmicType,
    lifecycle: 'inbox' as LifecycleStage,
    confidence,
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

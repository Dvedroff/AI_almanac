import { useState } from 'react';
import { useStore } from '../store';
import { SemanticKind, NodeStatus, LifecycleStage, SemanticRelationType } from '../types';

const KIND_LABELS: Record<SemanticKind, string> = {
  idea: 'Идея', goal: 'Цель', project: 'Проект', task: 'Задача',
  observation: 'Наблюдение', question: 'Вопрос', fact: 'Факт', problem: 'Проблема',
  decision: 'Решение', resource: 'Ресурс', event: 'Событие', habit: 'Привычка', unknown: 'Не определено',
};
const KIND_ORDER = Object.keys(KIND_LABELS) as SemanticKind[];

const COSMIC_LABELS: Record<NodeStatus, string> = {
  galaxy_center: '🌌 Центр', star: '⭐ Звезда', cluster: '🌟 Кластер', system: '💫 Система',
  planet: '🪐 Планета', satellite: '🛰️ Спутник', asteroid: '🪨 Астероид', comet: '☄️ Комета', meteor: '🌠 Метеор', blackhole: '🕳️ Чёрная дыра',
};

const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  inbox: 'Входящие', proposed: 'Предложено', confirmed: 'Подтверждено', planned: 'Запланировано',
  active: 'Активно', waiting: 'Ожидание', done: 'Готово', someday: 'Когда-нибудь', archived: 'Архив', unknown: 'Не определено',
};

const RELATION_LABELS: Record<SemanticRelationType, string> = {
  related_to: 'Связано', supports: 'Поддерживает', depends_on: 'Зависит от', conflicts_with: 'Конфликтует',
  duplicate_of: 'Дубль', derived_from: 'Происходит из', part_of: 'Часть',
  uses_resource: 'Использует ресурс', contributes_to_goal: 'Вносит вклад в цель',
};

export default function InboxPanel() {
  const suggestions = useStore((s) => s.suggestions);
  const nodes = useStore((s) => s.nodes);
  const processingNodeIds = useStore((s) => s.processingNodeIds);
  const agentActive = useStore((s) => s.agentActive);
  const updateNode = useStore((s) => s.updateNode);
  const analyzeNode = useStore((s) => s.analyzeNode);
  const acceptSuggestion = useStore((s) => s.acceptSuggestion);
  const acceptParentSuggestion = useStore((s) => s.acceptParentSuggestion);
  const rejectSuggestion = useStore((s) => s.rejectSuggestion);
  const rejectAllNodeSuggestions = useStore((s) => s.rejectAllNodeSuggestions);

  const [editingLabel, setEditingLabel] = useState<Record<string, boolean>>({});
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>({});

  const getNodeLabel = (id?: string) => {
    if (!id) return '—';
    return nodes.find((n) => n.id === id)?.label || '(удалён)';
  };
  const getNodeSeen = (id?: string) => {
    if (!id) return false;
    return nodes.some((n) => n.id === id);
  };

  const thoughts = nodes.filter((n) => n.originalText && n.originalText.length > 0);
  const linkSuggestions = suggestions.filter((s) => s.type === 'link');

  const handleSaveLabel = (nodeId: string) => {
    const draft = (labelDraft[nodeId] || '').trim();
    if (draft) updateNode(nodeId, { label: draft });
    setEditingLabel((s) => ({ ...s, [nodeId]: false }));
  };

  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] text-amber-400/80 uppercase tracking-wider">
        Входящие мысли ({thoughts.length})
      </p>
      {thoughts.length === 0 && (
        <p className="text-[11px] text-gray-500 italic">
          Пока нет записей. Нажмите 💭 «Мысль» вверху, чтобы добавить.
        </p>
      )}
      {thoughts.map((n) => {
        const ai = n.aiAnalysis;
        const isProcessing = processingNodeIds.includes(n.id);
        const nodeLinks = linkSuggestions.filter((s) => s.source === n.id || s.analyzedNodeId === n.id);
        return (
          <div key={n.id} className="bg-black/40 border border-amber-500/20 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{n.label}</p>
                <p className="text-[10px] text-gray-500">
                  {ai?.state === 'processing' && '🔄 Анализ…'}
                  {ai?.state === 'completed' && '✅ Анализ выполнен (ИИ)'}
                  {ai?.state === 'fallback' && '⚠️ Эвристика (ИИ недоступен)'}
                  {ai?.state === 'failed' && '❌ Ошибка анализа'}
                  {(!ai || ai?.state === 'not_started') && '⏳ Анализ не запускался'}
                </p>
              </div>
              {isProcessing ? (
                <span className="text-[10px] text-cyan-300 animate-pulse">работает…</span>
              ) : ai?.state === 'failed' || ai?.state === 'fallback' ? (
                <button onClick={() => analyzeNode(n.id)} className="px-2 py-1 bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded text-[10px] font-medium hover:bg-purple-500/30 transition-all">🔄 Повторить анализ</button>
              ) : (
                <button onClick={() => analyzeNode(n.id)} className="px-2 py-1 bg-white/5 text-gray-400 border border-white/10 rounded text-[10px] font-medium hover:bg-white/10 transition-all" title="Запустить/повторить анализ ИИ">🔄 Анализ</button>
              )}
            </div>

            {n.originalText && (
              <p className="text-[11px] text-gray-400 italic border-l-2 border-amber-500/30 pl-2">«{n.originalText}»</p>
            )}

            {editingLabel[n.id] ? (
              <div className="flex gap-2">
                <input autoFocus value={labelDraft[n.id] ?? n.label} onChange={(e) => setLabelDraft((s) => ({ ...s, [n.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLabel(n.id); if (e.key === 'Escape') setEditingLabel((s) => ({ ...s, [n.id]: false })); }} className="flex-1 px-2 py-1 bg-black/40 border border-cyan-500/30 rounded text-xs text-white outline-none" />
                <button onClick={() => handleSaveLabel(n.id)} className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-[10px]">OK</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-300">Название: <span className="text-cyan-300">{n.label}</span></span>
                <button onClick={() => { setLabelDraft((s) => ({ ...s, [n.id]: n.label })); setEditingLabel((s) => ({ ...s, [n.id]: true })); }} className="text-[10px] text-gray-500 hover:text-cyan-300 transition-colors">✏️ Изменить</button>
              </div>
            )}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-gray-500 block mb-1">Смысловой тип</span>
                <select value={n.kind} onChange={(e) => updateNode(n.id, { kind: e.target.value as SemanticKind })} className="w-full px-1.5 py-1 bg-black/40 border border-fuchsia-500/30 rounded text-[10px] text-white outline-none">
                  {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Космический класс</span>
                <select value={n.status} onChange={(e) => updateNode(n.id, { status: e.target.value as NodeStatus })} className="w-full px-1.5 py-1 bg-black/40 border border-cyan-500/30 rounded text-[10px] text-white outline-none">
                  {(Object.keys(COSMIC_LABELS) as NodeStatus[]).map((c) => <option key={c} value={c}>{COSMIC_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 block mb-1">Стадия жизненного цикла</span>
                <select value={n.lifecycle} onChange={(e) => updateNode(n.id, { lifecycle: e.target.value as LifecycleStage })} className="w-full px-1.5 py-1 bg-black/40 border border-purple-500/30 rounded text-[10px] text-white outline-none">
                  {(Object.keys(LIFECYCLE_LABELS) as LifecycleStage[]).map((l) => <option key={l} value={l}>{LIFECYCLE_LABELS[l]}</option>)}
                </select>
              </div>
            </div>
          {ai?.state === 'completed' && ai.reasoning && (
              <p className="text-[10px] text-gray-400 italic">💡 {ai.reasoning}</p>
            )}
            {ai?.state === 'failed' && ai.errorMessage && (
              <p className="text-[10px] text-red-400">⚠️ {ai.errorMessage}</p>
            )}
            {ai && ai.state === 'completed' && (
              <p className="text-[10px] text-gray-500">Уверенность: <span className="text-amber-300">{(ai.confidence * 100).toFixed(0)}%</span></p>
            )}

            {nodeLinks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500">Предложенные связи:</p>
                {nodeLinks.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 bg-black/20 rounded-lg px-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px]">
                        {s.connectionType === 'hierarchy' ? '🔗 Иерархия: ' : '🔗 '}
                        <span className="text-cyan-300">{getNodeLabel(s.source)}</span>
                        {' → '}
                        <span className="text-purple-300">{getNodeLabel(s.target)}</span>
                      </span>
                      {s.relationKind && s.connectionType === 'semantic' && (
                        <span className="text-[9px] text-gray-500 block">({RELATION_LABELS[s.relationKind]})</span>
                      )}
                      {!getNodeSeen(s.target) && <span className="text-[9px] text-red-400 block">цель удалена</span>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => s.connectionType === 'hierarchy' ? acceptParentSuggestion(s.id) : acceptSuggestion(s.id)} disabled={!getNodeSeen(s.target)} className="px-1.5 py-1 bg-emerald-500/20 text-emerald-300 rounded text-[9px] font-medium hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">✓</button>
                      <button onClick={() => rejectSuggestion(s.id)} className="px-1.5 py-1 bg-red-500/10 text-red-400 rounded text-[9px] font-medium hover:bg-red-500/20 transition-all">✗</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1 border-t border-white/5">
              <button onClick={() => rejectAllNodeSuggestions(n.id)} className="flex-1 px-2 py-1.5 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-medium hover:bg-white/10 transition-all" title="Отклонить все предложенные связи — запись остаётся самостоятельной">🔗 Оставить самостоятельной</button>
              <button onClick={() => updateNode(n.id, { lifecycle: 'confirmed' })} className="flex-1 px-2 py-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-400/30 rounded-lg text-[10px] font-medium hover:bg-emerald-500/20 transition-all" title="Подтвердить запись без связей">✓ Готово</button>
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-amber-400/80 uppercase tracking-wider pt-3 border-t border-white/5">
        Предложенные связи (без карточки) ({linkSuggestions.length})
      </p>
      {linkSuggestions.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">Нет предложений ИИ.</p>
      ) : (
        linkSuggestions.map((s) => (
          <div key={s.id} className="bg-black/40 border border-amber-500/20 rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-xs text-white font-medium">
                  {s.connectionType === 'hierarchy' ? '🔗 Предложена иерархия' : '🔗 Предложена связь'}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  <span className="text-cyan-300">{getNodeLabel(s.source)}</span>
                  {' → '}
                  <span className="text-purple-300">{getNodeLabel(s.target)}</span>
                </p>
              </div>
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {(s.confidence * 100).toFixed(0)}%
              </span>
            </div>
            {s.reason && <p className="text-[10px] text-gray-500 italic">{s.reason}</p>}
            {s.evidence && s.evidence.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">Доказательства:</p>
                {s.evidence.map((q, i) => (
                  <p key={i} className={`text-[9px] ${q.status === 'verified' ? 'text-emerald-400' : 'text-red-400'} leading-tight`}>
                    {q.status === 'verified' ? '✓' : q.status === 'unsupported' ? '✗' : '?'} «{q.text}»
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button disabled={!getNodeSeen(s.target)} onClick={() => s.connectionType === 'hierarchy' ? acceptParentSuggestion(s.id) : acceptSuggestion(s.id)} className="flex-1 px-2 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-lg text-[10px] font-medium hover:bg-emerald-500/30 disabled:opacity-40 transition-all">✓ Принять</button>
              <button onClick={() => rejectSuggestion(s.id)} className="flex-1 px-2 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-medium hover:bg-red-500/20 transition-all">✗ Отклонить</button>
            </div>
          </div>
        ))
      )}

      <p className="text-[9px] text-gray-600">
        Агент: {agentActive ? 'включён (автоанализ новых мыслей)' : 'выключен (ручной анализ)'}. Исходный текст записи никогда не заменяется автоматически.
      </p>
    </div>
  );
}
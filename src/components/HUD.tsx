import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { SemanticKind, NodeStatus, LifecycleStage } from '../types';
import AIPanel from './AIPanel';
import SourcesPanel from './SourcesPanel';
import InboxPanel from './InboxPanel';

const KIND_LABELS: Record<SemanticKind, string> = {
  idea: 'Идея', goal: 'Цель', project: 'Проект', task: 'Задача',
  observation: 'Наблюдение', question: 'Вопрос', fact: 'Факт', problem: 'Проблема',
  decision: 'Решение', resource: 'Ресурс', event: 'Событие', habit: 'Привычка', unknown: 'Не определено',
};
const KIND_ORDER = Object.keys(KIND_LABELS) as SemanticKind[];

const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  inbox: 'Входящие', proposed: 'Предложено', confirmed: 'Подтверждено', planned: 'Запланировано',
  active: 'Активно', waiting: 'Ожидание', done: 'Готово', someday: 'Когда-нибудь', archived: 'Архив', unknown: 'Не определено',
};

export default function HUD() {
  const {
    nodes,
    connections,
    selectedNodeId,
    sidebarOpen,
    sidebarTab,
    searchQuery,
    focusMode,
    connectingMode,
    connectingFrom,
    agentActive,
    setSidebarOpen,
    setSidebarTab,
    setSearchQuery,
    setFocusMode,
    setConnectingMode,
    updateNode,
    deleteNode,
    updateNodeStatus,
    selectNode,
    addThought,
    analyzeNode,
    processingNodeIds,
  } = useStore();

  const [showSearch, setShowSearch] = useState(false);
  const [showThoughtCapture, setShowThoughtCapture] = useState(false);
  const [thoughtText, setThoughtText] = useState('');
  const [thoughtError, setThoughtError] = useState<string | null>(null);
  // Защита от повторной отправки: ref-флаг проверяется внутри обработчика,
  // чтобы блокировка срабатывала даже при двойном клике/Enter и до ре-рендера.
  const submittingRef = useRef(false);
  const [isSubmittingThought, setIsSubmittingThought] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);

  useEffect(() => {
    // Сбрасываем состояние создания, если модалка закрыта вручную
    if (!showThoughtCapture && thoughtError) setThoughtError(null);
  }, [showThoughtCapture, thoughtError]);

  // Сначала надёжно сохраняем запись, затем (если агент активен) запускаем ИИ-анализ.
  // Ошибка ИИ НЕ удаляет и не теряет записанную мысль — узел уже создан в store.
  const handleCaptureThought = async () => {
    const text = thoughtText.trim();
    if (!text) return;
    if (submittingRef.current) return; // блокировка внутри обработчика

    submittingRef.current = true;
    setIsSubmittingThought(true);
    setThoughtError(null);

    try {
      const id = addThought(text); // синхронное создание записи
      if (!id) {
        setThoughtError('Не удалось создать запись. Попробуйте ещё раз.');
      } else {
        setThoughtText('');
        if (agentActive && id) {
          try {
            await analyzeNode(id); // анализ ИИ после сохранения записи
          } catch {
            // Анализ мог завершиться ошибкой, но запись сохранилась — не блокируем закрытие
          }
        }
        setShowThoughtCapture(false);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmittingThought(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const filteredNodes = searchQuery
    ? nodes.filter(
        (n) =>
          n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const statusOptions: { value: NodeStatus; label: string; emoji: string }[] = [
    { value: 'galaxy_center', label: 'Центр', emoji: '🌌' },
    { value: 'star', label: 'Звезда', emoji: '⭐' },
    { value: 'cluster', label: 'Кластер', emoji: '🌟' },
    { value: 'system', label: 'Система', emoji: '💫' },
    { value: 'planet', label: 'Планета', emoji: '🪐' },
    { value: 'satellite', label: 'Спутник', emoji: '🛰️' },
    { value: 'asteroid', label: 'Астероид', emoji: '🪨' },
    { value: 'comet', label: 'Комета', emoji: '☄️' },
    { value: 'meteor', label: 'Метеор', emoji: '🌠' },
    { value: 'blackhole', label: 'Чёрная дыра', emoji: '🕳️' },
  ];

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-30 bg-black/70 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌌</span>
              <h1 className="text-sm font-semibold text-gray-100 leading-tight">
                Галактика
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              {showSearch && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3 z-50">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по галактике..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                    autoFocus
                  />
                  {filteredNodes.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                      {filteredNodes.map((node) => (
                        <button
                          key={node.id}
                          onClick={() => {
                            selectNode(node.id);
                            setSearchQuery('');
                            setShowSearch(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-xs transition-colors flex items-center gap-2"
                        >
                          <span>{node.status === 'galaxy_center' ? '🌌' : node.status === 'star' ? '⭐' : node.status === 'cluster' ? '🌟' : node.status === 'system' ? '💫' : node.status === 'planet' ? '🪐' : node.status === 'satellite' ? '🛰️' : node.status === 'comet' ? '☄️' : node.status === 'meteor' ? '🌠' : node.status === 'blackhole' ? '🕳️' : '🪨'}</span>
                          <span className="text-gray-200 truncate">{node.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setFocusMode(!focusMode)}
              className={`p-2 rounded-lg transition-colors ${
                focusMode ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-white/10 text-gray-400'
              }`}
              title="Режим фокуса"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>

            <button
              onClick={() => setConnectingMode(!connectingMode)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                connectingMode
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)]'
                  : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:border-pink-500/30'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {connectingMode ? (connectingFrom ? 'Выберите 2-ю' : 'Выберите 1-ю') : 'Связь'}
            </button>

            <button
              onClick={() => setShowThoughtCapture(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 text-gray-200 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors border border-white/10"
            >
              <span className="text-sm leading-none">💭</span>
              Мысль
            </button>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed right-0 top-[46px] bottom-0 w-[360px] bg-gray-900/90 backdrop-blur-md border-l border-white/10 z-20 flex flex-col">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setSidebarTab('details')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-all ${
                sidebarTab === 'details'
                  ? 'text-gray-100 border-b-2 border-white/30 bg-white/5'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              📝 Детали
            </button>
            <button
              onClick={() => setSidebarTab('ai')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-colors ${
                sidebarTab === 'ai'
                  ? 'text-gray-100 border-b-2 border-white/30 bg-white/5'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              🤖 ИИ
            </button>
            <button
              onClick={() => setSidebarTab('sources')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-colors ${
                sidebarTab === 'sources'
                  ? 'text-gray-100 border-b-2 border-white/30 bg-white/5'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              📎 Источники
            </button>
            <button
              onClick={() => setSidebarTab('inbox')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-colors ${
                sidebarTab === 'inbox'
                  ? 'text-gray-100 border-b-2 border-white/30 bg-white/5'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              📥 Входящие
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sidebarTab === 'inbox' ? (
              <InboxPanel />
            ) : !selectedNode ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="text-5xl mb-4">🌌</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-2">Выберите объект</h3>
                <p className="text-xs text-gray-500">
                  Кликните на звезду или планету в галактике для просмотра деталей
                </p>
              </div>
            ) : sidebarTab === 'details' ? (
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Название</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:border-white/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Смысловой тип</label>
                  <select
                    value={selectedNode.kind}
                    onChange={(e) => updateNode(selectedNode.id, { kind: e.target.value as SemanticKind })}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-white/25"
                  >
                    {KIND_ORDER.map((k) => (
                      <option key={k} value={k}>{KIND_LABELS[k]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Космический класс</label>
                  <div className="grid grid-cols-2 gap-2">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateNodeStatus(selectedNode.id, opt.value)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          selectedNode.status === opt.value
                            ? 'bg-white/10 text-gray-100 border border-white/30'
                            : 'bg-black/30 text-gray-400 border border-white/10 hover:border-white/25 hover:text-gray-200'
                        }`}
                      >
                        {opt.emoji} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Стадия жизненного цикла</label>
                  <select
                    value={selectedNode.lifecycle}
                    onChange={(e) => updateNode(selectedNode.id, { lifecycle: e.target.value as LifecycleStage })}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-white/25"
                  >
                    {(Object.keys(LIFECYCLE_LABELS) as LifecycleStage[]).map((l) => (
                      <option key={l} value={l}>{LIFECYCLE_LABELS[l]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Цвет</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#fbbf24', '#06b6d4', '#ec4899', '#10b981', '#a855f7', '#f97316', '#ef4444', '#6366f1'].map((color) => (
                      <button
                        key={color}
                        onClick={() => updateNode(selectedNode.id, { color })}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          selectedNode.color === color ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Описание</label>
                  <textarea
                    value={selectedNode.description}
                    onChange={(e) => updateNode(selectedNode.id, { description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:border-white/25 outline-none resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Теги (через запятую)</label>
                  <input
                    type="text"
                    value={selectedNode.tags.join(', ')}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:border-white/25 outline-none transition-colors"
                    placeholder="3d, frontend, ai"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Размер: {selectedNode.size.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={selectedNode.size}
                    onChange={(e) => updateNode(selectedNode.id, { size: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>

                {(() => {
                  const ai = selectedNode.aiAnalysis;
                  const isProcessing = processingNodeIds.includes(selectedNode.id);
                  const stateLabel = isProcessing
                    ? 'Анализ…'
                    : !ai || ai.state === 'not_started'
                      ? 'Не проанализировано'
                      : ai.state === 'failed'
                        ? 'Ошибка анализа'
                        : ai.state === 'processing'
                          ? 'В обработке'
                          : 'Проанализировано (ИИ)';
                  return (
                    <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Состояние ИИ</span>
                        <span className={`text-[10px] font-medium ${isProcessing ? 'text-gray-300' : ai?.state === 'failed' ? 'text-red-400' : ai?.state === 'fallback' ? 'text-amber-400' : ai?.state === 'completed' ? 'text-emerald-400' : 'text-gray-400'}`}>
                          {stateLabel}
                        </span>
                      </div>
                      {(ai?.state === 'completed' || ai?.state === 'fallback') && (
                        <>
                          {ai.suggestedKind && (
                            <p className="text-[10px] text-gray-400">Смысловой тип: <span className="text-gray-200">{KIND_LABELS[ai.suggestedKind] ?? ai.suggestedKind}</span></p>
                          )}
                          {ai.reasoning && (
                            <p className="text-[10px] text-gray-500 italic line-clamp-2">💡 {ai.reasoning}</p>
                          )}
                        </>
                      )}
                      {(ai?.state === 'failed' || ai?.state === 'fallback') && ai.errorMessage && (
                        <p className="text-[10px] text-red-400/90 line-clamp-2">⚠️ {ai.errorMessage}</p>
                      )}
                    </div>
                  );
                })()}

                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="w-full px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
                >
                  🗑️ Удалить объект
                </button>

                <button
                  onClick={() => analyzeNode(selectedNode.id)}
                  className="w-full px-4 py-2 bg-white/5 text-gray-200 border border-white/15 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
                >
                  🔄 Повторить анализ ИИ
                </button>
              </div>
            ) : sidebarTab === 'ai' ? (
              <AIPanel />
            ) : (
              <SourcesPanel selectedNode={selectedNode} updateNode={updateNode} />
            )}
          </div>
        </div>
      )}

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-30 bg-gray-900/80 backdrop-blur-md border border-white/10 rounded-l-lg p-2 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <div className="fixed bottom-4 left-4 z-20">
        <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">Навигация</span>
            <span className="text-[9px] text-gray-500">{showMinimap ? '▾' : '▸'}</span>
          </button>
          {showMinimap && (
            <div className="w-36 h-36 relative bg-black/60 overflow-hidden">
              {nodes.map((node) => {
                const x = ((node.position[0] + 30) / 60) * 100;
                const z = ((node.position[2] + 30) / 60) * 100;
                return (
                  <button
                    key={node.id}
                    onClick={() => selectNode(node.id)}
                    className={`absolute w-2 h-2 rounded-full transition-transform ${
                      selectedNodeId === node.id ? 'ring-1 ring-white scale-150' : 'hover:scale-125'
                    }`}
                    style={{
                      left: `${Math.max(0, Math.min(100, x))}%`,
                      top: `${Math.max(0, Math.min(100, z))}%`,
                      backgroundColor: node.color,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 max-w-md w-full px-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={thoughtText}
            onChange={(e) => setThoughtText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && thoughtText.trim()) {
                e.preventDefault();
                handleCaptureThought();
              }
            }}
            placeholder="Быстрая мысль · Enter для сохранения…"
            className="flex-1 px-3 py-2 bg-black/50 backdrop-blur-sm border border-white/10 rounded-full text-xs text-white placeholder-gray-500 focus:border-white/25 outline-none transition-colors"
          />
          <button
            onClick={() => setShowThoughtCapture(true)}
            className="px-3 py-2 bg-black/50 backdrop-blur-sm border border-white/10 rounded-full text-xs text-gray-400 hover:text-white transition-colors"
            title="Развёрнутый ввод"
          >
            ↕
          </button>
        </div>
      </div>

      {showThoughtCapture && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowThoughtCapture(false)}
        >
          <div
            className="w-[420px] max-w-full bg-gray-900/95 border border-white/10 rounded-2xl p-5 shadow-[0_0_40px_rgba(217,70,239,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-1">💭 Новая мысль</h3>
            <p className="text-[11px] text-gray-500 mb-3">
              {agentActive
                ? 'ИИ автоматически определит тип, класс и предложит связи с существующими объектами.'
                : 'Агент выключен: запись сохранится без автоанализа. Анализ можно запустить вручную (кнопка «Повторить анализ ИИ» или вкладка «Входящие»).'}
            </p>
            <textarea
              value={thoughtText}
              onChange={(e) => setThoughtText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCaptureThought();
                }
              }}
              disabled={isSubmittingThought}
              placeholder="Например: Изучить Three.js для визуализации 3D-графиков..."
              rows={3}
              autoFocus
              className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-white/25 outline-none resize-none transition-colors"
            />
            {thoughtError && (
              <p className="text-[11px] text-red-400 mt-2">
                ⚠️ {thoughtError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowThoughtCapture(false)}
                disabled={isSubmittingThought}
                className="px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                Отмена
              </button>
              <button
                onClick={handleCaptureThought}
                disabled={!thoughtText.trim() || isSubmittingThought}
                className="px-4 py-2 bg-white/10 text-gray-100 rounded-lg text-xs font-medium hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmittingThought ? 'Анализ…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

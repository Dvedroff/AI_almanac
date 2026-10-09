import { useState } from 'react';
import { useStore } from '../store';
import { NodeStatus } from '../types';
import AIPanel from './AIPanel';
import SourcesPanel from './SourcesPanel';

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
    setSidebarOpen,
    setSidebarTab,
    setSearchQuery,
    setFocusMode,
    setConnectingMode,
    updateNode,
    deleteNode,
    updateNodeStatus,
    selectNode,
    addNode,
  } = useStore();

  const [showSearch, setShowSearch] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const filteredNodes = searchQuery
    ? nodes.filter(
        (n) =>
          n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const stats = {
    stars: nodes.filter((n) => n.status === 'star').length,
    planets: nodes.filter((n) => n.status === 'planet').length,
    satellites: nodes.filter((n) => n.status === 'satellite').length,
    asteroids: nodes.filter((n) => n.status === 'asteroid').length,
    connections: connections.length,
  };

  const statusOptions: { value: NodeStatus; label: string; emoji: string }[] = [
    { value: 'galaxy_center', label: 'Центр', emoji: '🌌' },
    { value: 'star', label: 'Звезда', emoji: '⭐' },
    { value: 'planet', label: 'Планета', emoji: '🪐' },
    { value: 'satellite', label: 'Спутник', emoji: '🛰️' },
    { value: 'asteroid', label: 'Астероид', emoji: '☄️' },
    { value: 'blackhole', label: 'Чёрная дыра', emoji: '🕳️' },
  ];

  const handleAddNode = () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 8;
    addNode(
      [Math.cos(angle) * radius, (Math.random() - 0.5) * 6, Math.sin(angle) * radius],
      { label: 'Новая звезда', color: '#8b5cf6' }
    );
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-30 bg-black/80 backdrop-blur-xl border-b border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">🌌</span>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight">
                  ГАЛАКТИКА
                </h1>
                <p className="text-[9px] text-cyan-400/60 leading-tight">3D AI Planner</p>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="text-yellow-400">⭐</span> {stats.stars}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-cyan-400">🪐</span> {stats.planets}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-emerald-400">🛰️</span> {stats.satellites}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-purple-400">☄️</span> {stats.asteroids}
            </span>
            <span className="text-gray-600">|</span>
            <span>🔗 {stats.connections}</span>
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
                          <span>{node.status === 'star' ? '⭐' : node.status === 'planet' ? '🪐' : '🛰️'}</span>
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
              onClick={handleAddNode}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-lg text-xs font-medium hover:from-cyan-400 hover:to-purple-400 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Звезда
            </button>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed right-0 top-[52px] bottom-0 w-[360px] bg-gray-900/95 backdrop-blur-xl border-l border-cyan-500/30 shadow-[-10px_0_30px_rgba(6,182,212,0.1)] z-20 flex flex-col">
          <div className="flex border-b border-cyan-500/20">
            <button
              onClick={() => setSidebarTab('details')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-all ${
                sidebarTab === 'details'
                  ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/10 shadow-[inset_0_-2px_10px_rgba(6,182,212,0.3)]'
                  : 'text-gray-500 hover:text-cyan-400'
              }`}
            >
              📝 Детали
            </button>
            <button
              onClick={() => setSidebarTab('ai')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-all ${
                sidebarTab === 'ai'
                  ? 'text-purple-300 border-b-2 border-purple-400 bg-purple-500/10 shadow-[inset_0_-2px_10px_rgba(168,85,247,0.3)]'
                  : 'text-gray-500 hover:text-purple-400'
              }`}
            >
              🤖 ИИ
            </button>
            <button
              onClick={() => setSidebarTab('sources')}
              className={`flex-1 px-3 py-2.5 text-[10px] font-medium transition-all ${
                sidebarTab === 'sources'
                  ? 'text-pink-300 border-b-2 border-pink-400 bg-pink-500/10 shadow-[inset_0_-2px_10px_rgba(236,72,153,0.3)]'
                  : 'text-gray-500 hover:text-pink-400'
              }`}
            >
              📎 Источники
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selectedNode ? (
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
                  <label className="block text-[10px] font-medium text-cyan-400/80 mb-1 uppercase tracking-wider">Название</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                    className="w-full px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-sm text-white focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.3)] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-cyan-400/80 mb-1 uppercase tracking-wider">Тип объекта</label>
                  <div className="grid grid-cols-2 gap-2">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateNodeStatus(selectedNode.id, opt.value)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          selectedNode.status === opt.value
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                            : 'bg-black/30 text-gray-400 border border-white/10 hover:border-cyan-500/30 hover:text-cyan-400'
                        }`}
                      >
                        {opt.emoji} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wider">Цвет</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#fbbf24', '#06b6d4', '#ec4899', '#10b981', '#a855f7', '#f97316', '#ef4444', '#6366f1'].map((color) => (
                      <button
                        key={color}
                        onClick={() => updateNode(selectedNode.id, { color })}
                        className={`w-7 h-7 rounded-full transition-all ${
                          selectedNode.color === color ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white scale-110' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-cyan-400/80 mb-1 uppercase tracking-wider">Описание</label>
                  <textarea
                    value={selectedNode.description}
                    onChange={(e) => updateNode(selectedNode.id, { description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-sm text-white focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.3)] outline-none resize-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-cyan-400/80 mb-1 uppercase tracking-wider">Теги (через запятую)</label>
                  <input
                    type="text"
                    value={selectedNode.tags.join(', ')}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-sm text-white focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.3)] outline-none transition-all"
                    placeholder="3d, frontend, ai"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-cyan-400/80 mb-1 uppercase tracking-wider">Размер: {selectedNode.size.toFixed(1)}</label>
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

                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="w-full px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/40 rounded-lg text-xs font-medium hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all"
                >
                  🗑️ Удалить объект
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
          <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <div className="fixed bottom-4 left-4 z-20">
        <div className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-xl p-3 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
          <p className="text-[9px] text-cyan-400/80 mb-2 uppercase tracking-wider">Навигация</p>
          <div className="w-32 h-32 relative bg-black/60 rounded-lg overflow-hidden border border-cyan-500/10">
            {nodes.map((node) => {
              const x = ((node.position[0] + 30) / 60) * 100;
              const z = ((node.position[2] + 30) / 60) * 100;
              return (
                <button
                  key={node.id}
                  onClick={() => selectNode(node.id)}
                  className={`absolute w-2 h-2 rounded-full transition-all ${
                    selectedNodeId === node.id ? 'scale-150 ring-1 ring-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'hover:scale-125'
                  }`}
                  style={{
                    left: `${Math.max(0, Math.min(100, x))}%`,
                    top: `${Math.max(0, Math.min(100, z))}%`,
                    backgroundColor: node.color,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 6px ${node.color}`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-black/70 backdrop-blur-md border border-cyan-500/30 rounded-full px-4 py-1.5 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
          <p className="text-[10px] text-cyan-300/80">
            🖱️ ЛКМ — вращение • ⚙️ СКМ — перемещение • ⚡ Колёсико — зум • 🔗 Кнопка «Связь» — соединение задач
          </p>
        </div>
      </div>
    </>
  );
}

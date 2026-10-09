import { useStore } from '../store';
import { TaskNode, Source } from '../types';
import { useState } from 'react';

interface SourcesPanelProps {
  selectedNode: TaskNode;
  updateNode: (id: string, data: Partial<TaskNode>) => void;
}

const SOURCE_TYPE_OPTIONS: { value: Source['type']; label: string; desc: string }[] = [
  { value: 'text', label: '📝 Текст', desc: 'отправляется ИИ' },
  { value: 'link', label: '🔗 Ссылка', desc: 'только метаданные' },
  { value: 'file', label: '📄 Файл', desc: 'пока не поддерживается' },
];

export default function SourcesPanel({ selectedNode, updateNode }: SourcesPanelProps) {
  const getAccessibleSources = useStore((s) => s.getAccessibleSources);
  const [newSourceType, setNewSourceType] = useState<Source['type']>('text');
  
  const accessibleSources = getAccessibleSources(selectedNode.id);
  
  const ownSources = accessibleSources.filter(s => s.nodeId === selectedNode.id);
  const connectedSources = accessibleSources.filter(s => s.nodeId !== selectedNode.id && s.weight >= 0.8);
  const parentSources = accessibleSources.filter(s => s.nodeId !== selectedNode.id && s.weight < 0.8);

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="text-xs font-medium text-cyan-300">
            📎 Собственные источники ({ownSources.length})
          </h3>
          <div className="flex items-center gap-1.5">
            <select
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value as Source['type'])}
              className="px-2 py-1 bg-black/40 border border-cyan-500/30 rounded text-[10px] text-white outline-none"
            >
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const newSource: Source = {
                  id: crypto.randomUUID(),
                  type: newSourceType,
                  title: newSourceType === 'link'
                    ? `Ссылка ${selectedNode.sources.length + 1}`
                    : newSourceType === 'file'
                    ? `Файл ${selectedNode.sources.length + 1}`
                    : `Заметка ${selectedNode.sources.length + 1}`,
                  content: '',
                  addedAt: new Date().toISOString(),
                };
                updateNode(selectedNode.id, {
                  sources: [...selectedNode.sources, newSource],
                });
              }}
              className="px-2 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded text-[10px] font-medium hover:bg-cyan-500/30 transition-colors"
            >
              + Добавить
            </button>
          </div>
        </div>

        {ownSources.length === 0 ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">📎</div>
            <p className="text-[10px] text-gray-500">
              Прикрепите источники для анализа ИИ
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedNode.sources.map((source, idx) => (
              <div key={source.id} className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={source.title}
                    onChange={(e) => {
                      const updated = [...selectedNode.sources];
                      updated[idx] = { ...updated[idx], title: e.target.value };
                      updateNode(selectedNode.id, { sources: updated });
                    }}
                    className="text-xs font-medium bg-transparent border-none outline-none flex-1 text-white"
                  />
                  <button
                    onClick={() => {
                      const updated = selectedNode.sources.filter((_, i) => i !== idx);
                      updateNode(selectedNode.id, { sources: updated });
                    }}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={source.content}
                  onChange={(e) => {
                    const updated = [...selectedNode.sources];
                    updated[idx] = { ...updated[idx], content: e.target.value };
                    updateNode(selectedNode.id, { sources: updated });
                  }}
                  rows={3}
                  placeholder="Текст источника..."
                  className="w-full px-2 py-1.5 bg-black/30 border border-white/10 rounded text-xs text-white focus:ring-1 focus:ring-cyan-500 outline-none resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-500">
                    {new Date(source.addedAt).toLocaleDateString('ru-RU')}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    source.type === 'text'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : source.type === 'link'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {SOURCE_TYPE_OPTIONS.find((o) => o.value === source.type)?.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {connectedSources.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-pink-300 mb-2">
            🔗 От связанных задач ({connectedSources.length})
          </h3>
          <div className="space-y-2">
            {connectedSources.map((item, idx) => (
              <div key={`${item.nodeId}-${idx}`} className="bg-pink-500/10 border border-pink-500/30 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-pink-200 font-medium">
                    {item.source.title}
                  </span>
                  <span className="text-[9px] text-pink-400">
                    вес: {item.weight.toFixed(2)}
                  </span>
                </div>
                <p className="text-[9px] text-gray-400 mb-1">
                  из задачи: {item.taskLabel}
                </p>
                {item.source.content && (
                  <p className="text-[10px] text-gray-300 line-clamp-2">
                    {item.source.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {parentSources.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-purple-300 mb-2">
            📚 От родительских задач ({parentSources.length})
          </h3>
          <div className="space-y-2">
            {parentSources.map((item, idx) => (
              <div key={`${item.nodeId}-${idx}`} className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-purple-200 font-medium">
                    {item.source.title}
                  </span>
                  <span className="text-[9px] text-purple-400">
                    вес: {item.weight.toFixed(2)}
                  </span>
                </div>
                <p className="text-[9px] text-gray-400 mb-1">
                  из задачи: {item.taskLabel}
                </p>
                {item.source.content && (
                  <p className="text-[10px] text-gray-300 line-clamp-2">
                    {item.source.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-black/30 border border-white/10 rounded-lg p-3">
        <p className="text-[9px] text-gray-400 leading-relaxed">
          💡 <span className="text-cyan-400">RAG поиск</span> учитывает расстояние от центра и связи между задачами. 
          Источники от связанных задач имеют высокий вес, от родительских — средний.
        </p>
        <p className="text-[9px] text-gray-500 leading-relaxed mt-1.5">
          Поддерживаемые типы источников (отправляются в промпт ИИ):
        </p>
        <ul className="text-[9px] text-gray-500 leading-relaxed mt-1 space-y-0.5">
          {SOURCE_TYPE_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <span className="text-gray-300">{opt.label}</span> — {opt.desc}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

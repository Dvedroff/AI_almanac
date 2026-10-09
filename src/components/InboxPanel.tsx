import { useStore } from '../store';

/**
 * Панель «Входящие» — список ИИ-предложений (связи, родители),
 * ожидающих решения пользователя.
 */
export default function InboxPanel() {
  const suggestions = useStore((s) => s.suggestions);
  const nodes = useStore((s) => s.nodes);
  const acceptSuggestion = useStore((s) => s.acceptSuggestion);
  const acceptParentSuggestion = useStore((s) => s.acceptParentSuggestion);
  const rejectSuggestion = useStore((s) => s.rejectSuggestion);

  const getNodeLabel = (id?: string) => {
    if (!id) return '—';
    return nodes.find((n) => n.id === id)?.label || id;
  };

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-5xl mb-4">📭</div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Нет предложений</h3>
        <p className="text-xs text-gray-500">
          Добавьте мысль — ИИ автоматически предложит классификацию и связи с существующими объектами.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] text-amber-400/80 uppercase tracking-wider">
        Предложения ИИ ({suggestions.length})
      </p>
      {suggestions.map((s) => (
        <div
          key={s.id}
          className="bg-black/40 border border-amber-500/20 rounded-lg p-3 space-y-2"
        >
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

          <div className="flex gap-2">
            <button
              onClick={() =>
                s.connectionType === 'hierarchy'
                  ? acceptParentSuggestion(s.id)
                  : acceptSuggestion(s.id)
              }
              className="flex-1 px-2 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-lg text-[10px] font-medium hover:bg-emerald-500/30 transition-all"
            >
              ✓ Принять
            </button>
            <button
              onClick={() => rejectSuggestion(s.id)}
              className="flex-1 px-2 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-medium hover:bg-red-500/20 transition-all"
            >
              ✗ Отклонить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
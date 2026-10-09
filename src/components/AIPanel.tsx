import { useState } from 'react';
import { useStore } from '../store';

/**
 * Нормализует endpoint для браузера:
 * - если это Ollama на 192.168.x / 10.x / 172.16-31.x (не localhost/127.0.0.1),
 *   запрос идёт через Vite-прокси `/ollama-proxy` (обходит CORS и Private Network Access);
 * - иначе возвращает endpoint как есть.
 */
function resolveEndpoint(endpoint: string): string {
  if (endpoint && !/localhost|127\.0\.0\.1/i.test(endpoint)) {
    try {
      const { hostname } = new URL(endpoint);
      if (
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return '/ollama-proxy';
      }
    } catch {
      return endpoint;
    }
  }
  return endpoint;
}

/** Значения по умолчанию из переменных окружения (Vite injects import.meta.env) */
const DEFAULT_OLLAMA_ENDPOINT = import.meta.env.VITE_OLLAMA_ENDPOINT || 'http://localhost:11434';
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL || 'llama2';

export default function AIPanel() {
  const {
    nodes,
    selectedNodeId,
    chatMessages,
    agentActive,
    aiConfig,
    addChatMessage,
    addNode,
    clearChat,
    setAgentActive,
    setAIConfig,
  } = useStore();

  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const endpoint = resolveEndpoint(aiConfig.endpoint || DEFAULT_OLLAMA_ENDPOINT);
      const response = await fetch(`${endpoint}/api/tags`);
      if (response.ok) {
        setConnectionStatus('success');
        setTimeout(() => setConnectionStatus('idle'), 2000);
      } else {
        setConnectionStatus('error');
        setTimeout(() => setConnectionStatus('idle'), 2000);
      }
    } catch (error) {
      setConnectionStatus('error');
      setTimeout(() => setConnectionStatus('idle'), 2000);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    addChatMessage({
      role: 'user',
      content: chatInput,
      nodeId: selectedNodeId || undefined,
    });

    setIsTyping(true);
    const userInput = chatInput;
    setChatInput('');

    // Demo mode fallback
    if (aiConfig.provider === 'demo') {
      setTimeout(() => {
        const response = generateDemoResponse(userInput, selectedNode);
        addChatMessage({
          role: 'assistant',
          content: response,
          nodeId: selectedNodeId || undefined,
        });
        setIsTyping(false);
      }, 1000);
      return;
    }

    // Real API call
    try {
      const endpoint = resolveEndpoint(aiConfig.endpoint || DEFAULT_OLLAMA_ENDPOINT);
      const model = aiConfig.model || DEFAULT_MODEL;
      
      // Build context from accessible sources
      const accessibleSources = selectedNodeId 
        ? useStore.getState().getAccessibleSources(selectedNodeId)
        : [];
      
      let systemPrompt = aiConfig.systemPrompt || 'Ты — ИИ-ассистент для планирования задач.';
      
      if (selectedNode) {
        systemPrompt += `\n\nКонтекст текущей задачи: "${selectedNode.label}" (${selectedNode.status})`;
        if (selectedNode.description) {
          systemPrompt += `\nОписание: ${selectedNode.description}`;
        }
        if (selectedNode.tags.length > 0) {
          systemPrompt += `\nТеги: ${selectedNode.tags.join(', ')}`;
        }
        
        if (accessibleSources.length > 0) {
          systemPrompt += `\n\n📚 Доступные источники:`;
          accessibleSources.slice(0, 5).forEach((item, idx) => {
            systemPrompt += `\n${idx + 1}. "${item.source.title}" из "${item.taskLabel}" (вес: ${item.weight.toFixed(2)})`;
            if (item.source.content) {
              systemPrompt += `\n   ${item.source.content.substring(0, 300)}`;
            }
          });
        }
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ];

      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.message?.content || 'Нет ответа от модели';

      addChatMessage({
        role: 'assistant',
        content: assistantMessage,
        nodeId: selectedNodeId || undefined,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      addChatMessage({
        role: 'assistant',
        content: `❌ Ошибка подключения к ИИ: ${errorMessage}\n\nПроверьте:\n• Запущен ли Ollama\n• Правильность endpoint (${aiConfig.endpoint || DEFAULT_OLLAMA_ENDPOINT})\n• Наличие модели ${aiConfig.model || DEFAULT_MODEL}`,
        nodeId: selectedNodeId || undefined,
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateTask = () => {
    if (!chatInput.trim()) return;
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 10;
    addNode(
      [Math.cos(angle) * radius, (Math.random() - 0.5) * 8, Math.sin(angle) * radius],
      {
        label: chatInput.length > 40 ? chatInput.slice(0, 40) + '...' : chatInput,
        description: `Сгенерировано из запроса: "${chatInput}"`,
        status: 'asteroid',
        tags: ['ai-generated'],
        color: '#8b5cf6',
        size: 1,
      }
    );
    addChatMessage({
      role: 'agent',
      content: `✨ Новая звезда создана: "${chatInput}"`,
    });
    setChatInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${agentActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-gray-500'}`} />
            <span className="text-xs text-purple-200">
              {aiConfig.provider === 'demo' ? 'Demo' : aiConfig.provider.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs px-2 py-1 rounded bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all"
            >
              ⚙️
            </button>
            <button
              onClick={() => setAgentActive(!agentActive)}
              className={`text-xs px-2 py-1 rounded transition-all ${
                agentActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
              }`}
            >
              {agentActive ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="px-3 py-2 border-b border-white/10 bg-black/40 space-y-2">
          <p className="text-[10px] text-cyan-400 font-medium uppercase tracking-wider">Настройки ИИ</p>
          
          <div>
            <label className="block text-[9px] text-gray-400 mb-1">Провайдер</label>
            <select
              value={aiConfig.provider}
              onChange={(e) => setAIConfig({ provider: e.target.value as any })}
              className="w-full px-2 py-1 bg-black/50 border border-cyan-500/30 rounded text-xs text-white outline-none"
            >
              <option value="demo">Demo (без API)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (локально)</option>
              <option value="custom">Custom endpoint</option>
            </select>
          </div>

          {(aiConfig.provider === 'ollama' || aiConfig.provider === 'custom') && (
            <button
              onClick={testConnection}
              disabled={connectionStatus === 'testing'}
              className={`w-full px-2 py-1.5 rounded text-xs font-medium transition-all ${
                connectionStatus === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                  : connectionStatus === 'error'
                  ? 'bg-red-500/20 text-red-300 border border-red-400/50'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 hover:bg-cyan-500/30'
              } disabled:opacity-50`}
            >
              {connectionStatus === 'testing' && '🔄 Проверка...'}
              {connectionStatus === 'success' && '✅ Подключено'}
              {connectionStatus === 'error' && '❌ Ошибка подключения'}
              {connectionStatus === 'idle' && '🔌 Тест соединения'}
            </button>
          )}

          {aiConfig.provider !== 'demo' && (
            <>
              {aiConfig.provider !== 'ollama' && (
                <div>
                  <label className="block text-[9px] text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={aiConfig.apiKey}
                    onChange={(e) => setAIConfig({ apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-2 py-1 bg-black/50 border border-cyan-500/30 rounded text-xs text-white outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[9px] text-gray-400 mb-1">
                  {aiConfig.provider === 'ollama' ? 'Endpoint' : 'Endpoint (опционально)'}
                </label>
                <input
                  type="text"
                  value={aiConfig.endpoint}
                  onChange={(e) => setAIConfig({ endpoint: e.target.value })}
                  placeholder={aiConfig.provider === 'ollama' ? DEFAULT_OLLAMA_ENDPOINT : ''}
                  className="w-full px-2 py-1 bg-black/50 border border-cyan-500/30 rounded text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] text-gray-400 mb-1">Модель</label>
                <input
                  type="text"
                  value={aiConfig.model}
                  onChange={(e) => setAIConfig({ model: e.target.value })}
                  placeholder={aiConfig.provider === 'openai' ? 'gpt-3.5-turbo' : aiConfig.provider === 'ollama' ? 'llama2' : ''}
                  className="w-full px-2 py-1 bg-black/50 border border-cyan-500/30 rounded text-xs text-white outline-none"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {chatMessages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🌌</div>
            <p className="text-xs text-gray-400 mb-4">
              Спросите ИИ о вашей галактике задач
            </p>
            <div className="space-y-1.5">
              {[
                'Предложи план декомпозиции',
                'Выяви риски',
                'Найди скрытые связи',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setChatInput(suggestion)}
                  className="block w-full text-left px-3 py-2 bg-black/30 border border-purple-500/20 rounded-lg text-xs text-gray-300 hover:bg-purple-500/10 hover:border-purple-400/40 transition-all"
                >
                  💬 {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-br-sm'
                  : 'bg-white/10 border border-white/10 text-gray-200 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white/10 px-4 py-2 rounded-xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-purple-500/20 bg-black/40">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Спросите ИИ..."
            className="flex-1 px-3 py-2 bg-black/50 border border-purple-500/30 rounded-lg text-xs text-white placeholder-gray-500 focus:border-purple-400 outline-none transition-all"
          />
          <button
            onClick={handleSendMessage}
            disabled={!chatInput.trim()}
            className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-lg text-xs font-medium hover:from-cyan-400 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            ↑
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleGenerateTask}
            disabled={!chatInput.trim()}
            className="flex-1 px-2 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-lg text-[10px] font-medium hover:bg-emerald-500/30 disabled:opacity-50 transition-all"
          >
            ✨ Создать звезду
          </button>
          <button
            onClick={clearChat}
            className="px-2 py-1.5 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-medium hover:bg-white/10 transition-all"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function generateDemoResponse(userMessage: string, contextNode: any): string {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('план') || lowerMessage.includes('декомпози')) {
    const nodeName = contextNode?.label || 'этой задачи';
    return `🌌 **План для "${nodeName}":**\n\n1. 🎯 Определение целей\n2. 🛰️ Развертывание подзадач\n3. 🔗 Установка связей\n4. ⚡ Активация ресурсов\n5. 📡 Мониторинг прогресса\n\n💡 *Для реального ИИ подключите API в настройках*`;
  }

  if (lowerMessage.includes('риск') || lowerMessage.includes('проблем')) {
    return `⚠️ **Анализ рисков:**\n\n• Недостаточное покрытие тестами\n• Зависимость от внешних API\n• Высокая сложность архитектуры\n\n💡 *Подключите API для более точного анализа*`;
  }

  if (contextNode?.status === 'blackhole') {
    return `🕳️ **Анализ "чёрной дыры":**\n\nЭта задача классифицирована как сложная. Рекомендации:\n\n1. Разбейте на минимальные шаги\n2. Ищите внешнюю помощь\n3. Упростите требования\n4. Рассмотрите альтернативы`;
  }

  return `🤖 **Demo режим**\n\nДля полноценной работы ИИ подключите API:\n• OpenAI (GPT-4, GPT-3.5)\n• Ollama (локальные модели)\n• Custom endpoint\n\nНастройки в боковой панели → ИИ-Агент`;
}

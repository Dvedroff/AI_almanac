import { AIConfig } from '../types';

/**
 * Унифицированный сервис вызова языковых моделей.
 * Абстрагирует различия между провайдерами: Ollama, OpenAI-совместимые, demo.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: AIConfig['provider'];
  /** true, если ответ сгенерирован эвристикой/демо, а не реальной моделью */
  isDemo: boolean;
}

/**
 * Нормализует endpoint:
 * - если endpoint пуст — бросает ошибку (настройка обязана быть задана через UI);
 * - для приватных LAN-адресов (192.168.*, 10.*, 172.16-31.*) используется напрямую
 *   (CORS должен быть настроен на сервере Ollama флагом OLLAMA_ORIGINS=*).
 */
export function resolveEndpoint(endpoint: string): string {
  const trimmed = (endpoint || '').trim();
  if (!trimmed) {
    throw new LLMValidationError('Endpoint не задан. Укажите его в настройках ИИ.');
  }
  return trimmed;
}

export class LLMUnavailableError extends Error {}
export class LLMValidationError extends Error {}
export class LLMTimeoutError extends Error {}

const TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new LLMTimeoutError('Превышено время ожидания ответа модели');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Единая точка вызова LLM. Возвращает текстовый ответ.
 * @throws LLMUnavailableError при сетевых/HTTP ошибках
 */
export async function callLLM(
  config: AIConfig,
  messages: LLMMessage[],
  options?: { json?: boolean }
): Promise<LLMResponse> {
  if (config.provider === 'demo') {
    throw new LLMUnavailableError('Demo-провайдер не выполняет реальные запросы');
  }

  if (config.provider === 'openai' || config.provider === 'custom') {
    return callOpenAICompatible(config, messages);
  }

  if (config.provider === 'ollama') {
    return callOllama(config, messages, options?.json);
  }

  throw new LLMUnavailableError(`Провайдер "${config.provider}" не поддерживается`);
}

async function callOllama(
  config: AIConfig,
  messages: LLMMessage[],
  json?: boolean
): Promise<LLMResponse> {
  const endpoint = resolveEndpoint(config.endpoint);
  const model = (config.model || '').trim();
  if (!model) {
    throw new LLMValidationError('Модель не задана. Укажите её в настройках ИИ.');
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (json) body.format = 'json';

  let response: Response;
  try {
    response = await fetchWithTimeout(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new LLMUnavailableError(
      `Не удалось подключиться к Ollama (${endpoint}): ${e instanceof Error ? e.message : 'сетевая ошибка'}`
    );
  }

  if (!response.ok) {
    throw new LLMUnavailableError(`Ollama вернул ошибку HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (typeof content !== 'string' || !content) {
    throw new LLMValidationError('Ollama вернул пустой или некорректный ответ');
  }
  return { content, provider: 'ollama', isDemo: false };
}

async function callOpenAICompatible(
  config: AIConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const endpoint = (config.endpoint || '').replace(/\/$/, '');
  if (!endpoint) {
    throw new LLMUnavailableError('Не указан endpoint для OpenAI-совместимого провайдера');
  }
  const model = (config.model || '').trim();
  if (!model) {
    throw new LLMValidationError('Модель не задана. Укажите её в настройках ИИ.');
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
  } catch (e) {
    throw new LLMUnavailableError(
      `Не удалось подключиться к провайдеру: ${e instanceof Error ? e.message : 'сетевая ошибка'}`
    );
  }

  if (!response.ok) {
    throw new LLMUnavailableError(`Провайдер вернул ошибку HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content) {
    throw new LLMValidationError('Провайдер вернул пустой или некорректный ответ');
  }
  return { content, provider: config.provider, isDemo: false };
}
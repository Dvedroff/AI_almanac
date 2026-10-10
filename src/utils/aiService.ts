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

/**
 * Защита от prompt-injection: нейтрализует попытки пользовательского текста
 * «вырваться» из роли данных и дать инструкции модели. Используется перед
 * подстановкой пользовательского контента в промпт.
 */
export function sanitizeAgainstInjection(text: string): string {
  if (!text) return text;
  return text
    // Убираем явные «инструкциональные» маркеры
    .replace(/(^|\n)\s*(ignore|forget|disregard|override|system\s*:|assistant\s*:|your\s+instructions)/gi, '$1')
    // Убираем попытки задать новый системный блок
    .replace(/<\|(system|user|assistant)\|>/gi, '')
    .replace(/\[(system|user|assistant)\]/gi, '')
    // Ограничиваем длину контента, попадающего в промпт
    .slice(0, 8000);
}

const TIMEOUT_MS = 60000;

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
    // Различаем таймаут и сетевую ошибку подключения.
    if (e instanceof LLMTimeoutError) throw e;
    const detail = e instanceof Error ? e.message : 'сетевая ошибка';
    throw new LLMUnavailableError(
      `Не удалось подключиться к Ollama (${endpoint}). Проверьте, что сервер запущен и OLLAMA_ORIGINS разрешает этот источник. Детали: ${detail}`
    );
  }

  if (!response.ok) {
    let bodyText = '';
    try { bodyText = (await response.text()).slice(0, 300); } catch { /* ignore */ }
    throw new LLMUnavailableError(
      `Ollama вернул ошибку HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}${bodyText ? `: ${bodyText}` : ''}`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (e) {
    throw new LLMValidationError(
      `Ollama вернул ответ, который не удалось разобрать как JSON: ${e instanceof Error ? e.message : 'ошибка парсинга'}`
    );
  }
  const content = (data as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== 'string' || !content) {
    throw new LLMValidationError('Ollama вернул пустой или некорректный ответ (нет message.content)');
  }
  return { content, provider: 'ollama', isDemo: false };
}

/**
 * Диагностика подключения к Ollama.
 * Возвращает структурированный результат без выбрасывания исключений —
 * удобно для отображения в настройках и для логирования.
 */
export async function checkOllamaHealth(endpoint: string): Promise<{
  ok: boolean;
  endpoint: string;
  models?: string[];
  error?: string;
  errorType?: 'config' | 'connection' | 'timeout' | 'http' | 'json';
}> {
  let resolved: string;
  try {
    resolved = resolveEndpoint(endpoint);
  } catch (e) {
    return { ok: false, endpoint, error: e instanceof Error ? e.message : 'Endpoint не задан', errorType: 'config' };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${resolved}/api/tags`, { method: 'GET' });
  } catch (e) {
    if (e instanceof LLMTimeoutError) {
      return { ok: false, endpoint: resolved, error: 'Превышено время ожидания ответа Ollama', errorType: 'timeout' };
    }
    return {
      ok: false,
      endpoint: resolved,
      error: `Не удалось подключиться: ${e instanceof Error ? e.message : 'сетевая ошибка'}. Проверьте OLLAMA_ORIGINS.`,
      errorType: 'connection',
    };
  }

  if (!response.ok) {
    return { ok: false, endpoint: resolved, error: `HTTP ${response.status} ${response.statusText || ''}`.trim(), errorType: 'http' };
  }

  try {
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = Array.isArray(data?.models)
      ? data.models.map((m) => m?.name).filter((n): n is string => typeof n === 'string')
      : [];
    return { ok: true, endpoint: resolved, models };
  } catch (e) {
    return { ok: false, endpoint: resolved, error: `Некорректный JSON: ${e instanceof Error ? e.message : 'ошибка'}`, errorType: 'json' };
  }
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
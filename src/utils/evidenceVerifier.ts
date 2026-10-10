import { EvidenceQuote, ClaimStatus, Claim, TaskNode } from '../types';

/**
 * Клиентская проверка доказательств ИИ.
 * Галлюцинированные цитаты (не встречающиеся в исходном тексте/описании)
 * помечаются как `unsupported` либо `contradicted`, чтобы интерфейс
 * не показывал их как достоверные.
 */

/** Нормализует строку для нестрогого сравнения (регистр, пробелы, пунктуация). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();
}

/** Собирает все «поля истины», в которых может встретиться цитата. */
function groundTruthPool(node: TaskNode): { text: string; key: EvidenceQuote['source'] }[] {
  const pool: { text: string; key: EvidenceQuote['source'] }[] = [];
  if (node.originalText) pool.push({ text: node.originalText, key: 'original_text' });
  if (node.description) pool.push({ text: node.description, key: 'description' });
  for (const s of node.sources) {
    if (s.type === 'text' && s.content) pool.push({ text: s.content, key: 'source_document' });
  }
  return pool;
}

/** Проверяет одну цитату: presence = встречается ли цитата в доступном тексте. */
export function verifyQuote(quote: EvidenceQuote, node: TaskNode): EvidenceQuote {
  const pool = groundTruthPool(node);
  const normalizedQuote = normalize(quote.text);
  if (!normalizedQuote) {
    return { ...quote, status: 'unsupported' };
  }
  const match = pool.find((p) => {
    const hay = normalize(p.text);
    // Точное вхождение либо достаточно длинное частичное (>= 60% токенов)
    if (hay.includes(normalizedQuote)) return true;
    const qTokens = normalizedQuote.split(' ').filter(Boolean);
    const matched = qTokens.filter((t) => hay.includes(t));
    return matched.length / qTokens.length >= 0.6;
  });
  return { ...quote, source: match?.key ?? quote.source, status: match ? 'verified' : 'unsupported' };
}

/** Проверяет список цитат и возвращает новые со статусами. */
export function verifyQuotes(quotes: EvidenceQuote[] | undefined, node: TaskNode): EvidenceQuote[] {
  if (!quotes) return [];
  return quotes.map((q) => verifyQuote(q, node));
}

/** Агрегирует статус набора цитат в единый ClaimStatus. */
export function aggregateStatus(quotes: EvidenceQuote[]): ClaimStatus {
  if (quotes.length === 0) return 'unchecked';
  const allVerified = quotes.every((q) => q.status === 'verified');
  const anyVerified = quotes.some((q) => q.status === 'verified');
  const anyContradicted = quotes.some((q) => q.status === 'contradicted');
  if (anyContradicted) return 'contradicted';
  if (allVerified) return 'verified';
  if (anyVerified) return 'verified';
  return 'unsupported';
}

/**
 * Проверяет и пересчитывает набор утверждений (`claims`) ИИ.
 * Возвращает копию claims, где `evidence` размечена, а `supported`
 * пересчитан на основе реального наличия цитат.
 */
export function verifyClaims(claims: Claim[] | undefined, node: TaskNode): Claim[] {
  if (!claims) return [];
  return claims.map((c) => {
    const evidence = verifyQuotes(c.evidence, node);
    const supported = evidence.some((q) => q.status === 'verified');
    return { ...c, evidence, supported };
  });
}
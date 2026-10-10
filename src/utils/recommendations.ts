import { TaskNode, Connection, SemanticRelationType } from '../types';

/**
 * Рекомендации и «группы мыслей» (рой).
 * Эвристики, работающие локально без повторного вызова LLM.
 */

export interface Recommendation {
  id: string;
  type: 'swarm' | 'goal_path' | 'missing_resource';
  title: string;
  detail: string;
  nodeIds: string[];
  actionable: boolean;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/)
      .filter((t) => t.length > 3)
  );
}

function overlap(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  let count = 0;
  for (const t of sa) if (sb.has(t)) count += 1;
  return count;
}

/** Находит «рой» — группы из >=3 узлов с общими значимыми словами. */
export function findSwarms(nodes: TaskNode[], minSize = 3): Recommendation[] {
  const candidates = nodes.filter((n) => n.status !== 'galaxy_center');
  const recommendations: Recommendation[] = [];
  const used = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (used.has(a.id)) continue;
    const cluster = [a];
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (used.has(b.id)) continue;
      const score = overlap(`${a.label} ${a.description}`, `${b.label} ${b.description}`);
      if (score >= 2) cluster.push(b);
    }
    if (cluster.length >= minSize) {
      cluster.forEach((n) => used.add(n.id));
      recommendations.push({
        id: `swarm-${a.id}`,
        type: 'swarm',
        title: 'Рой мыслей на одну тему',
        detail: `Найдено ${cluster.length} близких записей, возможно, стоит объединить их в кластер: ${cluster.map((n) => n.label).slice(0, 5).join(', ')}`,
        nodeIds: cluster.map((n) => n.id),
        actionable: true,
      });
    }
  }
  return recommendations;
}

/** Ищет поток: путь от заданного узла к ближайшей цели по связям. */
export function findGoalPath(
  nodeId: string,
  nodes: TaskNode[],
  connections: Connection[]
): Recommendation | null {
  const goals = nodes.filter((n) => n.kind === 'goal' && n.status !== 'galaxy_center');
  if (goals.length === 0) return null;

  const adjacency = new Map<string, string[]>();
  connections
    .filter((c) => c.type === 'semantic' || c.type === 'hierarchy')
    .forEach((c) => {
      const l = adjacency.get(c.source) || [];
      l.push(c.target);
      adjacency.set(c.source, l);
      const r = adjacency.get(c.target) || [];
      r.push(c.source);
      adjacency.set(c.target, r);
    });

  const queue: string[] = [nodeId];
  const prev = new Map<string, string | undefined>();
  const visited = new Set<string>([nodeId]);
  prev.set(nodeId, undefined);
  let goalReached: string | null = null;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (goals.some((g) => g.id === cur)) {
      goalReached = cur;
      break;
    }
    for (const next of adjacency.get(cur) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }

  if (!goalReached) return null;
  const path: string[] = [];
  let step: string | undefined = goalReached;
  while (step) {
    path.unshift(step);
    step = prev.get(step);
  }
  const labels = path.map((id) => nodes.find((n) => n.id === id)?.label || id);
  return {
    id: `goal-path-${nodeId}`,
    type: 'goal_path',
    title: 'Поток к цели',
    detail: `Путь к цели: ${labels.join(' → ')}`,
    nodeIds: path,
    actionable: false,
  };
}

/** Ищет задачи, которым не хватает подтверждённой связи с ресурсом. */
export function findMissingResources(nodes: TaskNode[], connections: Connection[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const node of nodes) {
    if (node.kind !== 'task' && node.kind !== 'project') continue;
    const text = `${node.label} ${node.description}`.toLowerCase();
    const mentioned = nodes.filter(
      (r) =>
        r.kind === 'resource' &&
        r.status !== 'galaxy_center' &&
        text.includes(r.label.toLowerCase()) &&
        r.label.length > 2
    );
    for (const res of mentioned) {
      const hasLink = connections.some(
        (c) =>
          c.type === 'semantic' &&
          c.relationKind === 'uses_resource' &&
          ((c.source === node.id && c.target === res.id) || (c.source === res.id && c.target === node.id))
      );
      if (!hasLink) {
        recommendations.push({
          id: `missing-res-${node.id}-${res.id}`,
          type: 'missing_resource',
          title: 'Возможный недостающий ресурс',
          detail: `«${node.label}» упоминает ресурс «${res.label}», но связь «использует ресурс» не подтверждена.`,
          nodeIds: [node.id, res.id],
          actionable: true,
        });
      }
    }
  }
  return recommendations;
}

/** Собирает все локальные рекомендации. */
export function collectRecommendations(
  nodes: TaskNode[],
  connections: Connection[],
  focusNodeId?: string | null
): Recommendation[] {
  const recs: Recommendation[] = [];
  recs.push(...findSwarms(nodes));
  recs.push(...findMissingResources(nodes, connections));
  if (focusNodeId) {
    const path = findGoalPath(focusNodeId, nodes, connections);
    if (path) recs.push(path);
  }
  return recs;
}

export const RELATION_KIND_LABELS: Record<SemanticRelationType, string> = {
  related_to: 'Связано',
  supports: 'Поддерживает',
  depends_on: 'Зависит от',
  conflicts_with: 'Конфликтует',
  duplicate_of: 'Дубль',
  derived_from: 'Происходит из',
  part_of: 'Часть',
  uses_resource: 'Использует ресурс',
  contributes_to_goal: 'Вносит вклад в цель',
};
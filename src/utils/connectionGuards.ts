import { Connection } from '../types';

/**
 * Общие проверки целостности связей. Вынесены в отдельный модуль,
 * чтобы использоваться и в store, и в aiAgent без циклических импортов.
 */

export function connectionDuplicate(
  connections: Connection[],
  a: string,
  b: string,
  type?: Connection['type']
): boolean {
  return connections.some((conn) =>
    ((conn.source === a && conn.target === b) || (conn.source === b && conn.target === a)) &&
    (type ? conn.type === type : true)
  );
}

/**
 * Определяет, создаст ли добавление иерархической связи `newParent -> newChild`
 * цикл в иерархии. Проверяет, достижим ли `newChild` из `newParent`, двигаясь
 * вверх по родителям.
 */
export function hasHierarchyCycle(
  connections: Connection[],
  newParent: string,
  newChild: string
): boolean {
  const parentByChild = new Map<string, string[]>();
  connections.filter((c) => c.type === 'hierarchy').forEach((c) => {
    const list = parentByChild.get(c.target) || [];
    list.push(c.source);
    parentByChild.set(c.target, list);
  });
  const stack = [newParent];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === newChild) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const parents = parentByChild.get(cur) || [];
    stack.push(...parents);
  }
  return false;
}
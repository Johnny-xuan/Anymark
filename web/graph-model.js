// Pure model/layout helpers. Only the supplied reader accesses bookmark data.
export async function loadGraphTree(readTree, cancelled = () => false) {
  const first = await readTree({ path: '/', depth: 12 });
  if (cancelled()) return null;
  if (!first?.entry || !Array.isArray(first.children)) throw new Error('书签树数据不完整，请刷新后重试。');
  const rootId = String(first.entry.id);
  const nodes = new Map();
  const order = [];
  const pending = [];
  const attach = (entries, parentId, depth) => {
    const stack = entries.map(entry => ({ entry, parentId, depth })).reverse();
    while (stack.length) {
      const current = stack.pop();
      const entry = current.entry;
      if (!entry || entry.id == null) throw new Error('书签树中存在无 ID 的项目。');
      const id = String(entry.id);
      if (id === rootId || nodes.has(id)) continue;
      const folder = entry.type === 'directory';
      const node = { ...entry, id, parentId: current.parentId, depth: current.depth, folder, children: [], x: 0, y: 0, radius: 1, weight: 1 };
      nodes.set(id, node);
      order.push(node);
      nodes.get(current.parentId)?.children.push(id);
      if (!folder) continue;
      if (!Array.isArray(entry.children)) pending.push(node);
      else for (let i = entry.children.length - 1; i >= 0; i--) stack.push({ entry: entry.children[i], parentId: id, depth: current.depth + 1 });
    }
  };
  attach(first.children, rootId, 1);
  // A depth boundary omits `children`, while a genuinely empty folder has [].
  // Fetch every omitted branch, including boundaries discovered by later reads.
  for (let i = 0; i < pending.length; i++) {
    if (cancelled()) return null;
    const node = pending[i];
    const branch = await readTree({ path: node.path || node.id, depth: 12 });
    if (cancelled()) return null;
    if (String(branch?.entry?.id) !== node.id || !Array.isArray(branch.children)) throw new Error('读取期间书签层级发生变化，请刷新关系图。');
    attach(branch.children, node.id, node.depth + 1);
  }
  // Network reads can append deeper branches after later siblings. Restore a
  // single depth-first order without changing any folder's actual child order.
  const roots = order.filter(node => node.parentId === rootId);
  const ordered = [];
  const stack = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop();
    ordered.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(nodes.get(node.children[i]));
  }
  return { root: first.entry, nodes, order: ordered, roots: roots.map(node => node.id), requests: pending.length + 1 };
}

/** Deterministic, local XY seeds; physics never invents relationship edges. */
export function layoutGraph(model) {
  const { nodes, order, roots } = model;
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    node.weight = 1;
    for (const id of node.children) node.weight += nodes.get(id).weight;
    node.radius = node.folder ? (node.depth <= 2 ? 17 : 12) : 10;
    node.spread = node.children.length ? Math.max(75, Math.sqrt(node.weight) * 36) : 0;
  }
  const rootSpan = roots.reduce((sum, id) => sum + Math.max(160, nodes.get(id).spread * 2.4), 0);
  const rootRadius = roots.length > 1 ? Math.max(180, rootSpan / (Math.PI * 2)) : 0;
  let rootAngle = -Math.PI / 2;
  for (const id of roots) {
    const root = nodes.get(id);
    const sector = Math.max(160, root.spread * 2.4) / (rootSpan || 1) * Math.PI * 2;
    root.angle = rootAngle + sector / 2;
    root.x = Math.cos(root.angle) * rootRadius;
    root.y = Math.sin(root.angle) * rootRadius;
    rootAngle += sector;
  }
  for (const node of order) {
    const sweep = node.depth === 1 ? Math.PI * 2 : Math.PI * 1.35;
    let angle = node.angle - sweep / 2;
    for (let i = 0; i < node.children.length; i++) {
      const child = nodes.get(node.children[i]);
      const sector = child.weight / Math.max(1, node.weight - 1) * sweep;
      child.angle = angle + sector / 2;
      const distance = Math.max(72, node.spread) * (child.folder ? 1.1 : .8 + (i % 3) * .12);
      child.x = node.x + Math.cos(child.angle) * distance;
      child.y = node.y + Math.sin(child.angle) * distance;
      angle += sector;
    }
    node.anchorX = node.x;
    node.anchorY = node.y;
  }
  model.edges = order.filter(node => nodes.has(node.parentId)).map(node => ({ source: node.parentId, target: node.id }));
  return model;
}

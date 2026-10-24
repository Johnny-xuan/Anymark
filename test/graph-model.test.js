import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGraphTree, layoutGraph } from '../web/graph-model.js';

const folder = (id, children = []) => ({ id, path: `id:${id}`, type: 'directory', title: 'Same', children });
const bookmark = id => ({ id, path: `id:${id}`, type: 'file', title: 'Same', url: 'https://same.example/' });

function readerFor(root) {
  const entries = new Map();
  const collect = node => { entries.set(node.id, node); for (const child of node.children || []) collect(child); };
  collect(root);
  const project = (node, remaining) => {
    const { children, ...entry } = node;
    if (children && remaining > 0) entry.children = children.map(child => project(child, remaining - 1));
    return entry;
  };
  return async ({ path, depth }) => {
    const node = path === '/' ? root : entries.get(path.slice(3));
    const { children, ...entry } = node;
    return { entry, children: children.map(child => project(child, depth - 1)) };
  };
}

function deepLibrary() {
  let branch = bookmark('bottom');
  for (let level = 27; level >= 0; level--) branch = folder(`folder-${level}`, [branch, bookmark(`sibling-${level}`)]);
  return folder('0', [folder('bar', [branch, bookmark('after')]), folder('other')]);
}

test('graph crosses repeated depth boundaries without losing original sibling order or identical bookmarks', async () => {
  const model = await loadGraphTree(readerFor(deepLibrary()));
  const expected = ['bar', ...Array.from({ length: 28 }, (_, index) => `folder-${index}`), 'bottom',
    ...Array.from({ length: 28 }, (_, index) => `sibling-${27 - index}`), 'after', 'other'];
  assert.deepEqual(model.order.map(node => node.id), expected);
  assert.equal(model.nodes.size, expected.length);
  assert.deepEqual(model.nodes.get('folder-27').children, ['bottom', 'sibling-27']);
  assert.deepEqual(model.nodes.get('bar').children, ['folder-0', 'after']);
});

test('graph rejects a changed depth-boundary folder instead of returning a silently incomplete library', async () => {
  const read = readerFor(deepLibrary());
  await assert.rejects(loadGraphTree(async args => {
    const result = await read(args);
    if (args.path !== '/') result.entry = { ...result.entry, id: 'moved-during-read' };
    return result;
  }));
});

test('initial XY layout is repeatable and finite for deep, wide and empty Chrome roots', async () => {
  for (const library of [deepLibrary(), folder('0', [folder('bar', Array.from({ length: 240 }, (_, i) => bookmark(`site-${i}`))), folder('other')])]) {
    const first = layoutGraph(await loadGraphTree(readerFor(library)));
    const second = layoutGraph(await loadGraphTree(readerFor(library)));
    const positions = model => model.order.map(({ id, x, y }) => ({ id, x, y }));
    assert.deepEqual(positions(first), positions(second));
    assert.ok(first.order.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
    const leaves = first.order.filter(node => !node.folder);
    assert.equal(new Set(leaves.map(node => `${node.x},${node.y}`)).size, leaves.length, 'Distinct bookmarks must not start collapsed into the same point');
  }
});

import assert from 'node:assert/strict';

/** Runs inside a caller-owned extension page; never launches a browser itself. */
export async function exerciseGraph({ page, webURL, graphModuleURL, fixture, checks, screenshotWeb }) {
  const originalViewport = page.viewportSize();
  const originalMedia = await page.evaluate(() => ({
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference',
  }));
  const operation = (name, args) => page.evaluate(async ({ name, args }) => {
    const response = await chrome.runtime.sendMessage({ type: 'anymark.operation', operation: name, args });
    if (!response?.ok) throw new Error(`${name}: ${JSON.stringify(response?.error || response)}`);
    return response.result;
  }, { name, args });
  const folder = (await operation('stat', { path: `id:${fixture.folder.id}` })).entry;
  const bookmark = (await operation('stat', { path: `id:${fixture.bookmark.id}` })).entry;
  const title = entry => entry.title ?? entry.name;
  const noteEntry = [bookmark, folder].find(entry => (entry.note || '').includes('graph-needle'));
  assert.ok(noteEntry, 'A real fixture note must contain graph-needle');
  const nativeBefore = await page.evaluate(() => chrome.bookmarks.getTree());
  const expected = [];
  const flatten = node => {
    expected.push({ id: String(node.id), parentId: String(node.parentId), title: node.title, url: node.url || null });
    for (const child of node.children || []) flatten(child);
  };
  for (const root of nativeBefore) for (const child of root.children || []) flatten(child);
  const ids = new Set(expected.map(node => node.id));
  const expectedEdges = expected.filter(node => ids.has(node.parentId)).length;
  const main = page.locator('#graph-view .bookmark-graph');
  let probe;
  const ready = async () => {
    await page.locator('#graph-view .bookmark-graph[data-state="ready"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('#add-link').disabled);
  };
  const search = async query => { await page.locator('#search').fill(query); await page.locator('#search').press('Enter'); };
  const result = id => main.locator(`.graph-result-select[data-node-id="${id}"]`);
  const selected = id => page.waitForFunction(id => document.querySelector('#graph-view .bookmark-graph')?.dataset.selectedId === id
    && document.querySelector('#entry-id')?.textContent === id && !document.querySelector('#detail').hidden, String(id));
  const choose = async entry => { await search(title(entry)); await result(entry.id).click(); await selected(entry.id); };
  const settle = async () => {
    await page.waitForFunction(state => {
      const facts = state.graph.diagnostics;
      return !facts.animationPending && !facts.transitioning && !facts.settling;
    }, probe);
    await probe.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const viewport = () => probe.evaluate(({ graph }) => ({ ...graph.diagnostics.viewport }));
  const pointFor = async id => {
    const point = await probe.evaluate(({ graph }, id) => {
      const node = graph.model.nodes.get(String(id)), view = graph.diagnostics.viewport;
      if (!node) return null;
      const rect = graph.canvas.getBoundingClientRect();
      const x = rect.left + node.x * view.scale + view.x, y = rect.top + node.y * view.scale + view.y;
      return { x, y, inside: x > rect.left + 3 && x < rect.right - 3 && y > rect.top + 3 && y < rect.bottom - 3 };
    }, String(id));
    assert.ok(point?.inside, `Actual node ${id} must be visible after focus`);
    return point;
  };

  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.goto(`${webURL.split('#')[0]}#graph`); await ready();
    assert.equal(await main.getAttribute('data-node-count'), String(expected.length));
    assert.equal(await main.getAttribute('data-edge-count'), String(expectedEdges));
    assert.equal(await page.locator('#bookmark-list').isVisible(), false);
    checks.push('Relationship graph includes all native Chrome nodes and actual parent edges, including branches beyond tree depth 12');

    for (const [query, entry] of [[title(bookmark), bookmark], [bookmark.url, bookmark], ['graph-needle', noteEntry]]) {
      await search(query); await result(entry.id).waitFor();
      assert.match(await main.locator('.graph-status').textContent(), /[1-9]\d* 个搜索结果/);
      await result(entry.id).click(); await selected(entry.id);
      assert.equal(await page.locator('#edit-note').inputValue(), entry.note || '');
    }
    await choose(bookmark);
    const originalNote = bookmark.note || '', draft = `${originalNote}\nUnsaved graph draft`;
    await page.locator('#edit-note').fill(draft);
    await result(bookmark.id).click();
    assert.equal(await page.locator('#confirm-dialog').isVisible(), false);
    assert.equal(await page.locator('#edit-note').inputValue(), draft, 'Same-node selection must preserve its unsaved draft');
    await search(title(folder)); await result(folder.id).click();
    await page.locator('#confirm-dialog').waitFor({ state: 'visible' });
    assert.equal(await main.getAttribute('data-selected-id'), String(bookmark.id));
    await page.locator('#confirm-cancel').click(); await selected(bookmark.id);
    assert.equal(await page.locator('#edit-note').inputValue(), draft);
    await result(folder.id).click(); await page.locator('#confirm-accept').click(); await selected(folder.id);
    assert.equal((await operation('stat', { path: `id:${bookmark.id}` })).entry.note || '', originalNote);
    await choose(bookmark);
    const saved = `${originalNote}\nSaved graph note`;
    await page.locator('#edit-note').fill(saved); await page.locator('#save-detail').click(); await ready(); await selected(bookmark.id);
    assert.equal((await operation('stat', { path: `id:${bookmark.id}` })).entry.note, saved);
    await search('Saved graph note'); await result(bookmark.id).waitFor();
    await page.locator('#edit-note').fill(originalNote); await page.locator('#save-detail').click(); await ready(); await selected(bookmark.id);
    assert.equal((await operation('stat', { path: `id:${bookmark.id}` })).entry.note || '', originalNote);
    checks.push('Graph title/URL/note search uses real data; same-node, cancel/discard and save transitions preserve inspector edits correctly');

    await choose(folder);
    await main.locator('.graph-current').getByRole('button', { name: '在列表中打开', exact: true }).click();
    await page.waitForFunction(id => location.hash === `#folder/${encodeURIComponent(id)}`
      && document.querySelector('#bookmark-list')?.getAttribute('aria-busy') === 'false', String(folder.id));
    assert.equal(await page.locator('#graph-view canvas').count(), 0);
    await page.goto(`${webURL.split('#')[0]}#graph`); await ready();
    await page.setViewportSize({ width: 390, height: 844 });
    const backgrounds = [];
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      const layout = await main.evaluate(root => {
        const canvas = root.querySelector('canvas'), bounds = canvas.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
          canvas: { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height },
          background: getComputedStyle(root.querySelector('.graph-stage')).backgroundColor,
          controlsFit: [...root.querySelectorAll('.graph-toolbar button')].every(button => {
            const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1;
          }) };
      });
      assert.equal(layout.overflow, false);
      assert.equal(layout.controlsFit, true);
      assert.ok(layout.canvas.left >= 0 && layout.canvas.right <= 391 && layout.canvas.width > 200 && layout.canvas.height >= 300);
      backgrounds.push(layout.background);
      if (screenshotWeb) await screenshotWeb(page, `graph-390-${theme}`, theme);
    }
    assert.notEqual(backgrounds[0], backgrounds[1]);
    checks.push('Folder navigation returns to the ordinary list; the 390px graph remains usable without clipping in light and dark themes');

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    probe = await page.evaluateHandle(async graphModuleURL => {
      const { BookmarkGraph } = await import(graphModuleURL);
      const host = document.createElement('section');
      host.setAttribute('aria-label', 'Isolated real graph interaction scenario');
      Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '10000', overflow: 'auto', background: 'var(--canvas)' });
      document.body.append(host);
      const state = { host, graph: null, accepted: [], errors: [] };
      state.graph = new BookmarkGraph(host, {
        onSelect: id => { state.accepted.push(String(id)); state.graph.select(id); },
        onError: error => state.errors.push(error.message || String(error)),
      });
      try { await state.graph.refresh(); }
      catch (error) { state.graph.dispose(); host.remove(); throw error; }
      return state;
    }, graphModuleURL);
    await settle();
    const actual = await probe.evaluate(({ graph, errors }) => ({
      nodes: graph.model.order.map(node => ({ id: node.id, parentId: node.parentId, title: node.title, url: node.url || null })),
      errors, view: graph.diagnostics.viewport,
    }));
    assert.deepEqual(actual.errors, []);
    assert.deepEqual(actual.nodes.sort((a, b) => a.id.localeCompare(b.id)), expected.sort((a, b) => a.id.localeCompare(b.id)));
    assert.ok(Number.isFinite(actual.view.x) && Number.isFinite(actual.view.y) && actual.view.scale > 0);
    const canvas = page.locator('section[aria-label="Isolated real graph interaction scenario"] .graph-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box);
    const beforePan = await viewport(), beforePanImage = await canvas.screenshot();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down();
    await page.mouse.move(box.x + 88, box.y + 53, { steps: 10 }); await page.mouse.up(); await settle();
    const afterPan = await viewport();
    assert.ok(Math.hypot(afterPan.x - beforePan.x, afterPan.y - beforePan.y) > 30, 'Background drag must pan the flat view');
    assert.ok(Math.abs(afterPan.scale - beforePan.scale) < .0001, 'Panning must not rotate or zoom the graph');
    assert.notDeepEqual(await canvas.screenshot(), beforePanImage, 'Panning must change actual rendered pixels');
    const anchor = { x: box.width / 2, y: box.height / 2 };
    await page.mouse.move(box.x + anchor.x, box.y + anchor.y); await page.mouse.wheel(0, -300); await settle();
    const afterZoom = await viewport();
    assert.ok(afterZoom.scale > afterPan.scale);
    assert.ok(Math.hypot((anchor.x - afterPan.x) / afterPan.scale - (anchor.x - afterZoom.x) / afterZoom.scale,
      (anchor.y - afterPan.y) / afterPan.scale - (anchor.y - afterZoom.y) / afterZoom.scale) < 1, 'Wheel zoom must preserve the world point under the pointer');
    checks.push('Actual 2D background drag pans without rotation; native wheel zoom anchors the pointer and changes rendered pixels');

    await probe.evaluate(({ graph }, id) => graph.focusNode(id), String(bookmark.id)); await settle();
    const point = await pointFor(bookmark.id);
    await page.mouse.click(point.x, point.y);
    assert.equal(await probe.evaluate(state => state.accepted.at(-1)), String(bookmark.id));
    const dragBefore = await probe.evaluate(({ graph, accepted }, id) => ({ x: graph.model.nodes.get(id).x, y: graph.model.nodes.get(id).y, accepts: accepted.length }), String(bookmark.id));
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + 35, point.y + 20, { steps: 10 });
    await probe.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dragged = await probe.evaluate(({ graph }, id) => ({ x: graph.model.nodes.get(id).x, y: graph.model.nodes.get(id).y }), String(bookmark.id));
    assert.ok(Math.hypot(dragged.x - dragBefore.x, dragged.y - dragBefore.y) > 1, 'Dragging must move the actual visible node, not its Chrome parent');
    await page.mouse.up(); await settle();
    assert.equal(await probe.evaluate(state => state.accepted.length), dragBefore.accepts, 'Node drag must not masquerade as a click');
    await probe.evaluate(({ graph }) => graph.focusCanvas()); await page.keyboard.press('ArrowLeft');
    const parentId = expected.find(node => node.id === String(bookmark.id)).parentId;
    assert.equal(await probe.evaluate(({ graph }) => graph.diagnostics.cursorId), parentId);
    await page.keyboard.press('Enter');
    assert.equal(await probe.evaluate(state => state.accepted.at(-1)), parentId);
    await probe.evaluate(({ graph }, id) => graph.focusNode(id), String(folder.id)); await settle();
    assert.equal(await probe.evaluate(({ graph }) => graph.diagnostics.focusedId), String(folder.id));
    checks.push('Real node clicks select; visual node dragging does not select or reparent; keyboard traverses/selects the actual parent and folder focus works');

    await probe.evaluate(({ graph }) => graph.reset()); await settle();
    await probe.evaluate(({ graph }, id) => graph.focusNode(id), String(bookmark.id));
    assert.equal(await probe.evaluate(({ graph }) => graph.diagnostics.transitioning), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(state => state.graph.diagnostics.reducedMotion && !state.graph.diagnostics.transitioning && !state.graph.diagnostics.settling, probe);
    await probe.evaluate(({ graph }, id) => graph.focusNode(id), String(folder.id));
    assert.equal(await probe.evaluate(({ graph }) => graph.diagnostics.transitioning), false);
    await page.mouse.move(1, 1); await settle();
    const idleFrames = await probe.evaluate(({ graph }) => graph.diagnostics.renderedFrames);
    await probe.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    assert.equal(await probe.evaluate(({ graph }) => graph.diagnostics.renderedFrames), idleFrames, 'Idle graph must not keep painting');
    await probe.evaluate(({ host }) => { host.hidden = true; });
    await page.waitForFunction(state => !state.graph.diagnostics.visible && !state.graph.diagnostics.animationPending, probe);
    await probe.evaluate(({ host }) => { host.hidden = false; });
    await page.waitForFunction(state => state.graph.diagnostics.visible, probe); await settle();
    checks.push('Reduced-motion ends settling/focus animation immediately; hidden and idle graphs stop rendering and resume when shown');

    await probe.evaluate(({ graph }, id) => graph.focusNode(id), String(bookmark.id)); await settle();
    await probe.evaluate(({ graph }, id) => graph.select(id), String(folder.id));
    await page.mouse.move(1, 1); await settle();
    const beforeHover = await canvas.screenshot();
    const hoverPoint = await pointFor(bookmark.id);
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    await page.waitForFunction(({ state, id }) => state.graph.hoverId === id, { state: probe, id: String(bookmark.id) }); await settle();
    assert.notDeepEqual(await canvas.screenshot(), beforeHover, 'Hovering a distinct node must visibly highlight it');
    await page.mouse.move(box.x + box.width / 2, box.y - 8);
    await page.waitForFunction(state => state.graph.hoverId === null, probe); await settle();
    assert.deepEqual(await canvas.screenshot(), beforeHover, 'Leaving the canvas must restore the exact pre-hover visual state');
    assert.deepEqual(await page.evaluate(() => chrome.bookmarks.getTree()), nativeBefore, 'Graph layout and navigation must never mutate actual bookmarks');
    const disposal = await probe.evaluate(async ({ graph, host }) => {
      const frames = graph.diagnostics.renderedFrames;
      graph.dispose(); graph.dispose();
      await new Promise(resolve => setTimeout(resolve, 100));
      return { attached: host.contains(graph.root), painted: graph.diagnostics.renderedFrames - frames };
    });
    assert.deepEqual(disposal, { attached: false, painted: 0 });
    checks.push('Hover exit restores the previous visible selection; disposal is idempotent and silent; every graph interaction leaves native bookmarks unchanged');
  } finally {
    if (probe) {
      await probe.evaluate(state => { state.graph?.dispose(); state.host.remove(); });
      await probe.dispose();
    }
    await page.emulateMedia(originalMedia);
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}

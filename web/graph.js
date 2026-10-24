import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY } from 'd3-force';
import { call } from '../extension/ui-api.js';
import { icon } from '../extension/icons.js';
import { faviconElement, FaviconCache } from '../extension/favicons.js';
import { loadGraphTree, layoutGraph } from './graph-model.js';

let nextGraphId = 0;
const title = node => node.title || node.name || (node.folder ? '未命名文件夹' : '未命名书签');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeURL = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** A read-only view of real Chrome parent-child relationships.
 * Only the host's select(id), after its dirty guard, accepts a selection.
 */
export class BookmarkGraph {
  constructor(container, { onSelect, onOpenFolder, onError } = {}) {
    this.container = container;
    this.callbacks = { onSelect, onOpenFolder, onError };
    this.model = null;
    this.selectedId = this.cursorId = this.hoverId = this.focusedId = null;
    this.query = '';
    this.filter = 'all';
    this.matches = [];
    this.matchIds = new Set();
    this.showLeaves = true;
    this.fullscreen = false;
    this.disposed = false;
    this.revision = this.frame = this.resultPage = this.renderCount = 0;
    this.settleTicks = 0;
    this.listeners = [];
    this.labelPool = [];
    this.pointers = new Map();
    this.viewport = { x: 0, y: 0, scale: 1 };
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.scheme = matchMedia('(prefers-color-scheme: dark)');
    this.reducedMotion = this.motion.matches;
    this.root = element('div', 'bookmark-graph');
    this.root.dataset.renderer = 'canvas-2d';
    this.root.dataset.state = 'idle';
    this.root.dataset.nodeCount = this.root.dataset.edgeCount = '0';
    this.root.dataset.selectedId = '';
    this.root.setAttribute('aria-label', '书签二维关系图');
    this.container.append(this.root);
    this.favicons = new FaviconCache(() => this._requestRender());
    this._buildUI();
    this._initRenderer();
    this._observe();
  }

  _listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.listeners.push(() => target.removeEventListener(type, listener, options));
  }

  _button(label, name, action, className = '') {
    const button = element('button', `graph-button ${className}`.trim());
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    if (name) button.append(icon(name));
    button.append(element('span', '', label));
    this._listen(button, 'click', action);
    return button;
  }

  _buildUI() {
    const uid = `bookmark-graph-${++nextGraphId}`;
    const toolbar = element('div', 'graph-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '关系图视角与显示');
    this.zoomInButton = this._button('放大', 'zoom-in', () => this._zoom(1.28), 'graph-icon-button');
    this.zoomOutButton = this._button('缩小', 'zoom-out', () => this._zoom(1 / 1.28), 'graph-icon-button');
    this.resetButton = this._button('重置视角', 'refresh', () => this.reset(), 'graph-icon-button');
    this.focusButton = this._button('聚焦当前节点', 'focus', () => this.focusNode(this.cursorId || this.selectedId), 'graph-icon-button');
    this.leafButton = this._button('显示书签', 'globe', () => this._toggleLeaves(), 'graph-icon-button');
    this.leafButton.setAttribute('aria-pressed', 'true');
    this.fullscreenButton = this._button('全屏沉浸视图', 'maximize', () => this._toggleFullscreen(), 'graph-icon-button');
    this.fullscreenButton.setAttribute('aria-pressed', 'false');
    toolbar.append(this.zoomInButton, this.zoomOutButton, this.resetButton, this.focusButton, this.leafButton, this.fullscreenButton);
    this.status = element('p', 'graph-status', '尚未载入书签');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.setAttribute('aria-atomic', 'true');
    this.stage = element('div', 'graph-stage');
    this.labels = element('div', 'graph-labels');
    this.labels.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 36; i++) {
      const label = element('span', 'graph-node-label');
      label.hidden = true;
      this._listen(label, 'click', event => {
        event.stopPropagation();
        const id = label.dataset.nodeId;
        if (id && this.model?.nodes.has(id)) {
          this.cursorId = id;
          this._requestSelect(id);
          this._updateButtons();
          this._requestRender();
        }
      });
      this._listen(label, 'dblclick', event => {
        event.stopPropagation();
        const id = label.dataset.nodeId;
        if (id && this.model?.nodes.has(id)) this.focusNode(id);
      });
      this._listen(label, 'pointerenter', () => {
        const id = label.dataset.nodeId;
        if (id && this.hoverId !== id) { this.hoverId = id; this._requestRender(); }
      });
      this._listen(label, 'pointerleave', () => {
        if (this.hoverId === label.dataset.nodeId) { this.hoverId = null; this._requestRender(); }
      });
      this.labels.append(label);
      this.labelPool.push(label);
    }
    this.message = element('div', 'graph-message');
    this.messageTitle = element('strong', '', '二维关系图');
    this.messageCopy = element('p', '', '正在准备本地关系图。');
    this.fallbackButton = this._button('在列表中打开', 'folder', () => this._openFolder(this.model?.root?.id ?? '0'));
    this.message.append(this.messageTitle, this.messageCopy, this.fallbackButton);
    this.hint = element('p', 'graph-hint', '滚轮缩放 · 拖拽平移 · 单击查看详情 · 双击聚焦');
    this.hint.id = `${uid}-hint`;
    this.help = element('div', 'graph-help');
    this.help.hidden = true;
    this.current = element('div', 'graph-current');
    this.current.hidden = true;
    this.currentCopy = element('div', 'graph-current-copy');
    this.currentKind = element('span', 'graph-current-kind', '目录');
    this.currentTitle = element('strong', '', '');
    this.currentCopy.append(this.currentKind, this.currentTitle);
    this.openFolderButton = this._button('进入此目录', 'folder', () => this._openFolder(this.selectedId));
    this.openFolderButton.hidden = true;
    this.openLink = element('a', 'graph-open-link');
    this.openLink.append(icon('external'), element('span', '', '打开网页'));
    this.openLink.target = '_blank';
    this.openLink.rel = 'noopener noreferrer';
    this.openLink.hidden = true;
    this.current.append(this.currentCopy, this.openFolderButton, this.openLink);
    this.stage.append(toolbar, this.labels, this.status, this.current, this.message);
    this.results = element('details', 'graph-results');
    this.results.hidden = true;
    this.resultSummary = element('summary', '', '节点列表');
    this.resultHeading = element('p', 'graph-result-heading');
    this.resultHeading.id = `${uid}-results`;
    this.resultList = element('ul', 'graph-result-list');
    this.resultList.setAttribute('aria-labelledby', this.resultHeading.id);
    this.resultPager = element('div', 'graph-result-pager');
    this.prevButton = this._button('上一页', 'back', () => { this.resultPage--; this._updateResults(); });
    this.nextButton = this._button('下一页', 'arrow', () => { this.resultPage++; this._updateResults(); });
    this.pageText = element('span');
    this.resultPager.append(this.prevButton, this.pageText, this.nextButton);
    this.results.append(this.resultSummary, this.resultHeading, this.resultList, this.resultPager);
    this.palette = element('div', 'graph-palette');
    this.palette.setAttribute('aria-hidden', 'true');
    for (const name of ['canvas', 'text', 'muted', 'line', 'accent', 'strong-line', 'selection']) this.palette.append(element('span', `graph-color-${name}`));
    this.root.append(this.stage, this.results, this.palette);
    this._updateButtons();
  }

  _initRenderer() {
    try {
      this.canvas = element('canvas', 'graph-canvas');
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute('role', 'region');
      this.canvas.setAttribute('aria-label', '二维书签关系图，方向键浏览节点，Enter 选择');
      this.canvas.setAttribute('aria-describedby', this.hint.id);
      this.context = this.canvas.getContext('2d', { alpha: false });
      if (!this.context) throw new Error('此环境不支持 Canvas 2D。仍可在列表中浏览和管理全部书签。');
      this.stage.prepend(this.canvas);
      this._listen(this.canvas, 'keydown', event => this._key(event));
      this._listen(this.canvas, 'pointerdown', event => this._pointerDown(event));
      this._listen(this.canvas, 'pointermove', event => this._pointerMove(event));
      this._listen(this.canvas, 'pointerup', event => this._pointerUp(event));
      this._listen(this.canvas, 'pointercancel', () => this._cancelPointers());
      this._listen(this.canvas, 'lostpointercapture', event => { if (this.pointers.has(event.pointerId)) this._cancelPointers(); });
      this._listen(this.canvas, 'pointerleave', () => { if (!this.pointers.size) this._cancelPointers(); });
      this._listen(this.canvas, 'wheel', event => {
        event.preventDefault();
        this._cancelPointers();
        const point = this._point(event);
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
        this._zoom(Math.exp(-clamp(delta, -600, 600) * .0015), point);
      }, { passive: false });
      this._listen(this.canvas, 'dblclick', event => {
        if (event.button !== 0 || this.suppressDoubleClick) return;
        const node = this._pick(this._point(event));
        if (node) { event.preventDefault(); this.focusNode(node.id); }
      });
      this._listen(this.canvas, 'contextmenu', event => event.preventDefault());
      this._listen(this.canvas, 'contextlost', event => {
        event.preventDefault();
        this._fail(new Error('Canvas 绘图上下文已丢失。请使用列表；重新进入工作台后可重试。'));
      });
      this._theme();
    } catch (error) { this._fail(error); }
  }

  _observe() {
    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(this.stage);
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.intersecting = entries[0]?.isIntersecting;
      if (this.intersecting) this._resize();
      else this._pause();
    });
    this.intersectionObserver.observe(this.stage);
    this.mutationObserver = new MutationObserver(() => {
      if (this.disposed) return;
      this._theme();
      this._resize();
    });
    for (let ancestor = this.container; ancestor; ancestor = ancestor.parentElement) this.mutationObserver.observe(ancestor, { attributes: true, attributeFilter: ['hidden', 'class', 'style', 'data-theme'] });
    this._listen(document, 'visibilitychange', () => document.hidden ? this._pause() : this._resize());
    this._listen(window, 'blur', () => this._cancelPointers());
    this._listen(this.motion, 'change', event => {
      this.reducedMotion = event.matches;
      if (event.matches && this.transition) {
        this.viewport = { ...this.transition.to };
        this.transition = null;
      }
      this._requestRender();
    });
    this._listen(this.scheme, 'change', () => this._theme());
    this._resize();
  }

  _visible() {
    return !this.disposed && !document.hidden && this.intersecting !== false && this.stage.clientWidth > 0 && this.stage.getClientRects().length > 0;
  }

  _pause() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.transition) this.viewport = { ...this.transition.to };
    this.transition = null;
    this._cancelPointers();
  }

  _resize() {
    if (!this.context || this.failed || !this._visible()) { this._pause(); return; }
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (this.width !== width || this.height !== height || this.ratio !== ratio) {
      if (this.width && this.height) {
        this.viewport.x += (width - this.width) / 2;
        this.viewport.y += (height - this.height) / 2;
      }
      this.width = width;
      this.height = height;
      this.ratio = ratio;
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this._cancelPointers();
      const selected = this.model?.nodes.get(this.selectedId);
      if (selected) {
        const x = selected.x * this.viewport.scale + this.viewport.x;
        const y = selected.y * this.viewport.scale + this.viewport.y;
        this.viewport.x += clamp(x, 32, Math.max(32, width - 32)) - x;
        this.viewport.y += clamp(y, 32, Math.max(32, height - 32)) - y;
      }
    }
    if (this.pendingFit !== undefined && !this.settling) {
      const target = this.pendingFit;
      this.pendingFit = undefined;
      this._fit(this.model?.nodes.get(target), false);
    }
    this._requestRender();
  }

  _theme() {
    if (this.disposed) return;
    this.colors = {};
    for (const probe of this.palette.children) this.colors[probe.className.replace('graph-color-', '')] = getComputedStyle(probe).color;
    this._requestRender();
  }

  async refresh() {
    if (this.disposed) return;
    const revision = ++this.revision;
    this._cancelPointers();
    this.transition = null;
    this._stopSettling();
    this.root.dataset.state = this.failed ? 'unavailable' : 'loading';
    this.root.setAttribute('aria-busy', 'true');
    this.status.textContent = '正在读取全部书签层级…';
    if (!this.model && !this.failed) this._showMessage('正在载入关系图', '仅读取本地书签，不会修改目录或链接。', false);
    try {
      const next = await loadGraphTree(args => call('tree', args), () => this.disposed || revision !== this.revision);
      if (!next || this.disposed || revision !== this.revision) return;
      const previous = this.model;
      this.model = layoutGraph(next);
      let retainedPositions = 0;
      for (const node of next.order) {
        const old = previous?.nodes.get(node.id);
        if (old && Number.isFinite(old.x) && Number.isFinite(old.y)) {
          retainedPositions++;
          node.x = node.anchorX = old.x;
          node.y = node.anchorY = old.y;
        }
      }
      if (!next.nodes.has(this.selectedId)) this.selectedId = null;
      if (!next.nodes.has(this.cursorId)) this.cursorId = next.roots[0] || null;
      if (!next.nodes.has(this.focusedId)) this.focusedId = null;
      this._cancelPointers();
      this.root.dataset.selectedId = this.selectedId || '';
      this.root.dataset.focusedId = this.focusedId || '';
      this.root.dataset.nodeCount = String(next.nodes.size);
      this.root.dataset.edgeCount = String(next.edges.length);
      this.favicons.retain(next.order.filter(node => !node.folder).map(node => node.url));
      if (!this.failed) {
        this.message.hidden = next.nodes.size > 0;
        if (!next.nodes.size) this._showMessage('还没有书签', '添加书签后，这里会显示真实的目录与链接关系。', true);
        this._startSettling();
      }
      this.root.dataset.state = this.failed ? 'unavailable' : next.nodes.size ? 'ready' : 'empty';
      this.search(this.query);
      this._updateCurrent();
      this._updateButtons();
      if (!retainedPositions) {
        this._fit(null, false);
        this.pendingFit = this.focusedId || null;
      }
      if (!this.settling) this._resize();
    } catch (error) {
      if (this.disposed || revision !== this.revision) return;
      this.root.dataset.state = this.failed ? 'unavailable' : 'error';
      this.status.textContent = '书签层级读取失败';
      if (!this.failed) this._showMessage('无法读取关系图', `${error.message || String(error)}${this.model ? ' 已有数据未被替换；请使用工作台刷新重试。' : ' 请使用工作台刷新重试，或返回列表。'}`, true);
      this._notify(error);
    } finally {
      if (!this.disposed && revision === this.revision) this.root.removeAttribute('aria-busy');
    }
  }

  _startSettling() {
    this._stopSettling();
    if (!this.model.order.length) return;
    // d3's own timer is stopped immediately. Only our bounded, visible work
    // queue advances ticks, so there is never a second or idle animation loop.
    this.simulation = forceSimulation(this.model.order).stop()
      .alphaDecay(.045).velocityDecay(.5)
      .force('charge', forceManyBody().strength(node => node.folder ? -200 : -70).distanceMax(650))
      .force('links', forceLink(this.model.edges.map(edge => ({ ...edge }))).id(node => node.id).distance(edge => edge.target.folder ? 105 : 68).strength(.2))
      .force('collision', forceCollide().radius(node => node.radius + 10).iterations(2))
      .force('x', forceX(node => node.anchorX).strength(.035))
      .force('y', forceY(node => node.anchorY).strength(.035));
    this.settleTicks = 0;
    this.settling = true;
    this._requestRender();
  }

  _stopSettling() {
    this.simulation?.stop();
    this.simulation = null;
    this.settling = false;
  }

  _advanceLayout() {
    if (!this.settling || !this.simulation) return;
    const start = performance.now();
    do {
      this.simulation.tick();
      this.settleTicks++;
    } while (this.settleTicks < 140 && this.simulation.alpha() > .002 && performance.now() - start < 7);
    if (this.settleTicks >= 140 || this.simulation.alpha() <= .002) {
      this._stopSettling();
      if (this.pendingFit !== undefined) {
        const target = this.pendingFit;
        this.pendingFit = undefined;
        this._fit(this.model.nodes.get(target), false);
      }
    }
  }

  _requestRender() {
    if (!this.frame && this.context && !this.failed && this._visible()) this.frame = requestAnimationFrame(time => this._frame(time));
  }

  _frame(time) {
    this.frame = 0;
    if (!this._visible() || this.failed) { this._pause(); return; }
    this._advanceLayout();
    if (this.transition) {
      const progress = clamp((time - this.transition.start) / 220, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      const { from, to } = this.transition;
      for (const axis of ['x', 'y', 'scale']) this.viewport[axis] = from[axis] + (to[axis] - from[axis]) * eased;
      if (progress === 1) this.transition = null;
    }
    // Reduced motion shows only the settled layout, never decorative motion.
    if (!this.reducedMotion || !this.settling) this._draw();
    if (this.settling || this.transition) this._requestRender();
  }

  _nodeShown(node) { return this.showLeaves || node.folder; }
  _radius(node) { return clamp(node.radius * this.viewport.scale, node.folder ? 7 : 5.5, node.folder ? 24 : 18); }

  _draw() {
    if (!this.width || !this.height) return;
    const context = this.context;
    const colors = this.colors;
    const { x, y, scale } = this.viewport;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.fillStyle = colors.canvas;
    context.fillRect(0, 0, this.width, this.height);
    let visibleNodes = 0;
    let visibleEdges = 0;
    if (this.model) {
      const focusId = this.hoverId || this.selectedId;
      const connectedIds = new Set();
      if (focusId) connectedIds.add(focusId);
      context.strokeStyle = colors['strong-line'];
      context.lineWidth = .9;
      context.globalAlpha = focusId ? .28 : .5;
      context.beginPath();
      const highlightEdges = [];
      for (const edge of this.model.edges) {
        const a = this.model.nodes.get(edge.source);
        const b = this.model.nodes.get(edge.target);
        if (!this._nodeShown(a) || !this._nodeShown(b)) continue;
        const ax = a.x * scale + x; const ay = a.y * scale + y;
        const bx = b.x * scale + x; const by = b.y * scale + y;
        if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > this.width || Math.max(ay, by) < 0 || Math.min(ay, by) > this.height) continue;
        visibleEdges++;
        if (focusId && (edge.source === focusId || edge.target === focusId)) {
          connectedIds.add(edge.source);
          connectedIds.add(edge.target);
          highlightEdges.push([ax, ay, bx, by]);
        } else {
          context.moveTo(ax, ay); context.lineTo(bx, by);
        }
      }
      context.stroke();
      if (highlightEdges.length) {
        context.strokeStyle = colors.accent;
        context.lineWidth = 1.65;
        context.globalAlpha = .9;
        context.beginPath();
        for (const [ax, ay, bx, by] of highlightEdges) {
          context.moveTo(ax, ay); context.lineTo(bx, by);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
      for (const node of this.model.order) {
        if (!this._nodeShown(node)) continue;
        const sx = node.x * scale + x; const sy = node.y * scale + y;
        const radius = this._radius(node);
        if (sx + radius < 0 || sx - radius > this.width || sy + radius < 0 || sy - radius > this.height) continue;
        visibleNodes++;
        const active = node.id === this.selectedId;
        const match = this.matchIds.has(node.id);
        const cursor = node.id === this.cursorId || node.id === this.hoverId;
        const neighbor = connectedIds.has(node.id);
        const dimmedByFilter = this.filter === 'file' && node.folder && !this.query;
        context.globalAlpha = (this.query && !match && !active && !cursor) ? .25 : dimmedByFilter ? .35 : (this.hoverId && !neighbor && !match) ? .45 : 1;
        context.fillStyle = node.folder ? (node.depth <= 2 ? colors.accent : colors.text) : colors.selection;
        context.beginPath(); context.arc(sx, sy, radius, 0, Math.PI * 2); context.fill();
        if (node.folder) {
          context.strokeStyle = colors.canvas;
          context.lineWidth = 1.25;
          const unit = radius * .48;
          context.beginPath();
          context.moveTo(sx - unit, sy - unit * .4);
          context.lineTo(sx - unit, sy + unit * .6);
          context.lineTo(sx + unit, sy + unit * .6);
          context.lineTo(sx + unit, sy - unit * .4);
          context.lineTo(sx, sy - unit * .4);
          context.lineTo(sx - unit * .25, sy - unit * .75);
          context.lineTo(sx - unit, sy - unit * .75);
          context.closePath(); context.stroke();
        } else {
          const image = this.favicons.get(node.url);
          if (image) {
            const size = radius * 1.5;
            context.drawImage(image, sx - size / 2, sy - size / 2, size, size);
          } else {
            context.fillStyle = colors.muted;
            context.beginPath(); context.arc(sx, sy, Math.max(2.5, radius * .38), 0, Math.PI * 2); context.fill();
          }
        }
        if (active || cursor || match) {
          context.strokeStyle = active || match ? colors.accent : colors.text;
          context.lineWidth = active || match ? 2.2 : 1.4;
          context.beginPath(); context.arc(sx, sy, radius + 4, 0, Math.PI * 2); context.stroke();
        }
      }
      context.globalAlpha = 1;
    }
    this.root.dataset.visibleNodeCount = String(visibleNodes);
    this.root.dataset.visibleEdgeCount = String(visibleEdges);
    this._drawLabels();
    this.renderCount++;
  }

  _drawLabels() {
    for (const label of this.labelPool) label.hidden = true;
    if (!this.model) return;
    const candidates = [];
    const ids = new Set();
    const add = id => { if (id && !ids.has(id)) { ids.add(id); const node = this.model.nodes.get(id); if (node) candidates.push(node); } };
    for (const id of [this.hoverId, this.selectedId, this.cursorId, this.focusedId]) add(id);
    for (const node of this.matches.slice(0, 12)) add(node.id);
    for (const node of this.model.order) if (node.folder && (node.depth <= 2 || this.viewport.scale > .8)) add(node.id);
    const placed = [];
    let index = 0;
    for (const node of candidates) {
      if (index === this.labelPool.length) break;
      if (!this._nodeShown(node)) continue;
      const x = node.x * this.viewport.scale + this.viewport.x;
      const y = node.y * this.viewport.scale + this.viewport.y + this._radius(node) + 7;
      const width = Math.min(190, Math.max(48, Array.from(title(node)).length * 9 + 10));
      if (x < 0 || x > this.width || y < 0 || y + 24 > this.height) continue;
      const left = clamp(x - width / 2, 3, Math.max(3, this.width - width - 3));
      if (placed.some(box => left < box.x + box.width + 5 && left + width + 5 > box.x && y < box.y + 27 && y + 27 > box.y)) continue;
      const label = this.labelPool[index++];
      label.dataset.nodeId = node.id;
      label.textContent = title(node);
      label.style.transform = `translate(${left}px, ${y}px)`;
      label.style.maxWidth = `${width}px`;
      label.classList.toggle('graph-node-label-detail', node.id === this.selectedId || node.id === this.hoverId || this.matchIds.has(node.id));
      label.hidden = false;
      placed.push({ x: left, y, width });
    }
  }

  _point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  _pick(point) {
    if (!this.model || this.failed) return null;
    let closest = null;
    let distance = Infinity;
    for (const node of this.model.order) {
      if (!this._nodeShown(node)) continue;
      const dx = node.x * this.viewport.scale + this.viewport.x - point.x;
      const dy = node.y * this.viewport.scale + this.viewport.y - point.y;
      const squared = dx * dx + dy * dy;
      if (squared <= (this._radius(node) + 9) ** 2 && squared < distance) { closest = node; distance = squared; }
    }
    return closest;
  }

  _pointerDown(event) {
    if (event.button !== 0 || this.failed || !this.model || this.root.dataset.state === 'loading') return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.transition = null;
    this._stopSettling();
    this.pendingFit = undefined;
    const point = this._point(event);
    this.pointers.set(event.pointerId, { ...point });
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Window blur/cancel also clears the gesture. */ }
    if (this.pointers.size === 1) {
      const node = this._pick(point);
      this.suppressDoubleClick = false;
      this.gesture = { kind: node ? 'node' : 'pan', id: node?.id, start: point, previous: point, moved: false, revision: this.revision, offsetX: node ? node.x - (point.x - this.viewport.x) / this.viewport.scale : 0, offsetY: node ? node.y - (point.y - this.viewport.y) / this.viewport.scale : 0 };
    } else this._beginPinch();
    this.hoverId = null;
    this._requestRender();
  }

  _beginPinch() {
    const points = [...this.pointers.values()];
    if (points.length < 2) return;
    const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    this.gesture = { kind: 'pinch', moved: true, revision: this.revision, center, distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)), viewport: { ...this.viewport } };
    this.suppressDoubleClick = true;
  }

  _pointerMove(event) {
    const point = this._point(event);
    if (!this.pointers.has(event.pointerId)) {
      if (!this.pointers.size && !event.buttons) {
        const id = this._pick(point)?.id || null;
        if (id !== this.hoverId) { this.hoverId = id; this.canvas.style.cursor = id ? 'pointer' : ''; this._requestRender(); }
      }
      return;
    }
    if (this.gesture?.revision !== this.revision) { this._cancelPointers(); return; }
    this.pointers.set(event.pointerId, point);
    const gesture = this.gesture;
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      const points = [...this.pointers.values()];
      if (points.length < 2) return;
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const scale = clamp(gesture.viewport.scale * distance / gesture.distance, .015, 5);
      const ratio = scale / gesture.viewport.scale;
      this.viewport = { scale, x: center.x - (gesture.center.x - gesture.viewport.x) * ratio, y: center.y - (gesture.center.y - gesture.viewport.y) * ratio };
    } else {
      if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 5) gesture.moved = true;
      if (!gesture.moved) return;
      this.suppressDoubleClick = true;
      if (gesture.kind === 'node') {
        const node = this.model.nodes.get(gesture.id);
        if (!node) { this._cancelPointers(); return; }
        node.x = (point.x - this.viewport.x) / this.viewport.scale + gesture.offsetX;
        node.y = (point.y - this.viewport.y) / this.viewport.scale + gesture.offsetY;
        node.vx = node.vy = 0;
      } else {
        this.viewport.x += point.x - gesture.previous.x;
        this.viewport.y += point.y - gesture.previous.y;
      }
      gesture.previous = point;
    }
    this.canvas.style.cursor = 'grabbing';
    this._requestRender();
  }

  _pointerUp(event) {
    if (!this.pointers.has(event.pointerId)) return;
    const gesture = this.gesture;
    const point = this._point(event);
    this.pointers.delete(event.pointerId);
    try { this.canvas.releasePointerCapture(event.pointerId); } catch { /* Already released by the platform. */ }
    if (this.pointers.size >= 2) this._beginPinch();
    else if (this.pointers.size === 1) {
      const previous = [...this.pointers.values()][0];
      this.gesture = { kind: 'pan', start: previous, previous, moved: true, revision: this.revision };
    } else {
      this.gesture = null;
      this.canvas.style.cursor = '';
      if (gesture && gesture.revision === this.revision && !gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <= 5) {
        const node = this._pick(point);
        if (node && node.id === gesture.id) {
          this.cursorId = node.id;
          this._requestSelect(node.id);
          this._updateButtons();
        }
      }
    }
    this._requestRender();
  }

  _cancelPointers() {
    const changed = this.hoverId !== null || this.pointers.size > 0 || !!this.gesture;
    const ids = [...this.pointers.keys()];
    this.pointers.clear();
    this.gesture = null;
    this.hoverId = null;
    if (this.canvas) {
      this.canvas.style.cursor = '';
      for (const id of ids) try { this.canvas.releasePointerCapture(id); } catch { /* Cancellation is idempotent. */ }
    }
    if (changed) this._requestRender();
  }

  _requestSelect(id) {
    if (!this.model?.nodes.has(id)) return;
    try {
      const result = this.callbacks.onSelect?.(id);
      if (result?.catch) result.catch(error => this._notify(error));
    } catch (error) { this._notify(error); }
  }

  _openFolder(id) {
    if (id == null) return;
    try {
      const result = this.callbacks.onOpenFolder?.(String(id));
      if (result?.catch) result.catch(error => this._notify(error));
    } catch (error) { this._notify(error); }
  }

  _notify(error) {
    try { this.callbacks.onError?.(error); }
    catch { /* Error presentation cannot break input/render cleanup. */ }
  }

  _showMessage(heading, copy, showAction) {
    this.message.hidden = false;
    this.messageTitle.textContent = heading;
    this.messageCopy.textContent = copy;
    this.fallbackButton.hidden = !showAction;
  }

  _fail(error) {
    this.failed = true;
    this._pause();
    this._stopSettling();
    this.root.dataset.state = 'unavailable';
    if (this.canvas) this.canvas.hidden = true;
    this.labels.hidden = true;
    this.help.hidden = true;
    this.results.hidden = false;
    this.results.open = true;
    this.status.textContent = '二维视图不可用；书签数据未被修改';
    this._showMessage('无法显示二维关系图', error.message || String(error), true);
    this._updateButtons();
    this._notify(error);
  }

  _updateButtons() {
    const disabled = !this.model?.nodes.size || !this.context || this.failed;
    for (const button of [this.zoomInButton, this.zoomOutButton, this.resetButton, this.leafButton, this.fullscreenButton]) if (button) button.disabled = !!disabled;
    this.focusButton.disabled = !!disabled || !this.model?.nodes.has(this.cursorId || this.selectedId);
  }

  _toggleFullscreen() {
    this.fullscreen = !this.fullscreen;
    const shell = document.getElementById('app-shell');
    shell?.classList.toggle('graph-fullscreen', this.fullscreen);
    const label = this.fullscreen ? '退出全屏视图' : '全屏沉浸视图';
    this.fullscreenButton.setAttribute('aria-pressed', String(this.fullscreen));
    this.fullscreenButton.setAttribute('aria-label', label);
    this.fullscreenButton.title = label;
    this.fullscreenButton.replaceChildren(icon(this.fullscreen ? 'minimize' : 'maximize'), element('span', '', label));
    this._resize();
  }

  _toggleLeaves() {
    this._cancelPointers();
    this.showLeaves = !this.showLeaves;
    this.leafButton.setAttribute('aria-pressed', String(this.showLeaves));
    if (!this.showLeaves && !this.model?.nodes.get(this.cursorId)?.folder) this.cursorId = this.model?.roots.find(id => this.model.nodes.get(id).folder) || null;
    this._updateButtons();
    this._updateStatus();
    this._requestRender();
  }

  setFilter(filter = 'all') {
    if (this.disposed) return;
    this.filter = filter;
    if (filter === 'directory' && this.showLeaves) {
      this.showLeaves = false;
      this.leafButton.setAttribute('aria-pressed', 'false');
    } else if (filter !== 'directory' && !this.showLeaves) {
      this.showLeaves = true;
      this.leafButton.setAttribute('aria-pressed', 'true');
    }
    this.search(this.query);
  }

  search(query) {
    if (this.disposed) return;
    this.query = String(query || '').trim();
    const needle = this.query.toLocaleLowerCase();
    this.matches = needle && this.model ? this.model.order.filter(node => {
      if (this.filter === 'directory' && !node.folder) return false;
      if (this.filter === 'file' && node.folder) return false;
      return `${node.title || node.name || ''}\n${node.url || ''}\n${node.note || ''}`.toLocaleLowerCase().includes(needle);
    }) : [];
    this.matchIds = new Set(this.matches.map(node => node.id));
    this.resultPage = 0;
    this._updateStatus();
    this._updateResults();
    if (needle && this.matches.length === 1 && !this.settling) {
      this.focusNode(this.matches[0].id);
    }
    this._requestRender();
  }

  _updateStatus() {
    if (!this.model) return;
    const folders = this.model.order.reduce((count, node) => count + (node.folder ? 1 : 0), 0);
    const leaves = this.model.nodes.size - folders;
    this.status.textContent = `${folders} 个文件夹 · ${leaves} 个书签${this.showLeaves ? '' : '（书签节点已隐藏，仍可搜索）'}${this.query ? ` · ${this.matches.length} 个搜索结果` : ''}${this.failed ? ' · Canvas 2D 不可用' : ''}`;
  }

  _updateResults() {
    this.resultList.replaceChildren();
    const all = this.query ? this.matches : this.model?.order || [];
    const pageSize = 30;
    const pages = Math.ceil(all.length / pageSize);
    this.resultPage = Math.max(0, Math.min(this.resultPage, pages - 1));
    this.resultSummary.textContent = this.query ? `搜索结果（${all.length}）` : `节点列表（${all.length}）`;
    this.resultHeading.textContent = this.query ? '标题、网址和备注的本地搜索结果' : '按原有层级顺序浏览；选择查看详情，聚焦查看位置。';
    const fragment = document.createDocumentFragment();
    const start = this.resultPage * pageSize;
    for (const node of all.slice(start, start + pageSize)) {
      const row = element('li', 'graph-result');
      const choose = element('button', 'graph-result-select');
      choose.type = 'button';
      choose.dataset.nodeId = node.id;
      choose.setAttribute('aria-label', `选择${node.folder ? '文件夹' : '书签'}：${title(node)}`);
      choose.setAttribute('aria-pressed', String(node.id === this.selectedId));
      choose.append(node.folder ? icon('folder') : faviconElement(node.url, { size: 18 }));
      const copy = element('span', 'graph-result-copy');
      copy.append(element('span', 'graph-result-title', title(node)), element('span', 'graph-result-path', node.path || node.url || ''));
      choose.append(copy);
      choose.addEventListener('click', () => {
        if (this.disposed || !this.model?.nodes.has(node.id)) return;
        this.cursorId = node.id;
        this._requestSelect(node.id);
        this._updateButtons();
        this._requestRender();
      });
      const focus = element('button', 'graph-result-focus');
      focus.type = 'button';
      focus.title = `聚焦：${title(node)}`;
      focus.setAttribute('aria-label', focus.title);
      focus.append(icon('focus'));
      focus.disabled = !!this.failed;
      focus.addEventListener('click', () => { this.focusNode(node.id); this.focusCanvas(); });
      row.append(choose, focus);
      fragment.append(row);
    }
    if (!all.length) fragment.append(element('li', 'graph-no-results', this.query ? '没有匹配的节点。试试标题、网址或备注中的其他文字。' : '还没有可浏览的节点。'));
    this.resultList.append(fragment);
    this.resultPager.hidden = pages <= 1;
    this.prevButton.disabled = this.resultPage === 0;
    this.nextButton.disabled = this.resultPage + 1 >= pages;
    this.pageText.textContent = `${this.resultPage + 1} / ${Math.max(1, pages)}`;
    this.resultList.scrollTop = 0;
  }

  select(id) {
    if (this.disposed) return;
    const value = id == null ? null : String(id);
    this.selectedId = this.model?.nodes.has(value) ? value : null;
    if (this.selectedId) this.cursorId = this.selectedId;
    this.root.dataset.selectedId = this.selectedId || '';
    this._updateCurrent();
    for (const button of this.resultList.querySelectorAll('.graph-result-select')) button.setAttribute('aria-pressed', String(button.dataset.nodeId === this.selectedId));
    this._updateButtons();
    this._requestRender();
  }

  _updateCurrent() {
    const node = this.model?.nodes.get(this.selectedId);
    this.current.hidden = !node;
    this.currentKind.textContent = node ? node.folder ? '文件夹' : '书签' : '实际的父子关系';
    this.currentTitle.textContent = node ? title(node) : '选择一个节点查看详情';
    this.currentTitle.title = node?.path || '';
    this.openFolderButton.hidden = !node?.folder;
    const url = node && !node.folder ? safeURL(node.url) : null;
    this.openLink.hidden = !url;
    if (url) this.openLink.href = url;
    else this.openLink.removeAttribute('href');
    if (node && !node.folder && !url) this.currentKind.textContent = '书签 · 此协议请在 Chrome 书签中打开';
  }

  _key(event) {
    if (!this.model || event.altKey || event.ctrlKey || event.metaKey) return;
    const node = this.model.nodes.get(this.cursorId || this.selectedId) || this.model.nodes.get(this.model.roots[0]);
    if (!node) return;
    const siblings = this.model.nodes.get(node.parentId)?.children || this.model.roots;
    const shown = siblings.filter(id => this._nodeShown(this.model.nodes.get(id)));
    const index = shown.indexOf(node.id);
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = this.model.nodes.get(node.parentId); break;
      case 'ArrowRight': next = node.children.map(id => this.model.nodes.get(id)).find(child => this._nodeShown(child)); break;
      case 'ArrowUp': next = this.model.nodes.get(shown[Math.max(0, index - 1)]); break;
      case 'ArrowDown': next = this.model.nodes.get(shown[Math.min(shown.length - 1, index + 1)]); break;
      case 'Enter': this._requestSelect(node.id); break;
      case 'f': case 'F': this.focusNode(node.id); break;
      case 'Home': this.reset(); break;
      case '+': case '=': this._zoom(1.28); break;
      case '-': this._zoom(1 / 1.28); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next) {
      this.cursorId = next.id;
      this.status.textContent = `${next.folder ? '文件夹' : '书签'}：${title(next)}。Enter 查看详情，F 聚焦。`;
      const sx = next.x * this.viewport.scale + this.viewport.x;
      const sy = next.y * this.viewport.scale + this.viewport.y;
      if (sx < 35 || sy < 35 || sx > this.width - 35 || sy > this.height - 35) {
        this.transition = null;
        this.viewport.x = this.width / 2 - next.x * this.viewport.scale;
        this.viewport.y = this.height / 2 - next.y * this.viewport.scale;
      }
      this._updateButtons();
      this._requestRender();
    }
  }

  focusNode(id) {
    if (this.disposed || id == null || this.failed) return;
    const node = this.model?.nodes.get(String(id));
    if (!node) return;
    this._cancelPointers();
    if (!node.folder && !this.showLeaves) this._toggleLeaves();
    this.cursorId = this.focusedId = node.id;
    this.root.dataset.focusedId = node.id;
    this._updateButtons();
    if (this.settling) this.pendingFit = node.id;
    else this._fit(node, !this.reducedMotion);
  }

  focusCanvas() {
    if (this.disposed) return;
    if (this.canvas && !this.failed) this.canvas.focus({ preventScroll: true });
    else this.fallbackButton.focus({ preventScroll: true });
  }

  reset() {
    if (this.disposed) return;
    this._cancelPointers();
    this.focusedId = null;
    this.root.dataset.focusedId = '';
    if (this.settling) this.pendingFit = null;
    else this._fit(null, false);
    this._updateButtons();
  }

  _fit(node, animate) {
    if (!this.model?.nodes.size || !this.context || this.failed) return;
    if (!this._visible() || !this.width || !this.height) { this.pendingFit = node?.id || null; return; }
    const ids = node ? [node.id] : this.model.roots.slice();
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    while (ids.length) {
      const current = this.model.nodes.get(ids.pop());
      if (this._nodeShown(current)) {
        const padding = current.radius + 28;
        minX = Math.min(minX, current.x - padding); minY = Math.min(minY, current.y - padding);
        maxX = Math.max(maxX, current.x + padding); maxY = Math.max(maxY, current.y + padding);
      }
      for (const id of current.children) ids.push(id);
    }
    if (!Number.isFinite(minX)) return;
    const scale = clamp(Math.min((this.width - 48) / Math.max(100, maxX - minX), (this.height - 64) / Math.max(100, maxY - minY)), .015, node ? 2 : 1.4);
    const to = { scale, x: this.width / 2 - (minX + maxX) / 2 * scale, y: this.height / 2 - (minY + maxY) / 2 * scale };
    if (animate) this.transition = { from: { ...this.viewport }, to, start: performance.now() };
    else { this.transition = null; this.viewport = to; }
    this._requestRender();
  }

  _zoom(factor, point = { x: this.width / 2, y: this.height / 2 }) {
    if (!this.context || this.failed || !this.width) return;
    this.transition = null;
    this.pendingFit = undefined;
    const scale = clamp(this.viewport.scale * factor, .015, 5);
    const ratio = scale / this.viewport.scale;
    this.viewport = { scale, x: point.x - (point.x - this.viewport.x) * ratio, y: point.y - (point.y - this.viewport.y) * ratio };
    this._requestRender();
  }

  /** Runtime facts only: all XY values are the actual draw/picking coordinates. */
  get diagnostics() {
    return {
      renderer: 'canvas-2d', available: !!this.context && !this.failed,
      nodes: this.model?.nodes.size || 0, edges: this.model?.edges.length || 0,
      visibleNodes: Number(this.root.dataset.visibleNodeCount || 0),
      visibleEdges: Number(this.root.dataset.visibleEdgeCount || 0),
      treeRequests: this.model?.requests || 0, selectedId: this.selectedId,
      cursorId: this.cursorId, focusedId: this.focusedId, matches: this.matches.length,
      reducedMotion: this.reducedMotion, visible: this._visible(),
      animationPending: !!this.frame, transitioning: !!this.transition,
      renderedFrames: this.renderCount, viewport: { ...this.viewport },
      settling: !!this.settling, settleTicks: this.settleTicks, settleLimit: 140,
      width: this.width || 0, height: this.height || 0, pixelRatio: this.ratio || 1,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.getElementById('app-shell')?.classList.remove('graph-fullscreen');
    this.revision++;
    this._pause();
    this._stopSettling();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.mutationObserver?.disconnect();
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.favicons.dispose();
    this.root.remove();
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.context = this.model = null;
    this.matches = [];
    this.matchIds.clear();
    this.callbacks = {};
  }
}

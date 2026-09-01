/**
 * Stub DOM minimal pour les tests Node (Lot 1).
 *
 * Il ne remplace pas un navigateur : il implemente uniquement les APIs
 * utilisees par les modules testes (getElementById, querySelector(All),
 * classList, dataset, addEventListener/dispatchEvent, replaceChildren).
 *
 * Aucune donnee reelle n'est utilisee : uniquement des fixtures synthetiques.
 */

export class StubClassList {
  constructor(initial = []) {
    this._set = new Set(initial);
  }
  add(...names) { names.forEach((n) => this._set.add(n)); }
  remove(...names) { names.forEach((n) => this._set.delete(n)); }
  contains(name) { return this._set.has(name); }
  toString() { return Array.from(this._set).join(' '); }
}

export class StubElement {
  constructor(tagName = 'div', props = {}) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.classList = new StubClassList(props.classes || []);
    this.listeners = new Map();
    this.hidden = false;
    this.checked = props.checked ?? false;
    this.value = props.value ?? '';
    this.type = props.type ?? '';
    this.id = props.id ?? '';
    this.textContent = '';
    this.className = '';
    this.removed = false;
    this.open = false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  /** Nombre d'ecouteurs enregistres : sert a prouver l'idempotence. */
  listenerCount(type) { return (this.listeners.get(type) || []).length; }

  dispatchEvent(event) {
    const type = event && event.type;
    (this.listeners.get(type) || []).slice().forEach((handler) => {
      handler({ ...event, target: event.target || this, preventDefault() {} });
    });
    return true;
  }

  replaceChildren(...nodes) { this.children = nodes; }
  remove() { this.removed = true; }
}

export class StubDocument {
  constructor() {
    this.byId = new Map();
    this.bySelector = new Map();
    this.listeners = new Map();
    this.visibilityState = 'visible';
    this.body = new StubElement('body');
    this.dispatched = [];
  }

  register(element, selectors = []) {
    if (element.id) this.byId.set(element.id, element);
    selectors.forEach((selector) => {
      if (!this.bySelector.has(selector)) this.bySelector.set(selector, []);
      this.bySelector.get(selector).push(element);
    });
    return element;
  }

  createElement(tagName) { return new StubElement(tagName); }
  createTextNode(text) { return { nodeType: 3, textContent: text }; }

  getElementById(id) { return this.byId.get(id) || null; }

  querySelectorAll(selector) {
    return (this.bySelector.get(selector) || []).filter((el) => !el.removed);
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  listenerCount(type) { return (this.listeners.get(type) || []).length; }

  dispatchEvent(event) {
    this.dispatched.push(event && event.type);
    (this.listeners.get(event && event.type) || []).slice().forEach((h) => h(event));
    return true;
  }
}

export class StubWindow {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }
  listenerCount(type) { return (this.listeners.get(type) || []).length; }
  emit(type, event = {}) {
    (this.listeners.get(type) || []).slice().forEach((h) => h({ type, ...event }));
  }
}

/** localStorage synthetique. */
export class StubStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

/** Minuteurs deterministes : aucun temps reel n'est attendu par les tests. */
export class FakeTimers {
  constructor(start = 0) {
    this.now = start;
    this.nextId = 1;
    this.timeouts = new Map();
    this.intervals = new Map();
  }

  get clock() { return () => this.now; }

  get api() {
    return {
      setTimeout: (fn, delay) => {
        const id = this.nextId++;
        this.timeouts.set(id, { fn, at: this.now + delay });
        return id;
      },
      clearTimeout: (id) => { this.timeouts.delete(id); },
      setInterval: (fn, delay) => {
        const id = this.nextId++;
        this.intervals.set(id, { fn, delay, at: this.now + delay });
        return id;
      },
      clearInterval: (id) => { this.intervals.delete(id); }
    };
  }

  get pendingTimeouts() { return this.timeouts.size; }
  get pendingIntervals() { return this.intervals.size; }

  advance(ms) {
    const target = this.now + ms;
    let guard = 0;
    for (;;) {
      if (guard++ > 10000) throw new Error('Boucle de minuteur non bornee.');
      const due = [...this.timeouts.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at);
      const dueInterval = [...this.intervals.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at);

      if (!due.length && !dueInterval.length) break;

      if (due.length && (!dueInterval.length || due[0][1].at <= dueInterval[0][1].at)) {
        const [id, entry] = due[0];
        this.now = entry.at;
        this.timeouts.delete(id);
        entry.fn();
      } else {
        const [, entry] = dueInterval[0];
        this.now = entry.at;
        entry.at = this.now + entry.delay;
        entry.fn();
      }
    }
    this.now = target;
  }
}

export default { StubElement, StubDocument, StubWindow, StubStorage, FakeTimers, StubClassList };

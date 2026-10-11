import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./light-rope-connected-bodies.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

class Element {
  constructor(id = '') {
    this.id = id; this.value = ''; this.textContent = ''; this.disabled = false; this.dataset = {};
    this.attributes = {}; this.listeners = {}; this.width = 0; this.height = 0;
    this.classList = { add() {}, remove() {}, contains() { return false; } };
    this.context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => (target[key] = value, true) });
  }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name, event = {}) { for (const fn of this.listeners[name] || []) fn({ target: this, preventDefault() {}, ...event }); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() {
    const width = this.id === 'vt' || this.id === 'xt' ? 430 : 880;
    const aspect = this.id === 'scene' ? 2.2 : this.id === 'forces' ? 3.82 : 20 / 9;
    return { width, height: width / aspect };
  }
  get clientWidth() { return this.getBoundingClientRect().width; }
  get clientHeight() { return this.getBoundingClientRect().height; }
  getContext() { return this.context; }
  blur() {}
}

const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const elements = new Map(ids.map(id => [id, new Element(id)]));
const views = ['system', 'A', 'B'].map(value => { const el = new Element(); el.dataset.view = value; return el; });
const rafs = new Map(); let nextRaf = 1;
const document = {
  getElementById: id => elements.get(id),
  querySelectorAll: selector => selector === '[data-view]' ? views : [],
  addEventListener() {}
};
const sandbox = {
  document, console, Math, Number, Object, String, Set, Map,
  window: null,
  addEventListener() {},
  devicePixelRatio: 1,
  ResizeObserver: class { observe() {} },
  requestAnimationFrame: fn => { const id = nextRaf++; rafs.set(id, fn); return id; },
  cancelAnimationFrame: id => rafs.delete(id)
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(scripts[0], sandbox);
vm.runInContext(scripts[1], sandbox);

const get = id => elements.get(id);
assert.equal(get('dAcc').textContent, '2.00 m/s²');
assert.equal(get('dTension').textContent, '6.00 N');

get('play').dispatch('click');
assert.equal(get('massARange').disabled, true, 'parameters lock during playback');
const firstFrame = rafs.entries().next().value;
rafs.delete(firstFrame[0]); firstFrame[1](100);
const secondFrame = rafs.entries().next().value;
rafs.delete(secondFrame[0]); secondFrame[1](600);
assert.equal(get('dTime').textContent, '0.05 s', 'animation clock advances with the per-frame timestep capped');
assert.equal(get('dVa').textContent, get('dVb').textContent, 'connected bodies share the same speed');

get('pause').dispatch('click');
assert.equal(get('massARange').disabled, false, 'parameters unlock after pausing');
assert.equal(get('play').textContent, '▶ 继续', 'the play control offers resume while paused');
get('forceRange').value = '0'; get('forceRange').dispatch('input');
assert.equal(get('dTime').textContent, '0.00 s', 'changing a parameter resets the simulation');
assert.equal(get('dAcc').textContent, '0.00 m/s²');
assert.equal(get('dTension').textContent, '0.00 N');

get('step').dispatch('click');
assert.equal(get('dTime').textContent, '0.10 s', 'single-step advances time');
get('timeline').value = '8'; get('timeline').dispatch('input');
assert.equal(get('status').textContent, '演示结束', 'seeking to the duration reports the end state');
views[0].dispatch('click');
assert.equal(get('forces').attributes['aria-label'], '整体A+B的受力图：外力F向右，绳张力为内力并抵消');

console.log('light-rope UI state and interaction checks passed (simulated DOM/canvas)');

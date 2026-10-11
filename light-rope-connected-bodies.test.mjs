import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./light-rope-connected-bodies.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.equal(scripts.length, 2, 'page should contain the isolated physics model and UI script');
for (const source of scripts) new vm.Script(source);

const context = {};
vm.runInNewContext(scripts[0], context);
const physics = context.ROPE_PHYSICS;
assert.equal(physics.DURATION, 8);

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: expected ${expected}, got ${actual}`);
}

const defaults = { mA: 2, mB: 3, F: 10 };
const defaultForces = physics.derive(defaults);
close(defaultForces.a, 2, 'default acceleration');
close(defaultForces.T, 6, 'default tension');
close(defaultForces.netA, 4, 'default A net force');
close(defaults.F, (defaults.mA + defaults.mB) * defaultForces.a, 'whole-system equation');
close(defaultForces.T, defaults.mB * defaultForces.a, 'isolated B equation');
close(defaultForces.netA, defaults.mA * defaultForces.a, 'isolated A equation');

const ordinary = physics.derive({ mA: 2, mB: 1, F: 3 });
close(ordinary.a, 1, 'ordinary acceleration');
close(ordinary.T, 1, 'ordinary tension');

const heavierA = physics.derive({ mA: 4, mB: 3, F: 10 });
assert.ok(heavierA.a < defaultForces.a, 'increasing A mass lowers the system acceleration');
assert.ok(heavierA.T < defaultForces.T, 'increasing A mass lowers the rope tension');
const heavierB = physics.derive({ mA: 2, mB: 6, F: 10 });
assert.ok(heavierB.a < defaultForces.a, 'increasing B mass lowers the system acceleration');
assert.ok(heavierB.T > defaultForces.T && heavierB.T < 10, 'increasing B mass raises tension but keeps it below F');

const extreme = physics.derive({ mA: .1, mB: 10, F: 10.1 });
close(extreme.a, 1, 'extreme-ratio acceleration');
close(extreme.T, 10, 'extreme-ratio tension');
assert.ok(extreme.T < 10.1, 'tension must remain below the applied force');

const noForce = { mA: 2, mB: 3, F: 0 };
const still = physics.stateAt(4, noForce);
close(still.a, 0, 'zero-force acceleration');
close(still.T, 0, 'zero-force tension');
close(still.vA, 0, 'zero-force speed');
close(still.sB, 0, 'zero-force displacement');

for (const p of [defaults, { mA: .1, mB: 10, F: 40 }, { mA: .1, mB: .1, F: 40 }, { mA: 10, mB: .1, F: 0 }, { mA: 4.5, mB: 7.2, F: 18.3 }]) {
  for (const time of [0, .37, 2.5, 8, 20]) {
    const s = physics.stateAt(time, p);
    const d = physics.derive(p);
    close(s.vA, s.vB, 'equal velocities');
    close(s.sA, s.sB, 'equal displacements');
    close(s.xA - s.xB, 3, 'constant rope length');
    close(s.vA, d.a * s.t, 'velocity-time relation');
    close(s.sB, .5 * d.a * s.t ** 2, 'displacement-time relation');
    assert.ok(s.t >= 0 && s.t <= physics.DURATION, 'time is clamped to the simulation duration');
  }
}

console.log('light-rope physics and script syntax checks passed');

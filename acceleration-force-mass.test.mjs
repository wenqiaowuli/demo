import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./acceleration-force-mass.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.equal(scripts.length, 2, 'page should separate the physics model from the UI');
for (const source of scripts) new vm.Script(source);

const modelSource = html.match(/<script id="acceleration-physics">([\s\S]*?)<\/script>/i)?.[1];
assert.ok(modelSource, 'physics model script should be present');
const context = {};
vm.runInNewContext(modelSource, context);
const physics = context.ACCELERATION_PHYSICS;

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: expected ${expected}, got ${actual}`);
}

close(physics.derive({ m: 2, F: 4 }).a, 2, 'default acceleration');
close(physics.derive({ m: .5, F: 20 }).a, 40, 'maximum acceleration');
close(physics.derive({ m: 10, F: 0 }).a, 0, 'zero-force acceleration');

const forceTrials = physics.trials('force', { m: 2, F: 4 });
assert.deepEqual(Array.from(forceTrials, row => row.F), [0, 4, 8, 12, 16, 20]);
assert.deepEqual(Array.from(forceTrials, row => row.a), [0, 2, 4, 6, 8, 10]);
for (const row of forceTrials.slice(1)) close(row.a / row.F, .5, 'a/F remains 1/m');

const massTrials = physics.trials('mass', { m: 2, F: 4 }, 'mass');
assert.deepEqual(Array.from(massTrials, row => row.m), [.5, 1, 2, 4, 8, 10]);
assert.deepEqual(Array.from(massTrials, row => row.a), [8, 4, 2, 1, .5, .4]);
for (const row of massTrials) close(row.a * row.m, 4, 'a*m remains F');

const inverseTrials = physics.trials('mass', { m: 2, F: 4 }, 'inverse');
for (const row of inverseTrials) close(row.a / row.x, 4, 'a versus 1/m is linear with slope F');
assert.ok(inverseTrials.every((row, i) => i === 0 || row.x > inverseTrials[i - 1].x), 'inverse-mass graph samples are sorted by x');
assert.ok(physics.trials('mass', { m: 2, F: 0 }, 'mass').every(row => row.a === 0), 'F=0 produces a zero line for all masses');

const state = physics.stateAt(2, { m: 2, F: 4 });
close(state.v, 4, 'v=at');
close(state.s, 4, 's=0.5at^2');
close(physics.stateAt(100, { m: 2, F: 4 }).t, physics.DURATION, 'time clamps at the end');

console.log('acceleration-force-mass physics and script syntax checks passed');

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, budgetPerMinute, delayMs, backoffMs, nextLevel, openCircuit, reduceOutcome } from '../src/core/pacing.js';

// Ajusta los nombres a tu implementación si difieren.
const fixed = (value) => () => value;
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };

test('el presupuesto crece con el nivel y es monótono', () => {
  assert.ok(budgetPerMinute('A0') < budgetPerMinute('A1'));
  assert.ok(budgetPerMinute('A1') < budgetPerMinute('A2'));
});

test('las esperas llevan jitter: no son un valor fijo', () => {
  assert.notEqual(delayMs('A0', fixed(0)), delayMs('A0', fixed(1)));
});

test('la misma semilla produce la misma espera', () => {
  assert.equal(delayMs('A1', fixed(0.42)), delayMs('A1', fixed(0.42)));
});

test('las esperas no caen por debajo del suelo del nivel', () => {
  for (const level of Object.keys(LEVELS)) {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      assert.ok(delayMs(level, fixed(r)) > 0);
    }
  }
});

test('secuencia consecutiva sin ciclo periódico exacto', () => {
  const rng = seq([0.11, 0.87, 0.33, 0.62, 0.05, 0.99]);
  const delays = Array.from({ length: 6 }, () => delayMs('A1', rng));
  assert.notEqual(delays[0], delays[1]);
  assert.notEqual(delays[1], delays[2]);
  assert.equal(new Set(delays).size, delays.length);
});

test('el backoff crece exponencialmente y respeta el tope', () => {
  const a = backoffMs(1, fixed(0.5));
  const b = backoffMs(2, fixed(0.5));
  const c = backoffMs(3, fixed(0.5));
  assert.ok(b > a && c > b);
  assert.ok(backoffMs(20, fixed(0.5)) <= LEVELS.backoffCapMs);
});

test('el backoff también lleva jitter', () => {
  assert.notEqual(backoffMs(3, fixed(0)), backoffMs(3, fixed(1)));
});

test('el disyuntor abre tras N fallos consecutivos', () => {
  const threshold = LEVELS.circuitFailures;
  assert.equal(openCircuit(threshold - 1), false);
  assert.equal(openCircuit(threshold), true);
});

test('el disyuntor de un dominio no altera a los demás', () => {
  const state = { domains: { 'a.example': { failures: 5 }, 'b.example': { failures: 0 } } };
  const after = reduceOutcome(state, { host: 'a.example', status: 500 });
  assert.equal(after.domains['b.example'].failures, 0);
});

test('un 429 degrada a A0 y marca throttled', () => {
  const after = reduceOutcome({ level: 'A2', cleanSessions: 9, throttled: false }, { host: 'x', status: 429 });
  assert.equal(after.level, 'A0');
  assert.equal(after.throttled, true);
  assert.equal(after.cleanSessions, 0);
});

test('403 degrada igual que 429', () => {
  const after = reduceOutcome({ level: 'A1', cleanSessions: 4, throttled: false }, { host: 'x', status: 403 });
  assert.equal(after.level, 'A0');
});

test('5xx no degrada el nivel', () => {
  const after = reduceOutcome({ level: 'A1', cleanSessions: 2, throttled: false }, { host: 'x', status: 503 });
  assert.equal(after.level, 'A1');
});

test('el ascenso exige sesiones limpias acumuladas', () => {
  assert.equal(nextLevel({ level: 'A0', cleanSessions: 2 }), 'A0');
  assert.equal(nextLevel({ level: 'A0', cleanSessions: 3 }), 'A1');
  assert.equal(nextLevel({ level: 'A1', cleanSessions: 3 }), 'A2');
  assert.equal(nextLevel({ level: 'A2', cleanSessions: 9 }), 'A2');
});

test('una sesión limpia incrementa el contador; un 429 lo reinicia', () => {
  const clean = reduceOutcome({ level: 'A0', cleanSessions: 1, throttled: false }, { host: 'x', status: 200 });
  assert.equal(clean.cleanSessions, 2);
  const dirty = reduceOutcome(clean, { host: 'x', status: 429 });
  assert.equal(dirty.cleanSessions, 0);
});
// Run with Node.js: node --test tests/math.test.cjs
// Tests the engine shipped in index.html; no copied implementation or dependencies.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const engine = script.slice(0, script.indexOf("/* Application state"));
const moduleUnderTest = { exports: {} };
new Function("module", engine)(moduleUnderTest);
const M = moduleUnderTest.exports;
const history = M.normalize(
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../melate_retro_results.json"),
      "utf8",
    ),
  ),
);
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
const uniform = M.prediction(M.createModel(), "uniform");

test("all ordered-position distributions and valid conditional distributions sum to one", () => {
  assert.equal(M.TOTAL, 3262623);
  for (let p = 1; p <= 6; p++) {
    close(M.sum(M.U.map((n) => M.orderProbability(p, n))), 1);
    close(M.sum(M.U.map((n) => n * M.orderProbability(p, n))), (p * 40) / 7);
    for (let last = p - 1; last <= 39 - (7 - p); last++) {
      close(
        M.sum(M.U.map((n) => M.conditionalOrderProbability(p, n, last))),
        1,
      );
    }
  }
  close(Math.exp(M.logProbability(uniform, [1, 2, 3, 4, 5, 6])), 1 / M.TOTAL);
});

test("exact set laws normalize at every membership size, including zero and 39", () => {
  for (let size = 0; size <= 39; size++)
    for (const theta of [-Math.log(2), 0, Math.log(2)]) {
      const law = M.law(M.U.slice(0, size), theta);
      close(M.sum(law.pmf), 1);
      close(M.sum(law.marginals), 6);
      assert.ok(
        law.marginals.every((p) => Number.isFinite(p) && p >= 0 && p <= 1),
      );
      if (theta === 0) for (const p of law.marginals) close(p, 6 / 39);
    }
});

test("seeded sampling matches analytic membership counts and individual inclusion probabilities", () => {
  for (const theta of [0, Math.log(2), -Math.log(2)]) {
    const law = M.law(M.U.slice(0, 12), theta),
      pred = { components: [{ ...law, weight: 1 }] };
    const rng = M.seedRng(942),
      counts = Array(7).fill(0),
      frequencies = Array(39).fill(0),
      n = 30000;
    for (let i = 0; i < n; i++) {
      const ticket = M.sample(pred, rng);
      assert.ok(M.validTicket(ticket));
      counts[ticket.filter((x) => x <= 12).length]++;
      ticket.forEach((x) => frequencies[x - 1]++);
    }
    counts.forEach((c, j) =>
      close(
        c / n,
        law.pmf[j],
        6 * Math.sqrt((law.pmf[j] * (1 - law.pmf[j])) / n) + 1 / n,
      ),
    );
    frequencies.forEach((c, j) => close(c / n, law.marginals[j], 0.013));
  }
});

test("socios respect boundaries and exclude exact repeats; virgin windows use past draws", () => {
  assert.deepEqual(
    [...M.partners([1, 2, 12, 20, 38, 39])].sort((a, b) => a - b),
    [3, 11, 13, 19, 21, 37],
  );
  const f = M.features(history.slice(0, 10), 6);
  const seen = new Set(history.slice(4, 10).flatMap((d) => d.nums));
  assert.deepEqual(
    [...f.virgenes],
    M.U.filter((n) => !seen.has(n)),
  );
  close(M.setStats(new Set([1, 2, 3]), [1, 4, 5, 6, 7, 8]).expected, 18 / 39);
});

test("Markov divides by successor draws and respects the requested window and missing IDs", () => {
  const h = [
    { id: 1, nums: [1, 2, 3, 4, 5, 6] },
    { id: 2, nums: [1, 7, 8, 9, 10, 11] },
    { id: 3, nums: [7, 12, 13, 14, 15, 16] },
    { id: 5, nums: [1, 2, 3, 4, 5, 6] },
  ];
  const r = M.createMarkov(h);
  assert.equal(r.pairs, 2);
  assert.equal(r.rows[0].observations, 2);
  assert.equal(r.rows[0].successors.find((s) => s.num === 7).frequency, 1);
  close(M.sum(r.rows[0].successors.map((s) => s.smoothed)), 6);
  assert.equal(M.createMarkov(h, 2).pairs, 0);
  assert.equal(M.createMarkov(history).draws, 200);
  assert.equal(M.createMarkov(history).pairs, 199);
});

test("predictions are immutable snapshots and identical for identical prefixes", () => {
  const a = M.createModel(),
    b = M.createModel();
  for (const draw of history.slice(0, 120)) {
    M.observe(a, draw);
    M.observe(b, draw);
  }
  const before = M.prediction(a),
    copy = JSON.stringify(before.marginals);
  const rng = M.seedRng(11);
  M.observe(a, { id: 121, nums: M.sample(uniform, rng) });
  M.observe(b, { id: 121, nums: M.sample(uniform, rng) });
  assert.equal(JSON.stringify(before.marginals), copy);
  const c = M.createModel();
  for (const draw of history.slice(0, 120)) M.observe(c, draw);
  assert.deepEqual(M.prediction(c).marginals, before.marginals);
  close(M.sum(a.weights), 1);
  close(M.sum(M.prediction(a).marginals), 6);
});

test("missing draw IDs reset history, mixture and detectors before prediction", () => {
  const model = M.createModel();
  for (const draw of history.slice(0, 80)) M.observe(model, draw);
  assert.equal(M.resetForGap(model, 82), true);
  assert.equal(model.history.length, 0);
  assert.deepEqual(model.weights, M.prior);
  assert.equal(M.detectorSummary(model.detectors.socios), null);
  M.observe(model, { id: 82, nums: [1, 2, 3, 4, 5, 6] });
  assert.equal(model.history.length, 1);
});

test("detector remains normalized without imposing a ten-draw maximum duration", () => {
  const d = M.createDetector();
  for (let i = 0; i < 180; i++) M.updateDetector(d, Math.sin(i * 1.37));
  close(M.sum(d.states.map((s) => s.p)), 1);
  assert.ok(d.states.some((s) => s.r > 10));
  const old = M.detectorSummary(d);
  M.updateDetector(d, 12);
  const changed = M.detectorSummary(d);
  assert.ok(changed.change > old.change);
  assert.ok(changed.change >= 0 && changed.change <= 1);
  assert.ok(changed.low <= changed.median && changed.median <= changed.high);
});

test("bit masks match set intersections at the 32-bit boundary", () => {
  const tickets = [
    [1, 2, 31, 32, 33, 39],
    [1, 3, 30, 32, 34, 39],
    [2, 4, 5, 6, 7, 8],
  ];
  for (const a of tickets)
    for (const b of tickets)
      assert.equal(M.bitHits(M.bits(a), M.bits(b)), M.matches(a, b));
});

test("coverage portfolios preserve the requested budget and never repeat numbers or tickets", () => {
  for (const target of [3, 4])
    for (const n of [1, 3, 10]) {
      const tickets = M.optimizePortfolio(
        uniform,
        n,
        target,
        M.seedRng(n),
        256,
        64,
      );
      assert.equal(tickets.length, n);
      assert.ok(tickets.every(M.validTicket));
      assert.equal(new Set(tickets.map(M.key)).size, n);
    }
});

test("normalization rejects corrupt batches and accepts official CSV and corrections", () => {
  const base = {
    id: 1,
    date: "2026-01-01",
    nums: [1, 2, 3, 4, 5, 6],
    adicional: 7,
  };
  assert.deepEqual(M.normalize([base, base]), M.normalize([base]));
  for (const bad of [
    { nums: [1, 1, 3, 4, 5, 6] },
    { nums: [1, 2, 3, 4, 5, 40] },
    { date: "2026-02-30" },
    { adicional: 1 },
    { bolsa: -1 },
  ])
    assert.throws(() => M.normalize([{ ...base, ...bad }]));
  assert.throws(() => M.normalize([base, { ...base, adicional: 8 }]));
  assert.throws(() =>
    M.normalize([base, { ...base, id: 2, date: "2025-01-01" }]),
  );
  const csv =
    'NPRODUCTO,CONCURSO,F1,F2,F3,F4,F5,F6,F7,BOLSA,FECHA\r\n30,1,1,2,3,4,5,6,7,"5500000","01/01/2026"';
  assert.equal(M.parseData(csv)[0].date, "2026-01-01");
  assert.equal(M.parseData(csv)[0].adicional, 7);
  assert.equal(M.parseData("1,2026-01-01,1,2,3,4,5,6")[0].adicional, null);
  assert.notEqual(
    M.fingerprint(M.normalize([base])),
    M.fingerprint(M.normalize([{ ...base, adicional: 8 }])),
  );
});

test("prize categories distinguish the additional number and missing information", () => {
  const d = { nums: [1, 2, 3, 4, 5, 6], adicional: 7 };
  const cases = [
    [[1, 2, 3, 4, 5, 6], 1],
    [[1, 2, 3, 4, 5, 7], 2],
    [[1, 2, 3, 4, 5, 8], 3],
    [[1, 2, 3, 4, 8, 9], 4],
    [[1, 2, 3, 8, 9, 10], 5],
    [[1, 2, 7, 8, 9, 10], 6],
    [[1, 7, 8, 9, 10, 11], 7],
    [[1, 8, 9, 10, 11, 12], 0],
  ];
  for (const [ticket, tier] of cases)
    assert.equal(M.classify(ticket, d).tier, tier);
  assert.equal(M.classify([1, 2, 3, 4, 5, 8], { nums: d.nums }).tier, null);
});

test("the two user-selected historical blocks reproduce the audited counts", () => {
  const socios = history.filter((d) => d.id >= 1601 && d.id <= 1617);
  assert.equal(socios.length, 17);
  let hits = 0,
    expected = 0;
  for (let i = 1; i < socios.length; i++) {
    const s = M.setStats(M.partners(socios[i - 1].nums), socios[i].nums);
    hits += s.hits;
    expected += s.expected;
  }
  assert.equal(hits, 28);
  close(expected, 24.307692307692307);
  const virgin = history.filter((d) => d.id >= 1654 && d.id <= 1664);
  const seen = new Set(virgin.flatMap((d) => d.nums));
  assert.equal(virgin.length, 11);
  assert.equal(seen.size, 35);
  assert.deepEqual(
    M.U.filter((n) => !seen.has(n)),
    [5, 6, 35, 39],
  );
  assert.equal(6 * virgin.length - seen.size, 31);
});

test("full historical replay remains finite, conserves six expected inclusions, and uses all observations", () => {
  const model = M.createModel();
  let scored = 0,
    brier = 0;
  for (const draw of history) {
    const pred = M.prediction(model);
    if (model.history.length >= 50) {
      brier += M.brier(pred, draw.nums);
      scored++;
    }
    M.observe(model, draw, pred);
  }
  assert.equal(scored, history.length - 50);
  assert.equal(model.observations, history.length);
  assert.ok(Number.isFinite(brier));
  close(M.sum(model.weights), 1);
  close(M.sum(M.prediction(model).marginals), 6);
  assert.ok(model.weights.every((p) => p > 0 && p < 1));
});

// Parity test: browser scoring engine vs notebook-computed outcomes on synthetic fixtures.
// Run from the demo folder:  node tests/parity.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreApplicant, deriveFeatures, bandOf } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(here, '..', 'data', 'model_contract.json'), 'utf8'));
const fixtures = JSON.parse(readFileSync(join(here, 'parity_fixtures.json'), 'utf8'));

let failures = 0; let checks = 0;
const fail = (msg) => { failures += 1; if (failures <= 20) console.error('FAIL:', msg); };
const close = (a, b, tol) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= tol);

if (fixtures.version.notebook_sha256_12 !== contract.version.notebook_sha256_12) fail('fixtures and contract come from different notebook versions');
if (contract.characteristics.length !== contract.model.n_characteristics) fail('characteristic count mismatch');

fixtures.cases.forEach((c, i) => {
  const e = c.expected;
  const res = scoreApplicant(contract, c.inputs);
  const feats = deriveFeatures(c.inputs);
  checks += 1;
  for (const [k, v] of Object.entries(e.features)) {
    const mine = Number.isNaN(feats[k]) ? null : feats[k];
    if (typeof v === 'number' || v === null) { if (!close(mine, v, 1e-12)) fail(`case ${i}: feature ${k} ${mine} vs ${v}`); }
    else if (mine !== v) fail(`case ${i}: feature ${k} ${mine} vs ${v}`);
  }
  if (res.unsupported) { fail(`case ${i}: unsupported ${res.unsupported}`); return; }
  for (const r of res.rows) {
    if (r.bin !== e.bins[r.name]) fail(`case ${i}: ${r.name} bin ${r.bin} vs ${e.bins[r.name]}`);
    if (r.points !== e.points[r.name]) fail(`case ${i}: ${r.name} points ${r.points} vs ${e.points[r.name]}`);
  }
  if (res.score !== e.points_total) fail(`case ${i}: points total ${res.score} vs ${e.points_total}`);
  if (res.score !== e.score) fail(`case ${i}: score ${res.score} vs sc.scorecard_ply ${e.score}`);
  if (Math.abs(res.score - res.exactScore) > res.n * 0.5 + 1e-9) fail(`case ${i}: points total too far from the exact scaled log-odds`);
  if (!close(res.pBad, e.p_bad, 1e-12)) fail(`case ${i}: p ${res.pBad} vs ${e.p_bad}`);
  if (res.approved !== e.approved) fail(`case ${i}: decision ${res.approved} vs ${e.approved}`);
  if (res.band !== e.band) fail(`case ${i}: band ${res.band} vs ${e.band}`);
  const rate = res.offer ? res.offer.rate : null;
  if (!close(rate, e.rate, 1e-15)) fail(`case ${i}: rate ${rate} vs ${e.rate}`);
  if (!close(res.offer ? res.offer.payment : null, e.monthly_payment, 1e-6)) fail(`case ${i}: payment`);
  if (!close(res.offer ? res.offer.totalInterest : null, e.total_interest, 1e-6)) fail(`case ${i}: total interest`);
});

for (const d of fixtures.decision_checks) {
  checks += 1;
  if ((d.score >= contract.policy.cutoff) !== d.approved) fail(`decision rule at score ${d.score}`);
}
for (const b of fixtures.band_checks) {
  checks += 1;
  if (bandOf(contract, b.score) !== b.band) fail(`band at score ${b.score}: ${bandOf(contract, b.score)} vs ${b.band}`);
}

const special = fixtures.cases.flatMap((c) => Object.values(c.expected.bins)).filter((b) => ['Missing', 'No bureau history', 'Unseen'].includes(b)).length;
console.log(`Parity checks: ${checks} (${fixtures.cases.length} synthetic applicants, ${special} special-bin assignments, cutoff and band boundaries)`);
console.log(failures === 0 ? 'ALL PARITY CHECKS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

import { scoreApplicant, validateInputs, deriveFeatures } from './engine.js';
import { barChart, lineChart, hBarChart, waterfall } from './charts.js';

const C1 = '#2f5fa8';   // series 1 (navy-blue)
const C2 = '#1f8a5a';   // series 2 (green)
const COST = '#8a93a3';
const LOSS = '#c0392b';
const NA = 'Not available from the current analysis';
const LABELS = {
  'Approval %': 'Approval rate', 'Accepted bad rate % (observed)': 'Observed payment-difficulty rate, approved',
  'Mean predicted p_bad % (approved)': 'Mean predicted risk, approved', 'Interest revenue': 'Projected interest revenue',
  'Funding and operating costs': 'Funding and operating costs', 'Credit losses': 'Expected credit losses',
  'Net contribution (after funding and operating cost)': 'Projected net contribution',
};

const state = { contract: null, aggregates: null, profiles: null, inputs: null, profileId: null, expanded: new Set(), scenario: 0, monitorMode: 'test', feature: null };

// ---------------------------------------------------------------- formatting
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtInt = (v) => (isNum(v) ? Math.round(v).toLocaleString('en-GB') : NA);
const fmtPct = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : NA);
const fmtPctPts = (v, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : NA);       // value already in percent
const fmtNum = (v, d = 2) => (isNum(v) ? v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : NA);
const fmtMoney = (v) => {
  if (!isNum(v)) return NA;
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} bn`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)} m`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)} k`;
  return v.toLocaleString('en-GB', { maximumFractionDigits: 0 });
};
const fmtUnits = (v) => (isNum(v) ? `${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : NA);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const unavailable = (what = '') => `<div class="unavailable">${NA}${what ? ` (${esc(what)})` : ''}</div>`;
const tag = (kind, text) => `<span class="tag ${kind}">${esc(text)}</span>`;

async function loadJson(path) {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (e) {
    console.warn(`Could not load ${path}:`, e.message);
    return null;
  }
}

// ---------------------------------------------------------------- navigation (also reachable by #portfolio, #policy, #monitoring, #applicant)
function showView(view) {
  document.querySelectorAll('.nav-btn').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  document.getElementById('view-business').classList.toggle('hidden', view !== 'business');
  document.getElementById('view-applicant').classList.toggle('hidden', view !== 'applicant');
}
const RENDERERS = { portfolio: () => renderPortfolio(), policy: () => renderPolicy(), monitoring: () => renderMonitoring() };
let currentSection = 'portfolio';
function showSection(section) {
  currentSection = section;
  document.querySelectorAll('.sub-btn').forEach((x) => x.classList.toggle('active', x.dataset.section === section));
  for (const s of ['portfolio', 'policy', 'monitoring']) document.getElementById(`section-${s}`).classList.toggle('hidden', section !== s);
  if (state.aggregates) RENDERERS[section]();
}
function route() {
  const target = window.location.hash.slice(1);
  if (target === 'applicant') showView('applicant');
  else if (!target) showSection('portfolio');
  else if (['portfolio', 'policy', 'monitoring'].includes(target)) { showView('business'); showSection(target); }
}
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => {
    showView(b.dataset.view);
    history.replaceState(null, '', b.dataset.view === 'applicant' ? '#applicant' : '#portfolio');
  }));
  document.querySelectorAll('.sub-btn').forEach((b) => b.addEventListener('click', () => {
    showSection(b.dataset.section);
    history.replaceState(null, '', `#${b.dataset.section}`);
  }));
  window.addEventListener('hashchange', route);
  let timer;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (!document.getElementById('view-business').classList.contains('hidden')) RENDERERS[currentSection](); }, 200); });
}

// ---------------------------------------------------------------- portfolio overview
function renderPortfolio() {
  const root = document.getElementById('section-portfolio');
  const po = state.aggregates?.portfolio_overview;
  if (!po) { root.innerHTML = `<h2>Portfolio Overview</h2>${unavailable()}`; return; }
  const ep = po.economics_policy || {}; const ea = po.economics_approve_all || {};
  const basis = po.economics_basis || {};
  const cutoff = state.contract?.policy?.cutoff;
  root.innerHTML = `
    <h2>Portfolio Overview</h2>
    <p class="lede">The frozen scorecard and cutoff applied once to the held-out test applicants. Approvals are hypothetical: no loans were issued. Risk figures compare model estimates with observed payment difficulties.</p>
    <div class="provenance"><strong>Source:</strong> ${esc(po.provenance.partition)} · ${esc(po.provenance.model_version)} · policy: approve if score ≥ ${cutoff}
      ${tag('observed', 'Observed outcomes')} ${tag('hypothetical', 'Hypothetical approvals')} ${tag('projected', 'Projected economics')}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Test applicants</div><div class="kpi-value">${fmtInt(po.test_applicants)}</div><div class="kpi-note">Held out, evaluated once</div></div>
      <div class="kpi green"><div class="kpi-label">Hypothetical approvals</div><div class="kpi-value">${fmtInt(po.approvals)}</div><div class="kpi-note">Approval rate ${fmtPct(po.approval_rate)}</div></div>
      <div class="kpi"><div class="kpi-label">Hypothetical approved principal</div><div class="kpi-value">${fmtMoney(po.approved_principal_actual_amt_credit)}</div><div class="kpi-note">Sum of requested credit of approved test applications (dataset currency units)</div></div>
      <div class="kpi"><div class="kpi-label">Hypothetical funded principal</div><div class="kpi-value">${fmtMoney(po.funded_principal_actual_amt_credit)}</div><div class="kpi-note">Take-up ${fmtPct(po.take_up, 0)} (assumption; no take-up data)</div></div>
      <div class="kpi"><div class="kpi-label">Mean predicted risk, approved</div><div class="kpi-value">${fmtPct(po.mean_predicted_p_bad_approved, 2)}</div><div class="kpi-note">Estimated probability of payment difficulties</div></div>
      <div class="kpi green"><div class="kpi-label">Observed payment difficulties, approved</div><div class="kpi-value">${fmtPct(po.observed_bad_rate_approved, 2)}</div><div class="kpi-note">All test applicants: ${fmtPct(po.observed_bad_rate_all, 2)}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3>Projected economics of the frozen policy</h3>
        <div class="legend"><span style="--c:${C1}">Interest revenue</span><span style="--c:${COST}">Funding and operating costs</span><span style="--c:${LOSS}">Expected credit losses</span><span style="--c:${C2}">Projected net contribution</span></div>
        <div id="po-waterfall"></div>
        <p class="note">${esc(basis.scale || '')}, ${esc(basis.horizon || '')}, ${esc(basis.units || '')}. Net contribution excludes capital, tax and acquisition costs, so it is not a fully costed profit.</p>
      </div>
      <div class="card">
        <h3>Policy versus approve-all (same test applicants)</h3>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>Frozen policy (≥ ${cutoff})</th><th>Approve all</th></tr></thead>
          <tbody>
            <tr><td>Approval rate</td><td>${fmtPctPts(ep['Approval %'])}</td><td>${fmtPctPts(ea['Approval %'])}</td></tr>
            <tr><td>Funded loans (per 10,000 applicants)</td><td>${fmtInt(ep['Funded loans'])}</td><td>${fmtInt(ea['Funded loans'])}</td></tr>
            <tr><td>Observed payment-difficulty rate</td><td>${fmtPctPts(ep['Accepted bad rate % (observed)'], 2)}</td><td>${fmtPctPts(ea['Accepted bad rate % (observed)'], 2)}</td></tr>
            <tr><td>Mean predicted risk</td><td>${fmtPctPts(ep['Mean predicted p_bad % (approved)'], 2)}</td><td>${fmtPctPts(ea['Mean predicted p_bad % (approved)'], 2)}</td></tr>
            <tr><td>Projected interest revenue</td><td>${fmtMoney(ep['Interest revenue'])}</td><td>${fmtMoney(ea['Interest revenue'])}</td></tr>
            <tr><td>Funding and operating costs</td><td>${fmtMoney(ep['Funding and operating costs'])}</td><td>${fmtMoney(ea['Funding and operating costs'])}</td></tr>
            <tr><td>Expected credit losses</td><td>${fmtMoney(ep['Credit losses'])}</td><td>${fmtMoney(ea['Credit losses'])}</td></tr>
            <tr><td><strong>Projected net contribution</strong></td><td><strong>${fmtMoney(ep['Net contribution (after funding and operating cost)'])}</strong></td><td><strong>${fmtMoney(ea['Net contribution (after funding and operating cost)'])}</strong></td></tr>
          </tbody></table></div>
        <p class="note">Under the base assumptions approve-all projects more net contribution, because every score band is priced to break even plus a margin. The cutoff reflects the stated risk appetite (see Policy Comparison).</p>
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Test applicants by score band</h3><div id="po-bands"></div><p class="note">Bands below 540 fall under the cutoff; the 540-549 band is split by the cutoff at 545.</p></div>
      <div class="card"><h3>Observed vs predicted payment-difficulty rate by score band</h3>
        <div class="legend"><span style="--c:${C1}">Mean predicted</span><span style="--c:${C2}">Observed</span></div>
        <div id="po-calib"></div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Scorecard performance at the cutoff</h3><div id="po-perf"></div><p class="note">${esc(po.performance_note || '')}</p></div>
      <div class="card"><h3>Assumptions and limitations</h3>
        <ul class="compact">
          <li>Population: homeowners aged 25-65, a proxy for home-improvement borrowers (no loan-purpose field exists).</li>
          <li>Outcome: TARGET = 1 means early payment difficulty within the first instalments, not a confirmed default or loss.</li>
          <li>Economics use a hypothetical standard loan (500,000 units, 36 monthly instalments); 50% of payment difficulties assumed to become losses at mid-term with 75% loss severity.</li>
          <li>Only approved historical loans have outcomes, and there are no application dates (no out-of-time test).</li>
          <li>Currency and income/annuity periods are not stated in the data dictionary.</li>
        </ul></div>
    </div>`;

  const net = ep['Net contribution (after funding and operating cost)'];
  if ([ep['Interest revenue'], ep['Funding and operating costs'], ep['Credit losses'], net].every(isNum)) {
    waterfall(document.getElementById('po-waterfall'), { fmt: fmtMoney, steps: [
      { label: 'Interest revenue', value: ep['Interest revenue'], kind: 'start', colour: C1 },
      { label: 'Funding & operating', value: ep['Funding and operating costs'], kind: 'step', colour: COST },
      { label: 'Credit losses', value: ep['Credit losses'], kind: 'step', colour: LOSS },
      { label: 'Net contribution', value: net, kind: 'total', colour: C2 }] });
  } else document.getElementById('po-waterfall').innerHTML = unavailable();

  const bands = po.score_bands || [];
  if (bands.length) {
    barChart(document.getElementById('po-bands'), { labels: bands.map((b) => b.band), series: [{ name: 'Test applicants', colour: C1, values: bands.map((b) => b.applicants) }], fmt: fmtInt, yLabel: 'Applicants' });
    barChart(document.getElementById('po-calib'), { labels: bands.map((b) => b.band), fmt: (v) => fmtPct(v, 0), tipFmt: (v) => fmtPct(v, 2), yLabel: 'Rate', series: [
      { name: 'Mean predicted', colour: C1, values: bands.map((b) => b.mean_predicted_p_bad) },
      { name: 'Observed', colour: C2, values: bands.map((b) => b.observed_bad_rate) }] });
  } else { document.getElementById('po-bands').innerHTML = unavailable(); document.getElementById('po-calib').innerHTML = unavailable(); }

  const perf = po.performance || [];
  document.getElementById('po-perf').innerHTML = perf.length ? `<div class="table-wrap"><table><thead><tr><th>Measure</th>${perf.map((p) => `<th>${esc(p.partition)}</th>`).join('')}</tr></thead><tbody>
    ${['F1 (good)', 'Recall (good)', 'Specificity (bad rejection)', 'AUC', 'Gini', 'KS'].map((k) => `<tr><td>${k}</td>${perf.map((p) => `<td>${fmtNum(p[k], 3)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>` : unavailable();
}

// ---------------------------------------------------------------- policy comparison
function renderPolicy() {
  const root = document.getElementById('section-policy');
  const pc = state.aggregates?.policy_comparison;
  const pricing = state.aggregates?.pricing;
  const ct = state.contract;
  if (!pc) { root.innerHTML = `<h2>Policy Comparison</h2>${unavailable()}`; return; }
  const rec = pc.recommended_cutoff;
  const rows = pc.cutoffs || [];
  const recIdx = rows.findIndex((r) => r.cutoff === rec);
  const principal = pricing?.assumptions?.principal;
  const netOf = (e) => e?.['Net contribution (after funding and operating cost)'];

  root.innerHTML = `
    <h2>Policy Comparison</h2>
    <p class="lede">Candidate cutoffs evaluated on the validation set, where the policy was chosen. The held-out test evaluation of the frozen choice is shown separately below and was not used to select it.</p>
    <div class="provenance"><strong>Policy selection:</strong> ${esc(pc.provenance.partition)} (${fmtInt(pc.validation_applicants)} applicants) · ${esc(pc.provenance.model_version)} ${tag('observed', 'Observed outcomes')} ${tag('projected', 'Projected economics')}</div>
    <div class="grid grid-3">
      <div class="card"><h3>Approval rate by cutoff</h3><div id="pc-approval"></div></div>
      <div class="card"><h3>Observed payment-difficulty rate of approved applicants</h3><div id="pc-risk"></div></div>
      <div class="card"><h3>Projected net contribution by cutoff</h3><div id="pc-net"></div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Why ${rec} is the recommended cutoff</h3>
      <ul class="compact">${(pc.reasoning || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Candidate cutoffs (validation)</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Cutoff</th><th>Approved</th><th>Approval</th><th>Approved principal (requested credit)</th><th>Funded principal, standard loan*</th><th>Observed payment difficulties</th><th>Mean predicted risk</th><th>Odds at cutoff (good:bad)</th><th>Revenue*</th><th>Expected losses*</th><th>Net contribution*</th></tr></thead>
        <tbody>
          <tr class="reference"><td>Approve all</td><td>${fmtInt(pc.approve_all.approved)}</td><td>${fmtPct(pc.approve_all.approval_rate)}</td><td>${fmtMoney(pc.approve_all.approved_principal_actual_amt_credit)}</td>
            <td>${isNum(principal) ? fmtMoney(pc.approve_all.economics['Funded loans'] * principal) : NA}</td><td>${fmtPct(pc.approve_all.accepted_bad_rate_observed, 2)}</td><td>${fmtPct(pc.approve_all.mean_predicted_p_bad_approved, 2)}</td><td>-</td>
            <td>${fmtMoney(pc.approve_all.economics['Interest revenue'])}</td><td>${fmtMoney(pc.approve_all.economics['Credit losses'])}</td><td>${fmtMoney(netOf(pc.approve_all.economics))}</td></tr>
          ${rows.map((r) => `<tr class="${r.cutoff === rec ? 'recommended' : ''}"><td>${r.cutoff}${r.cutoff === rec ? ' ✓ recommended' : ''}</td><td>${fmtInt(r.approved)}</td><td>${fmtPct(r.approval_rate)}</td>
            <td>${fmtMoney(r.approved_principal_actual_amt_credit)}</td><td>${isNum(principal) ? fmtMoney(r.economics['Funded loans'] * principal) : NA}</td>
            <td>${fmtPct(r.accepted_bad_rate_observed, 2)}</td><td>${fmtPct(r.mean_predicted_p_bad_approved, 2)}</td><td>${fmtNum(r.boundary_good_bad_odds, 1)}:1</td>
            <td>${fmtMoney(r.economics['Interest revenue'])}</td><td>${fmtMoney(r.economics['Credit losses'])}</td><td>${fmtMoney(netOf(r.economics))}</td></tr>`).join('')}
        </tbody></table></div>
      <p class="note">* ${esc(pc.economics_basis.scale)}; ${esc(pc.economics_basis.horizon)}; ${esc(pc.economics_basis.units)}. "Approved principal" sums the requested credit of approved validation applications. "Odds at cutoff" describe an applicant scoring exactly at the cutoff, not the approved group.</p>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h3>Assumption scenarios (validation, cutoff ${rec})</h3>
        <div class="controls"><label for="pc-scenario">Scenario</label><select id="pc-scenario" class="control">${(pc.scenarios || []).map((s, i) => `<option value="${i}" ${i === state.scenario ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div id="pc-scenario-table"></div>
        <p class="note">Deterministic scenarios from the notebook. Interest rates stay as set under the base case; one assumption changes at a time.</p>
      </div>
      <div class="card">
        <h3>Final evaluation on held-out test data</h3>
        <div class="provenance" style="margin-bottom:10px">${esc(pc.test_evaluation.provenance.partition)}: frozen model and cutoff ${rec}. Not used for selection.</div>
        <div id="pc-test"></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Risk-based interest rates by score band</h3>
      <div id="pc-pricing"></div>
    </div>
    <details style="margin-top:16px">
      <summary>How scoring works</summary>
      ${ct ? `<div class="grid grid-2">
        <div><p>The scorecard uses <strong>${ct.model.n_characteristics} characteristics</strong>. Each applicant value falls into one attribute (bin) per characteristic. Each attribute has a Weight of Evidence: <em>WOE = ln(% of goods / % of bads)</em>, so a positive WOE means lower risk than average.</p>
          <p>A logistic regression on the WOE values estimates the log-odds of payment difficulty: <em>z = β₀ + Σ βᵢ·WOEᵢ</em>. All coefficients are negative, as expected.</p>
          <p>Points per attribute: <em>Factor × (−(βᵢ·WOEᵢⱼ + β₀/n)) + Offset/n</em>. The intercept and offset are shared equally across the ${ct.model.n_characteristics} characteristics, so the points add up exactly to the score.</p></div>
        <div><p><strong>Scaling.</strong> Target score ${ct.scaling.target_score} at good:bad odds of ${ct.scaling.target_odds_good_bad}:1; every ${ct.scaling.pdo} points (PDO) doubles the odds. Factor = ${fmtNum(ct.scaling.factor, 4)}, Offset = ${fmtNum(ct.scaling.offset, 4)}.</p>
          <p><strong>Scaling is not the cutoff.</strong> The target score only anchors the points scale. The approval cutoff (${ct.policy.cutoff}) is a separate lending decision based on the risk appetite; at the cutoff the odds are about ${fmtNum(rows[recIdx]?.boundary_good_bad_odds, 1)}:1.</p>
          <p>Probability shown for an applicant: <em>p = 1 / (1 + e<sup>(score − Offset)/Factor</sup>)</em>, the estimated probability of payment difficulties (TARGET = 1).</p></div></div>` : unavailable('model contract')}
    </details>`;

  const labels = rows.map((r) => String(r.cutoff));
  lineChart(document.getElementById('pc-approval'), { labels, values: rows.map((r) => r.approval_rate), colour: C1, fmt: (v) => fmtPct(v, 0), highlight: recIdx, name: 'Approval rate', max: 1 });
  lineChart(document.getElementById('pc-risk'), { labels, values: rows.map((r) => r.accepted_bad_rate_observed), colour: C2, fmt: (v) => fmtPct(v, 1), highlight: recIdx, name: 'Observed rate',
    refLine: { value: pc.risk_limit, label: `risk limit ${fmtPct(pc.risk_limit, 0)}` } });
  lineChart(document.getElementById('pc-net'), { labels, values: rows.map((r) => netOf(r.economics)), colour: C1, fmt: fmtMoney, highlight: recIdx, name: 'Net contribution',
    refLine: { value: netOf(pc.approve_all.economics), label: 'approve all' } });

  const renderScenario = () => {
    const s = pc.scenarios?.[state.scenario];
    const box = document.getElementById('pc-scenario-table');
    if (!s) { box.innerHTML = unavailable(); return; }
    const row = (k, f) => `<tr><td>${LABELS[k] || k}</td><td>${f(s.policy[k])}</td><td>${f(s.approve_all[k])}</td></tr>`;
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Cutoff ${rec}</th><th>Approve all</th></tr></thead><tbody>
      ${row('Interest revenue', fmtMoney)}${row('Funding and operating costs', fmtMoney)}${row('Credit losses', fmtMoney)}
      ${row('Net contribution (after funding and operating cost)', (v) => `<strong>${fmtMoney(v)}</strong>`)}</tbody></table></div>`;
  };
  document.getElementById('pc-scenario').addEventListener('change', (e) => { state.scenario = Number(e.target.value); renderScenario(); });
  renderScenario();

  const te = pc.test_evaluation;
  const trow = (k, f) => `<tr><td>${LABELS[k] || k}</td><td>${f(te.policy[k])}</td><td>${f(te.approve_all[k])}</td></tr>`;
  document.getElementById('pc-test').innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Frozen cutoff ${rec}</th><th>Approve all</th></tr></thead><tbody>
    ${trow('Approval %', (v) => fmtPctPts(v))}${trow('Accepted bad rate % (observed)', (v) => fmtPctPts(v, 2))}${trow('Mean predicted p_bad % (approved)', (v) => fmtPctPts(v, 2))}
    ${trow('Interest revenue', fmtMoney)}${trow('Credit losses', fmtMoney)}${trow('Net contribution (after funding and operating cost)', (v) => `<strong>${fmtMoney(v)}</strong>`)}</tbody></table></div>`;

  const pb = pricing?.bands || [];
  document.getElementById('pc-pricing').innerHTML = pb.length ? `
    <div class="table-wrap"><table><thead><tr><th>Score band</th><th>Validation applicants</th><th>Mean predicted risk</th><th>Observed rate</th><th>Loss-event probability</th><th>Break-even rate</th><th>Offered annual rate</th><th>Above cutoff</th></tr></thead><tbody>
    ${pb.map((b) => `<tr class="${b['Above policy cutoff'] === 'no' ? 'reference' : ''}"><td>${esc(b.band)}</td><td>${fmtInt(b.Applicants)}</td><td>${fmtPctPts(b['Mean predicted p_bad %'], 2)}</td><td>${fmtPctPts(b['Observed bad rate %'], 2)}</td>
      <td>${fmtPctPts(b['Loss-event probability %'], 2)}</td><td>${fmtPctPts(b['Break-even rate %'], 2)}</td><td><strong>${fmtPctPts(b['Offered rate %'], 2)}</strong></td><td>${esc(b['Above policy cutoff'])}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">${esc(pricing.method)} ${esc(pricing.not_optimal_note)} Funding cost ${fmtPct(pricing.assumptions.funding_rate, 1)}, operating cost ${fmtPct(pricing.assumptions.opex_rate, 1)} a year on the outstanding balance; target margin ${fmtPct(pricing.assumptions.margin_rate, 0)} of principal a year; no fees modelled.</p>` : unavailable('pricing');
}

// ---------------------------------------------------------------- model monitoring
function renderMonitoring() {
  const root = document.getElementById('section-monitoring');
  const mo = state.aggregates?.monitoring;
  if (!mo) { root.innerHTML = `<h2>Model Monitoring</h2>${unavailable()}`; return; }
  const th = mo.thresholds || {};
  const status = (psi) => {
    if (!isNum(psi)) return `<span class="status warn">${NA}</span>`;
    if (!isNum(th.stable_below)) return `<span class="status">PSI ${psi.toFixed(4)}</span>`;
    if (psi < th.stable_below) return '<span class="status ok">● Stable distribution</span>';
    if (psi <= th.significant_above) return '<span class="status warn">▲ Moderate shift: investigate</span>';
    return '<span class="status bad">■ Significant shift: review</span>';
  };
  root.innerHTML = `
    <h2>Model Monitoring</h2>
    <p class="lede">The Population Stability Index compares the score and characteristic distributions of a comparison population with the frozen development reference.</p>
    <div class="controls">
      <button class="chip ${state.monitorMode === 'test' ? 'active' : ''}" data-mode="test">Development vs held-out test (sample comparison)</button>
      <button class="chip ${state.monitorMode === 'future' ? 'active' : ''}" data-mode="future">Simulated future population (hypothetical)</button>
    </div>
    <div id="mo-body"></div>`;
  root.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { state.monitorMode = b.dataset.mode; renderMonitoring(); }));
  const body = document.getElementById('mo-body');
  const explainer = `
    <div class="callout quote" style="margin-top:16px">PSI signals a change in population distribution. It does not alone prove performance deterioration or automatically retrain the model.</div>
    <div class="steps" style="margin-top:12px">
      <div class="step"><b>1. Investigate</b>Population or data changes: sources, definitions, channel or product mix.</div>
      <div class="step"><b>2. Assess outcomes</b>Approval rates, payment difficulties and calibration once labelled outcomes mature.</div>
      <div class="step"><b>3. Validate any change</b>Recalibration or redevelopment is validated on new data before deployment.</div>
    </div>`;
  if (state.monitorMode === 'future') {
    body.innerHTML = `<div class="provenance"><strong>Mode:</strong> simulated future population ${tag('hypothetical', 'Hypothetical scenario')}</div>
      ${unavailable(mo.simulated_future_note ? 'the notebook does not define a simulated future population' : '')}
      <p class="note">${esc(mo.limitation || '')} The deployed model version is unchanged in every mode.</p>${explainer}`;
    return;
  }
  const feats = mo.features || [];
  if (!state.feature && feats.length) state.feature = feats[0].name;
  const f = feats.find((x) => x.name === state.feature);
  body.innerHTML = `
    <div class="provenance"><strong>Reference:</strong> ${esc(mo.reference_population)} · <strong>Comparison:</strong> ${esc(mo.comparison_population)} · ${esc(mo.provenance.model_version)} ${tag('observed', 'Same-period random samples')}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Score PSI</div><div class="kpi-value">${isNum(mo.score?.psi) ? mo.score.psi.toFixed(5) : NA}</div><div class="kpi-note">${status(mo.score?.psi)}</div></div>
      <div class="kpi"><div class="kpi-label">Largest characteristic PSI</div><div class="kpi-value">${feats.length ? Math.max(...feats.map((x) => x.psi)).toFixed(5) : NA}</div><div class="kpi-note">${feats.length ? esc(feats.reduce((a, b) => (b.psi > a.psi ? b : a)).label) : ''}</div></div>
      <div class="kpi"><div class="kpi-label">Review thresholds</div><div class="kpi-value" style="font-size:1.2rem">&lt; ${th.stable_below} stable · &gt; ${th.significant_above} significant</div><div class="kpi-note">${esc(th.source || '')}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>Score distribution by development decile</h3>
        <div class="legend"><span style="--c:${C1}">Reference (dev_train)</span><span style="--c:${C2}">Comparison (test)</span></div>
        <div id="mo-score"></div><p class="note">${esc(mo.score?.binning || '')}. ${esc(mo.formula)}. ${esc(mo.smoothing)}.</p></div>
      <div class="card"><h3>Characteristic PSI</h3><div id="mo-feats"></div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="controls"><h3 style="margin:0">Characteristic distribution</h3>
        <select id="mo-feature" class="control">${feats.map((x) => `<option value="${x.name}" ${x.name === state.feature ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
        ${f ? status(f.psi) : ''}</div>
      <div class="legend"><span style="--c:${C1}">Reference (dev_train)</span><span style="--c:${C2}">Comparison (test)</span></div>
      <div id="mo-feature-chart"></div>
    </div>
    <p class="note">${esc(mo.limitation || '')}</p>
    ${explainer}`;
  if (mo.score?.bins) barChart(document.getElementById('mo-score'), { labels: mo.score.bins.map((_, i) => `D${i + 1}`), fmt: (v) => fmtPct(v, 0), tipFmt: (v) => fmtPct(v, 2),
    series: [{ name: 'Reference', colour: C1, values: mo.score.reference }, { name: 'Comparison', colour: C2, values: mo.score.comparison }] });
  if (feats.length) hBarChart(document.getElementById('mo-feats'), { labels: feats.map((x) => x.label), values: feats.map((x) => x.psi), colour: C1, fmt: (v) => v.toFixed(5) });
  if (f) barChart(document.getElementById('mo-feature-chart'), { labels: f.bins.map((b) => (b.length > 18 ? `${b.slice(0, 17)}…` : b)), fmt: (v) => fmtPct(v, 0), tipFmt: (v) => fmtPct(v, 2),
    series: [{ name: 'Reference', colour: C1, values: f.reference }, { name: 'Comparison', colour: C2, values: f.comparison }] });
  document.getElementById('mo-feature')?.addEventListener('change', (e) => { state.feature = e.target.value; renderMonitoring(); });
}

// ---------------------------------------------------------------- applicant assessment
const UNSEEN_VALUE = 'Other (not in development data)';

function fieldMeta() {
  const byName = Object.fromEntries(state.contract.characteristics.map((c) => [c.name, c]));
  const opts = (name) => Object.keys(byName[name].groups).sort();
  const hasUnseen = (name) => byName[name].attributes.some((a) => a.label === state.contract.special_bins.unseen);
  return { byName, opts, hasUnseen };
}

function inputField({ id, label, hint, type = 'number', min, max, step, options, missingLabel, derivedId, disabled }) {
  const v = state.inputs[id];
  const missing = v === null || v === undefined;
  let control;
  if (type === 'select') {
    control = `<select id="in-${id}" ${disabled || missing ? 'disabled' : ''}>${options.map((o) => `<option value="${esc(o.value)}" ${String(v) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else {
    control = `<input type="number" id="in-${id}" value="${missing ? '' : v}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined && max !== null ? `max="${max}"` : ''} step="${step || 'any'}" ${disabled || missing ? 'disabled' : ''}>`;
  }
  const missingBox = missingLabel ? `<label class="inline"><input type="checkbox" id="miss-${id}" ${missing ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${esc(missingLabel)}</label>` : '';
  return `<div class="field"><label for="in-${id}">${esc(label)}</label>${control}${missingBox}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}${derivedId ? `<div class="derived" id="${derivedId}"></div>` : ''}</div>`;
}

function renderInputs() {
  const { byName, opts, hasUnseen } = fieldMeta();
  const catOptions = (name, current) => {
    const list = opts(name).map((o) => ({ value: o, label: o }));
    if (hasUnseen(name)) list.push({ value: UNSEEN_VALUE, label: `${UNSEEN_VALUE} → Unseen attribute` });
    if (current && !list.some((o) => o.value === current)) list.push({ value: current, label: current });
    return list;
  };
  const miss = (name) => (byName[name].input.allow_missing ? byName[name].input.missing_label : null);
  const noHist = Boolean(state.inputs.no_bureau_history);
  const regionLevels = (byName.REGION_RATING_CLIENT_W_CITY.levels || [1, 2, 3]).map((l) => ({ value: l, label: String(l) }));
  const box = document.getElementById('assess-inputs');
  box.innerHTML = `
    <div class="field-group"><h4>Applicant</h4>
      ${inputField({ id: 'age_input', label: 'Age (years)', min: 18, max: 100, step: 1, hint: 'Modelled population: 25-65', derivedId: 'd-age' })}
      ${inputField({ id: 'education', label: 'Education', type: 'select', options: catOptions('NAME_EDUCATION_TYPE', state.inputs.education), missingLabel: miss('NAME_EDUCATION_TYPE') })}
      ${inputField({ id: 'occupation', label: 'Occupation', type: 'select', options: catOptions('OCCUPATION_TYPE', state.inputs.occupation), missingLabel: miss('OCCUPATION_TYPE') })}
      ${inputField({ id: 'organisation', label: 'Employer type', type: 'select', options: catOptions('ORGANIZATION_TYPE', state.inputs.organisation), missingLabel: miss('ORGANIZATION_TYPE') })}
      <div class="field"><label for="in-employment_years_input">Years in current job</label>
        <input type="number" id="in-employment_years_input" min="0" step="0.1" value="${state.inputs.not_employed ? '' : state.inputs.employment_years_input ?? ''}" ${state.inputs.not_employed ? 'disabled' : ''}>
        <label class="inline"><input type="checkbox" id="flag-not_employed" ${state.inputs.not_employed ? 'checked' : ''}> Not currently employed (pensioner, unemployed)</label>
        <div class="derived" id="d-emp"></div></div>
    </div>
    <div class="field-group"><h4>Loan and property</h4>
      ${inputField({ id: 'principal', label: 'Requested principal (dataset currency units)', min: 1, step: 1000, hint: 'Used for the illustrative repayment only' })}
      ${inputField({ id: 'goods_price', label: 'Goods price financed (dataset currency units)', min: 0, step: 1000, missingLabel: miss('AMT_GOODS_PRICE') })}
      ${inputField({ id: 'region_rating', label: 'Region rating (with city)', type: 'select', options: regionLevels, hint: '1 = best, 3 = weakest' })}
      ${inputField({ id: 'floors_max', label: 'Building height (normalised 0-1)', min: 0, max: 1, step: 0.01, missingLabel: miss('FLOORSMAX_MEDI') })}
      ${inputField({ id: 'days_since_phone_change', label: 'Days since phone number changed', min: 0, step: 1, missingLabel: miss('DAYS_LAST_PHONE_CHANGE') })}
    </div>
    <div class="field-group"><h4>External score and credit bureau (analyst inputs)</h4>
      ${inputField({ id: 'ext_source_1', label: 'External score (0-1)', min: 0, max: 1, step: 0.01, missingLabel: miss('EXT_SOURCE_1') })}
      <label class="inline" style="margin-bottom:8px"><input type="checkbox" id="flag-no_bureau_history" ${noHist ? 'checked' : ''}> No bureau history (no record at the credit bureau)</label>
      ${inputField({ id: 'bureau_debt_sum', label: 'Outstanding bureau debt (sum, currency 1 records)', min: 0, step: 1000, missingLabel: 'Debt amount not reported', disabled: noHist })}
      ${inputField({ id: 'bureau_credit_sum', label: 'Total bureau credit (sum, currency 1 records)', min: 0, step: 1000, disabled: noHist, derivedId: 'd-ratio' })}
      ${inputField({ id: 'days_since_recent_credit', label: 'Days since most recent bureau credit opened', min: 0, step: 1, disabled: noHist })}
    </div>`;

  const numberIds = ['age_input', 'principal', 'goods_price', 'floors_max', 'days_since_phone_change', 'ext_source_1', 'bureau_debt_sum', 'bureau_credit_sum', 'days_since_recent_credit', 'employment_years_input'];
  numberIds.forEach((id) => {
    const input = document.getElementById(`in-${id}`);
    input?.addEventListener('input', () => { state.inputs[id] = input.value === '' ? (id === 'employment_years_input' ? '' : '') : Number(input.value); markStale(); });
  });
  ['education', 'occupation', 'organisation', 'region_rating'].forEach((id) => {
    const sel = document.getElementById(`in-${id}`);
    sel?.addEventListener('change', () => { state.inputs[id] = id === 'region_rating' ? Number(sel.value) : sel.value; markStale(); });
  });
  document.querySelectorAll('[id^="miss-"]').forEach((box2) => box2.addEventListener('change', () => {
    const id = box2.id.slice(5);
    const control = document.getElementById(`in-${id}`);
    if (box2.checked) { state.inputs[id] = null; control.disabled = true; }
    else {
      control.disabled = false;
      state.inputs[id] = control.tagName === 'SELECT' ? control.value || control.options[0]?.value : (control.value === '' ? 0 : Number(control.value));
      if (control.tagName === 'SELECT' && !control.value) control.value = state.inputs[id];
    }
    markStale();
  }));
  document.getElementById('flag-not_employed').addEventListener('change', (e) => { state.inputs.not_employed = e.target.checked; if (!e.target.checked && (state.inputs.employment_years_input === null || state.inputs.employment_years_input === '')) state.inputs.employment_years_input = 0; renderInputs(); markStale(); });
  document.getElementById('flag-no_bureau_history').addEventListener('change', (e) => {
    state.inputs.no_bureau_history = e.target.checked;
    if (!e.target.checked) {
      state.inputs.bureau_credit_sum ??= 0; state.inputs.days_since_recent_credit ??= 0;
    }
    renderInputs(); markStale();
  });
}

function showPrompt(text) {
  const bd = document.getElementById('assess-breakdown');
  const dec = document.getElementById('assess-decision');
  const msg = document.getElementById('assess-messages');
  if (msg) msg.innerHTML = '';
  if (bd) bd.innerHTML = `<div class="prompt-box">${esc(text)}</div>`;
  if (dec) dec.innerHTML = `<div class="prompt-box">${esc(text)}</div>`;
  renderWhatIf(null);
}
function markStale() {
  if (state.calculated) showPrompt('Inputs changed. Press Calculate score to update the decision.');
  state.calculated = false;
  updateDerived();
}
function calculate() {
  state.calculated = true;
  renderResults();
  document.getElementById('assess-decision')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function displayValue(name, f) {
  const v = f[name];
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return '<em>missing</em>';
  if (typeof v === 'string') return esc(v);
  if (name === 'BUR_debt_to_credit') return fmtNum(v, 3);
  if (name === 'employment_years' || name === 'age_years') return `${fmtNum(v, 2)} years`;
  if (name === 'AMT_GOODS_PRICE') return fmtUnits(v);
  if (name === 'DAYS_LAST_PHONE_CHANGE') return `${fmtInt(v)} days`;
  if (name === 'BUR_days_since_recent_credit') return `${fmtInt(v)} days`;
  return fmtNum(v, Number.isInteger(v) ? 0 : 3);
}

function updateDerived() {
  const inp = state.inputs;
  const f = deriveFeatures(inp);
  const set = (id, html) => { const n = document.getElementById(id); if (n) n.innerHTML = html; };
  set('d-age', isNum(f.age_years) ? `Derived: DAYS_BIRTH = ${fmtInt(f.DAYS_BIRTH)} → age_years = ${fmtNum(f.age_years, 3)}` : '');
  set('d-emp', inp.not_employed ? 'Derived: DAYS_EMPLOYED = 365243 (not employed) → employment_years missing' : (isNum(f.employment_years) ? `Derived: DAYS_EMPLOYED = ${fmtInt(f.DAYS_EMPLOYED)} → employment_years = ${fmtNum(f.employment_years, 3)}` : ''));
  set('d-ratio', inp.no_bureau_history ? 'No bureau history → bureau characteristics use the No bureau history attribute' : `Derived: debt-to-credit = ${isNum(f.BUR_debt_to_credit) ? fmtNum(f.BUR_debt_to_credit, 4) : 'undefined (missing)'}`);
}

// average points per characteristic for the development population (dev_train attribute shares x points)
function averagePoints() {
  const feats = state.aggregates?.monitoring?.features;
  const out = {};
  for (const ch of state.contract.characteristics) {
    const f = feats?.find((x) => x.name === ch.name);
    const pts = Object.fromEntries(ch.attributes.map((a) => [a.label, a.points_unrounded]));
    if (f && f.bins.every((b) => b in pts)) out[ch.name] = f.bins.reduce((s, b, i) => s + f.reference[i] * pts[b], 0);
  }
  return out;
}

function renderReasons(res) {
  const ct = state.contract;
  const avg = averagePoints();
  const cutoff = ct.policy.cutoff;
  const gap = res.score - cutoff;
  const avgTotal = Object.values(avg).reduce((s, v) => s + v, 0);
  const items = res.rows.filter((r) => r.name in avg).map((r) => ({ ...r, diff: r.pointsUnrounded - avg[r.name] }));
  const up = items.filter((x) => x.diff > 0.5).sort((a, b) => b.diff - a.diff).slice(0, 4);
  const down = items.filter((x) => x.diff < -0.5).sort((a, b) => a.diff - b.diff).slice(0, 4);
  const line = (x) => `<li><strong>${esc(x.label)}</strong>: ${esc(x.bin)} → ${x.points} pts <span class="${x.diff >= 0 ? 'diff-up' : 'diff-down'}">(${x.diff >= 0 ? '+' : ''}${fmtNum(x.diff, 1)} vs average)</span></li>`;
  const verdict = res.approved
    ? `The score of ${fmtNum(res.score, 1)} is ${fmtNum(gap, 1)} points above the cutoff of ${cutoff}, so the application is approved.`
    : `The score of ${fmtNum(res.score, 1)} is ${fmtNum(-gap, 1)} points below the cutoff of ${cutoff}, so the application is declined.`;
  const detail = Object.keys(avg).length ? `
    ${up.length ? `<p class="reason-head">Raising the score most</p><ul class="compact">${up.map(line).join('')}</ul>` : ''}
    ${down.length ? `<p class="reason-head">Lowering the score most</p><ul class="compact">${down.map(line).join('')}</ul>` : ''}
    <p class="note">Compared with the points an average development applicant receives for each characteristic (average total ${fmtNum(avgTotal, 1)}). Points show how the scorecard ranks risk; they are not causal effects.</p>`
    : `<p class="note">${NA} (average points by characteristic)</p>`;
  return `<div class="reasons"><h4>Why</h4><p>${verdict}</p>${detail}</div>`;
}

function renderResults() {
  const ct = state.contract;
  const inp = state.inputs;
  updateDerived();
  const { errors, warnings } = validateInputs(ct, inp);
  const msg = document.getElementById('assess-messages');
  msg.innerHTML = errors.map((e) => `<div class="error">${esc(e)}</div>`).join('') + warnings.map((w) => `<div class="warning">${esc(w)}</div>`).join('');
  const bd = document.getElementById('assess-breakdown');
  const dec = document.getElementById('assess-decision');
  if (errors.length) {
    bd.innerHTML = '<div class="unavailable">Correct the highlighted inputs to calculate the score.</div>';
    dec.innerHTML = '<div class="unavailable">No decision until the inputs are valid.</div>';
    renderWhatIf(null);
    return;
  }
  const res = scoreApplicant(ct, inp);
  if (res.unsupported) {
    bd.innerHTML = `<div class="unavailable">The final model has no rule for a missing value in: ${esc(res.unsupported.join(', '))}.</div>`;
    dec.innerHTML = '';
    return;
  }
  const byName = Object.fromEntries(ct.characteristics.map((c) => [c.name, c]));
  bd.innerHTML = `
    <div class="table-wrap"><table class="breakdown">
      <thead><tr><th>Characteristic</th><th>Value</th><th>Attribute</th><th>Points</th><th></th></tr></thead>
      <tbody>${res.rows.map((r) => `
        <tr><td>${esc(r.label)}</td><td>${displayValue(r.name, res.features)}</td><td>${esc(r.bin)}${r.special ? '<span class="special-pill">special</span>' : ''}</td><td class="pts">${r.points}</td>
          <td><button class="expand" data-name="${r.name}" aria-expanded="${state.expanded.has(r.name)}">${state.expanded.has(r.name) ? '−' : '+'}</button></td></tr>
        ${state.expanded.has(r.name) ? `<tr class="detail"><td colspan="5">
          <strong>${esc(r.name)}</strong>: ${esc(byName[r.name].description)}<br>
          Transformation: ${esc(byName[r.name].transform)}<br>
          WOE ${fmtNum(r.woe, 4)} · coefficient ${fmtNum(r.coefficient, 4)} · points ${fmtNum(r.pointsUnrounded, 3)} (unrounded) → ${r.points} (rounded)</td></tr>` : ''}`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="3">Total of rounded points</td><td class="pts">${res.roundedTotal}</td><td></td></tr>
        <tr><td colspan="3">Exact score (sum of unrounded points = Offset − Factor × z)</td><td class="pts">${fmtNum(res.score, 2)}</td><td></td></tr>
      </tfoot></table></div>
    <p class="note">The intercept and offset are shared equally across all ${res.n} characteristics, so the points add up to the score. Point differences show how the scorecard ranks risk; they are not causal effects. Rounding moves the total by ${fmtNum(res.roundedTotal - res.score, 2)} points; the decision uses the exact score.</p>`;
  bd.querySelectorAll('button.expand').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.name;
    if (state.expanded.has(n)) state.expanded.delete(n); else state.expanded.add(n);
    renderResults();
  }));

  const cutoff = ct.policy.cutoff;
  const lo = 480; const hi = 680;
  const pos = (s) => Math.min(100, Math.max(0, ((s - lo) / (hi - lo)) * 100));
  dec.innerHTML = `
    <div class="score-hero"><div class="score">${fmtNum(res.score, 1)}</div><div class="sub">Exact score · rounded points total ${res.roundedTotal}</div></div>
    <div class="gauge" aria-hidden="true"><div class="cut" style="left:${pos(cutoff)}%"><span>cutoff ${cutoff}</span></div><div class="marker" style="left:${pos(res.score)}%"></div></div>
    <div class="decision ${res.approved ? 'approve' : 'reject'}">${res.approved ? '✓ Approved (illustrative)' : '✕ Declined (illustrative)'}</div>
    ${renderReasons(res)}
    <dl class="kv">
      <dt>Decision rule</dt><dd>${esc(ct.policy.rule.replace('>=', '≥'))}</dd>
      <dt>${esc(ct.target.probability_label)}</dt><dd>${fmtPct(res.pBad, 2)}</dd>
      <dt>Good:bad odds at this score</dt><dd>${fmtNum((1 - res.pBad) / res.pBad, 1)}:1</dd>
      <dt>Score band</dt><dd>${esc(res.band)}</dd>
    </dl>
    ${res.offer ? `<div class="offer-box"><h4>Illustrative loan offer</h4><dl class="kv">
      <dt>Annual interest rate (band ${esc(res.offer.band)})</dt><dd>${fmtPct(res.offer.rate, 2)}</dd>
      <dt>Principal</dt><dd>${fmtUnits(res.offer.principal)}</dd>
      <dt>Term</dt><dd>${res.offer.months} monthly instalments</dd>
      <dt>Fees</dt><dd>None modelled</dd>
      <dt>Estimated monthly instalment</dt><dd>${fmtUnits(res.offer.payment)}</dd>
      <dt>Total interest over the term</dt><dd>${fmtUnits(res.offer.totalInterest)}</dd>
      <dt>Total repaid</dt><dd>${fmtUnits(res.offer.totalRepaid)}</dd></dl>
      <p class="note">Equal monthly instalments, monthly rate = annual rate / 12. The 36-month term is a hypothetical assumption, and amounts are in dataset currency units (currency not stated). Rates are break-even prices, not optimal prices.</p></div>`
    : `<div class="offer-box"><h4>No offer</h4><p class="note">Applicants scoring below ${cutoff} receive no rate or repayment offer under the documented policy.</p></div>`}`;
  renderWhatIf(res);
}

// what-if: change one supported input and compare
const WHATIF_FIELDS = [
  { id: 'ext_source_1', label: 'External score (0-1)', type: 'number' },
  { id: 'employment_years_input', label: 'Years in current job', type: 'number' },
  { id: 'age_input', label: 'Age (years)', type: 'number' },
  { id: 'goods_price', label: 'Goods price financed', type: 'number' },
  { id: 'bureau_debt_sum', label: 'Outstanding bureau debt', type: 'number' },
  { id: 'bureau_credit_sum', label: 'Total bureau credit', type: 'number' },
  { id: 'days_since_recent_credit', label: 'Days since most recent bureau credit', type: 'number' },
  { id: 'days_since_phone_change', label: 'Days since phone number changed', type: 'number' },
  { id: 'floors_max', label: 'Building height (normalised)', type: 'number' },
  { id: 'region_rating', label: 'Region rating', type: 'select', options: [1, 2, 3] },
];
const whatIf = { field: 'ext_source_1', value: '' };

function renderWhatIf(original) {
  const box = document.getElementById('assess-whatif');
  if (!box) return;
  const fieldDef = WHATIF_FIELDS.find((x) => x.id === whatIf.field);
  box.innerHTML = `
    <h3>What-if comparison</h3>
    <div class="controls">
      <select id="wi-field" class="control">${WHATIF_FIELDS.map((x) => `<option value="${x.id}" ${x.id === whatIf.field ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
      ${fieldDef.type === 'select' ? `<select id="wi-value" class="control">${fieldDef.options.map((o) => `<option ${String(o) === String(whatIf.value) ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input id="wi-value" type="number" step="any" placeholder="revised value" value="${esc(whatIf.value)}">`}
    </div>
    <div id="wi-result"></div>`;
  document.getElementById('wi-field').addEventListener('change', (e) => { whatIf.field = e.target.value; whatIf.value = ''; renderWhatIf(original); });
  document.getElementById('wi-value').addEventListener(fieldDef.type === 'select' ? 'change' : 'input', (e) => { whatIf.value = e.target.value; drawWhatIf(original); });
  drawWhatIf(original);
}

function drawWhatIf(original) {
  const out = document.getElementById('wi-result');
  if (!original) { out.innerHTML = '<p class="note">Enter valid inputs first.</p>'; return; }
  if (whatIf.value === '') { out.innerHTML = '<p class="note">Choose an input and enter a revised value to compare the outcome. The scorecard responds through its bins, so a change may raise, lower or not change the score.</p>'; return; }
  const ct = state.contract;
  const revisedInputs = { ...state.inputs, [whatIf.field]: Number(whatIf.value) };
  if (whatIf.field === 'employment_years_input') revisedInputs.not_employed = false;
  if (['bureau_debt_sum', 'bureau_credit_sum', 'days_since_recent_credit'].includes(whatIf.field) && state.inputs.no_bureau_history) {
    out.innerHTML = '<p class="note">The applicant has no bureau history; bureau amounts do not apply.</p>'; return;
  }
  const { errors } = validateInputs(ct, revisedInputs);
  if (errors.length) { out.innerHTML = `<div class="messages">${errors.map((e) => `<div class="error">${esc(e)}</div>`).join('')}</div>`; return; }
  const revised = scoreApplicant(ct, revisedInputs);
  if (revised.unsupported) { out.innerHTML = unavailable(); return; }
  const changed = revised.rows.filter((r, i) => r.bin !== original.rows[i].bin || r.points !== original.rows[i].points || String(revised.features[r.name]) !== String(original.features[r.name]));
  const delta = revised.score - original.score;
  const offerText = (r) => (r.offer ? `${fmtPct(r.offer.rate, 2)} · instalment ${fmtUnits(r.offer.payment)}` : 'No offer');
  out.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th></th><th>Original</th><th>Revised</th></tr></thead><tbody>
      <tr><td>Input: ${esc(WHATIF_FIELDS.find((x) => x.id === whatIf.field).label)}</td><td>${esc(state.inputs[whatIf.field] ?? 'missing')}</td><td>${esc(whatIf.value)}</td></tr>
      ${changed.length ? changed.map((r) => { const o = original.rows.find((x) => x.name === r.name); return `<tr><td>${esc(r.label)}</td><td>${displayValue(r.name, original.features)} · ${esc(o.bin)} · <strong>${o.points}</strong> pts</td><td>${displayValue(r.name, revised.features)} · ${esc(r.bin)} · <strong>${r.points}</strong> pts</td></tr>`; }).join('')
        : '<tr><td colspan="3">No characteristic changes attribute: the revised value falls in the same bin.</td></tr>'}
      <tr><td><strong>Exact score</strong></td><td>${fmtNum(original.score, 1)}</td><td>${fmtNum(revised.score, 1)} <span class="${delta >= 0 ? 'diff-up' : 'diff-down'}">(${delta >= 0 ? '+' : ''}${fmtNum(delta, 1)})</span></td></tr>
      <tr><td>Decision</td><td>${original.approved ? 'Approve' : 'Reject'}</td><td>${revised.approved ? 'Approve' : 'Reject'}</td></tr>
      <tr><td>Offer</td><td>${offerText(original)}</td><td>${offerText(revised)}</td></tr>
    </tbody></table></div>`;
}

function loadProfile(id) {
  const p = state.profiles?.profiles?.find((x) => x.id === id);
  if (!p) return;
  state.profileId = id;
  state.inputs = JSON.parse(JSON.stringify(p.inputs));
  whatIf.value = '';
  document.querySelectorAll('.profile-chip').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
  state.calculated = false;
  renderInputs();
  updateDerived();
  showPrompt('Inputs are pre-filled with a synthetic applicant. Press Calculate score.');
}

function renderApplicant() {
  const root = document.getElementById('view-applicant');
  if (!state.contract) { root.innerHTML = `<h2>Applicant Assessment</h2>${unavailable('model contract')}`; return; }
  const profiles = state.profiles?.profiles || [];
  root.innerHTML = `
    <h2>Applicant Assessment</h2>
    <p class="lede">Score an application with the final ${state.contract.model.n_characteristics}-characteristic scorecard. Every value is traced from input to attribute, WOE, points and the total score. Decisions and offers are illustrative.</p>
    <div class="controls"><span style="font-weight:600;color:var(--ink-2)">Synthetic examples:</span>
      ${profiles.length ? profiles.map((p) => `<button class="chip profile-chip" data-id="${p.id}">${esc(p.kind)}</button>`).join('') : `<span class="note">${NA}</span>`}
      <span class="note">${esc(state.profiles?.note || '')}</span></div>
    <div class="assess">
      <div class="card"><div class="panel-title"><h3>Applicant inputs</h3><button class="calc-btn" id="btn-calc-top">Calculate score</button></div>
        <div class="messages" id="assess-messages"></div><div id="assess-inputs"></div>
        <button class="calc-btn wide" id="btn-calc">Calculate score</button></div>
      <div class="card"><div class="panel-title"><h3>Score breakdown</h3><span class="note">+ shows WOE, coefficient and transformation</span></div><div id="assess-breakdown"></div></div>
      <div class="card"><h3>Lending decision and offer</h3><div id="assess-decision"></div></div>
    </div>
    <div class="card whatif" id="assess-whatif"></div>`;
  root.querySelectorAll('.profile-chip').forEach((b) => b.addEventListener('click', () => loadProfile(b.dataset.id)));
  document.getElementById('btn-calc').addEventListener('click', calculate);
  document.getElementById('btn-calc-top').addEventListener('click', calculate);
  if (profiles.length) loadProfile(profiles.find((p) => p.id === 'borderline')?.id || profiles[0].id);
}

// ---------------------------------------------------------------- boot
async function boot() {
  setupNav();
  // optional ?data=<folder> (used by the smoke test to check behaviour when artifacts are missing)
  const base = (new URLSearchParams(window.location.search).get('data') || 'data').replace(/[^\w-]/g, '');
  const [contract, aggregates, profiles] = await Promise.all([
    loadJson(`${base}/model_contract.json`), loadJson(`${base}/dashboard_aggregates.json`), loadJson(`${base}/synthetic_profiles.json`)]);
  Object.assign(state, { contract, aggregates, profiles });
  const v = contract?.version || aggregates?.version;
  document.getElementById('version-line').textContent = v
    ? `${v.model_version} · fitted on ${v.fitted_on} · policy chosen on ${v.policy_selected_on} · notebook ${v.notebook_sha256_12}`
    : NA;
  document.getElementById('footer-line').textContent = 'Illustrative demonstration for an academic credit scorecard. Approvals, offers and projections are hypothetical; outcomes are early payment difficulties, not confirmed losses.';
  renderPortfolio();
  renderPolicy();
  renderMonitoring();
  renderApplicant();
  route();
  if (new URLSearchParams(window.location.search).get('autocalc') === '1' && state.contract) calculate();
}

boot();

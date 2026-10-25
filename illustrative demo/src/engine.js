// Scoring engine driven entirely by data/model_contract.json (exported from the notebook).
// No model settings are written here; only the notebook's transformation formulas and decision mechanics.

export const DAYS_PER_YEAR = 365.25;
export const EMPLOYMENT_SENTINEL = 365243;

const isMissing = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
const roundHalfUp = (x) => Math.floor(x + 0.5);

// Applicant inputs -> model characteristics (mirrors input_to_features() in export_dashboard_data.py)
export function deriveFeatures(inp) {
  const f = {};
  const noHistory = Boolean(inp.no_bureau_history);
  f.no_bureau_history = noHistory ? 1 : 0;
  f.EXT_SOURCE_1 = isMissing(inp.ext_source_1) ? NaN : Number(inp.ext_source_1);

  const daysEmployed = inp.not_employed ? EMPLOYMENT_SENTINEL : -roundHalfUp(Number(inp.employment_years_input) * DAYS_PER_YEAR);
  f.DAYS_EMPLOYED = daysEmployed;
  f.employment_years = daysEmployed === EMPLOYMENT_SENTINEL ? NaN : -daysEmployed / DAYS_PER_YEAR;

  f.AMT_GOODS_PRICE = isMissing(inp.goods_price) ? NaN : Number(inp.goods_price);

  if (noHistory) {
    f.BUR_debt_sum = NaN; f.BUR_credit_sum = NaN; f.BUR_debt_to_credit = NaN; f.BUR_days_since_recent_credit = NaN;
  } else {
    const debt = isMissing(inp.bureau_debt_sum) ? NaN : Number(inp.bureau_debt_sum);
    const credit = Number(inp.bureau_credit_sum);
    f.BUR_debt_sum = debt; f.BUR_credit_sum = credit;
    f.BUR_debt_to_credit = credit > 0 && !Number.isNaN(debt) ? debt / credit : NaN;
    f.BUR_days_since_recent_credit = isMissing(inp.days_since_recent_credit) ? NaN : Number(inp.days_since_recent_credit);
  }

  f.OCCUPATION_TYPE = isMissing(inp.occupation) ? null : inp.occupation;
  f.DAYS_BIRTH = -roundHalfUp(Number(inp.age_input) * DAYS_PER_YEAR);
  f.age_years = -f.DAYS_BIRTH / DAYS_PER_YEAR;
  f.ORGANIZATION_TYPE = isMissing(inp.organisation) ? null : inp.organisation;
  f.NAME_EDUCATION_TYPE = isMissing(inp.education) ? null : inp.education;
  f.DAYS_LAST_PHONE_CHANGE = isMissing(inp.days_since_phone_change) ? NaN : -Number(inp.days_since_phone_change);
  f.REGION_RATING_CLIENT_W_CITY = isMissing(inp.region_rating) ? NaN : Number(inp.region_rating);
  f.FLOORSMAX_MEDI = isMissing(inp.floors_max) ? NaN : Number(inp.floors_max);
  return f;
}

// One characteristic value -> attribute label, following the contract's binning rules
export function assignBin(contract, ch, value, noHistory) {
  const sp = contract.special_bins;
  if (ch.type === 'numeric') {
    if (isMissing(value)) return ch.bureau_field && noHistory ? sp.no_history : sp.missing;
    let i = 0;
    while (i < ch.edges.length && !(value <= ch.edges[i])) i += 1;   // right-inclusive (lower, upper]
    return ch.bin_labels[i];
  }
  if (isMissing(value)) return ch.bureau_field && noHistory ? sp.no_history : sp.missing;
  const key = String(value);
  return Object.prototype.hasOwnProperty.call(ch.groups, key) ? ch.groups[key] : sp.unseen;
}

export function bandOf(contract, score) {
  const { band_edges: edges, band_labels: labels } = contract.pricing;
  for (let i = 0; i < labels.length; i += 1) {
    const lo = edges[i] === null ? -Infinity : edges[i];
    const hi = edges[i + 1] === null ? Infinity : edges[i + 1];
    if (score >= lo && score < hi) return labels[i];                 // left-inclusive [lower, upper)
  }
  return labels[labels.length - 1];
}

export function repayment(principal, annualRate, months) {
  const r = annualRate / 12;
  const payment = r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months);
  let balance = principal; let totalInterest = 0;
  for (let m = 0; m < months; m += 1) {              // same loop as the notebook's schedule()
    const interest = balance * r;
    totalInterest += interest;
    balance = balance * (1 + r) - payment;
  }
  return { payment, totalInterest, totalRepaid: payment * months };
}

// Input checks: impossible values are errors; values the model handles through end bins are allowed
export function validateInputs(contract, inp) {
  const errors = []; const warnings = [];
  const num = (v) => (isMissing(v) ? null : Number(v));
  const byName = Object.fromEntries(contract.characteristics.map((c) => [c.name, c]));
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  const age = num(inp.age_input);
  need(age !== null, 'Age is required (the model has no rule for a missing age).');
  if (age !== null) {
    need(age >= 18 && age <= 100, 'Age must be between 18 and 100.');
    const pop = contract.population;
    if (age < pop.age_min || age > pop.age_max) warnings.push(`Age is outside the modelled population (${pop.age_min}-${pop.age_max}); the score is outside the evidence base.`);
  }
  if (!inp.not_employed) {
    const yrs = num(inp.employment_years_input);
    need(yrs !== null && yrs >= 0, 'Years in current job must be zero or more (or mark the applicant as not employed).');
    if (yrs !== null && age !== null && yrs > age - 14) errors.push('Years in current job cannot exceed age minus 14.');
  }
  const ext = num(inp.ext_source_1);
  if (ext !== null) need(ext >= 0 && ext <= 1, 'External score must be between 0 and 1.');
  const goods = num(inp.goods_price);
  if (goods !== null) need(goods > 0, 'Goods price must be positive.');
  const floors = num(inp.floors_max);
  if (floors !== null) need(floors >= 0 && floors <= 1, 'Building height is a normalised value between 0 and 1.');
  const phone = num(inp.days_since_phone_change);
  need(phone !== null || byName.DAYS_LAST_PHONE_CHANGE.missing_supported, 'Days since phone change is required (the model has no rule for a missing value).');
  if (phone !== null) need(phone >= 0, 'Days since phone change cannot be negative.');
  need(!isMissing(inp.region_rating), 'Region rating is required.');
  need(!isMissing(inp.organisation) || byName.ORGANIZATION_TYPE.missing_supported, 'Employer type is required (the model has no rule for a missing value).');
  need(!isMissing(inp.education) || byName.NAME_EDUCATION_TYPE.missing_supported, 'Education is required (the model has no rule for a missing value).');

  if (!inp.no_bureau_history) {
    const credit = num(inp.bureau_credit_sum); const debt = num(inp.bureau_debt_sum); const days = num(inp.days_since_recent_credit);
    need(credit !== null && credit >= 0, 'Total bureau credit must be zero or more.');
    if (debt !== null) need(debt >= 0, 'Outstanding bureau debt cannot be negative.');
    need(days !== null && days >= 0, 'Days since most recent bureau credit is required and cannot be negative.');
    if (credit === 0) warnings.push('Total bureau credit is zero, so debt-to-credit is undefined and falls in the Missing attribute.');
  }
  const principal = num(inp.principal);
  need(principal !== null && principal > 0, 'Requested principal must be positive.');
  return { errors, warnings };
}

export function scoreApplicant(contract, inp) {
  const features = deriveFeatures(inp);
  const { intercept, n_characteristics: n } = contract.model;
  const { factor, offset } = contract.scaling;
  let z = intercept;
  const rows = contract.characteristics.map((ch) => {
    const value = features[ch.name];
    const bin = assignBin(contract, ch, value, features.no_bureau_history === 1);
    const attr = ch.attributes.find((a) => a.label === bin);
    if (!attr) return { name: ch.name, label: ch.label, value, bin, unsupported: true };
    z += ch.coefficient * attr.woe;
    return { name: ch.name, label: ch.label, value, bin, woe: attr.woe, coefficient: ch.coefficient,
             pointsUnrounded: attr.points_unrounded, points: attr.points, special: attr.special };
  });
  if (rows.some((r) => r.unsupported)) return { features, rows, unsupported: rows.filter((r) => r.unsupported).map((r) => r.name) };

  const score = offset - factor * z;
  const pBad = 1 / (1 + Math.exp((score - offset) / factor));
  const roundedTotal = rows.reduce((s, r) => s + r.points, 0);
  const unroundedTotal = rows.reduce((s, r) => s + r.pointsUnrounded, 0);
  const approved = score >= contract.policy.cutoff;
  const band = bandOf(contract, score);
  let offer = null;
  if (approved) {
    const rate = contract.pricing.rates[band];
    const principal = Number(inp.principal);
    offer = { band, rate, principal, months: contract.pricing.term_months, ...repayment(principal, rate, contract.pricing.term_months) };
  }
  return { features, rows, z, score, unroundedTotal, roundedTotal, pBad, approved, band, offer, n };
}

"""Offline export of dashboard artifacts from the authoritative scorecard notebook.

Runs every code cell of ../Home_Improvement_Credit_Scorecard.ipynb in a fresh namespace (the
notebook is the single source of truth), then writes:

    data/model_contract.json        final scorecard rules (drives browser scoring)
    data/dashboard_aggregates.json  aggregate portfolio, policy, pricing and monitoring results
    data/synthetic_profiles.json    synthetic applicant inputs (outcomes are computed in the browser)
    tests/parity_fixtures.json      synthetic inputs with Python-computed expected outcomes
    tests/verification_report.json  aggregate results of the private row-level checks

Only rules, aggregates and synthetic records are written. Row-level data never leaves Python.

Usage (from the repository root or this folder):
    python "illustrative demo/export_dashboard_data.py"
"""
import contextlib
import hashlib
import io
import json
import math
import os
import subprocess
import sys
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent
REPO_DIR = DEMO_DIR.parent
NOTEBOOK = REPO_DIR / 'Home_Improvement_Credit_Scorecard.ipynb'
DATA_DIR = DEMO_DIR / 'data'
TEST_DIR = DEMO_DIR / 'tests'

# fixed transformation constants shared with the browser engine (src/engine.js)
DAYS_PER_YEAR = 365.25
EMPLOYMENT_SENTINEL = 365243


# ---------------------------------------------------------------- run the notebook
def run_notebook():
    """Execute the notebook's code cells in order and return the resulting namespace."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    nb = json.loads(NOTEBOOK.read_text(encoding='utf-8'))
    namespace = {'display': lambda *a, **k: None, '__name__': '__notebook__'}
    previous_cwd = os.getcwd()
    os.chdir(REPO_DIR)
    try:
        for i, cell in enumerate(nb['cells']):
            if cell['cell_type'] != 'code':
                continue
            source = ''.join(cell['source']) if isinstance(cell['source'], list) else cell['source']
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(source, f'notebook_cell_{i}', 'exec'), namespace)
            plt.close('all')
    finally:
        os.chdir(previous_cwd)
    return namespace


# ---------------------------------------------------------------- helpers
def clean(value):
    """JSON-safe conversion with full precision; NaN and infinities become None."""
    import numpy as np
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        v = float(value)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def records(df, index_name=None):
    out = df.reset_index()
    if index_name:
        out = out.rename(columns={out.columns[0]: index_name})
    return clean(out.to_dict(orient='records'))


def git_commit():
    try:
        return subprocess.check_output(['git', '-C', str(REPO_DIR), 'rev-parse', '--short', 'HEAD'], text=True).strip()
    except Exception:
        return None


# ---------------------------------------------------------------- characteristic metadata (meaning + input mapping)
CHARACTERISTIC_INFO = {
    'EXT_SOURCE_1': {'label': 'External score', 'description': 'Normalised score from an external data source (0 to 1).',
                     'input': {'kind': 'number', 'field': 'ext_source_1', 'min': 0, 'max': 1, 'step': 0.01, 'unit': 'score 0-1',
                               'allow_missing': True, 'missing_label': 'Not reported'},
                     'transform': 'EXT_SOURCE_1 = entered score'},
    'employment_years': {'label': 'Years in current job', 'description': 'Length of current employment. Not employed (pensioners, unemployed) maps to Missing.',
                         'input': {'kind': 'number', 'field': 'employment_years_input', 'min': 0, 'max': 60, 'step': 0.1, 'unit': 'years',
                                   'allow_missing': True, 'missing_label': 'Not currently employed'},
                         'transform': 'DAYS_EMPLOYED = -round(years x 365.25); employment_years = -DAYS_EMPLOYED / 365.25 (not employed: sentinel 365243 -> missing)'},
    'AMT_GOODS_PRICE': {'label': 'Goods price financed', 'description': 'Price of the goods the loan finances (dataset currency units).',
                        'input': {'kind': 'number', 'field': 'goods_price', 'min': 0, 'max': None, 'step': 1000, 'unit': 'dataset currency units',
                                  'allow_missing': True, 'missing_label': 'Not reported'},
                        'transform': 'AMT_GOODS_PRICE = entered amount'},
    'BUR_debt_to_credit': {'label': 'Bureau debt-to-credit', 'description': 'Outstanding bureau debt divided by total bureau credit (currency 1 records only).',
                           'input': {'kind': 'bureau_ratio', 'fields': ['bureau_debt_sum', 'bureau_credit_sum'], 'unit': 'dataset currency units',
                                     'allow_missing': True, 'missing_label': 'Debt amount not reported'},
                           'transform': 'BUR_debt_to_credit = BUR_debt_sum / BUR_credit_sum if BUR_credit_sum > 0, else missing'},
    'BUR_days_since_recent_credit': {'label': 'Days since most recent bureau credit', 'description': 'Days between the most recent bureau credit opening and the application.',
                                     'input': {'kind': 'number', 'field': 'days_since_recent_credit', 'min': 0, 'max': 2922, 'step': 1, 'unit': 'days',
                                               'allow_missing': False},
                                     'transform': 'BUR_days_since_recent_credit = -max(DAYS_CREDIT) = entered days'},
    'OCCUPATION_TYPE': {'label': 'Occupation', 'description': 'Occupation category reported on the application.',
                        'input': {'kind': 'category', 'field': 'occupation', 'allow_missing': True, 'missing_label': 'Not reported'},
                        'transform': 'OCCUPATION_TYPE = selected level'},
    'age_years': {'label': 'Age', 'description': 'Age at application.',
                  'input': {'kind': 'number', 'field': 'age_input', 'min': 18, 'max': 100, 'step': 1, 'unit': 'years', 'allow_missing': False},
                  'transform': 'DAYS_BIRTH = -round(age x 365.25); age_years = -DAYS_BIRTH / 365.25'},
    'ORGANIZATION_TYPE': {'label': 'Employer type', 'description': 'Type of organisation the applicant works for (XNA = not employed).',
                          'input': {'kind': 'category', 'field': 'organisation', 'allow_missing': True, 'missing_label': 'Not reported'},
                          'transform': 'ORGANIZATION_TYPE = selected level'},
    'NAME_EDUCATION_TYPE': {'label': 'Education', 'description': 'Highest level of education achieved.',
                            'input': {'kind': 'category', 'field': 'education', 'allow_missing': True, 'missing_label': 'Not reported'},
                            'transform': 'NAME_EDUCATION_TYPE = selected level'},
    'DAYS_LAST_PHONE_CHANGE': {'label': 'Days since phone number changed', 'description': 'How long before the application the phone number was last changed.',
                               'input': {'kind': 'number', 'field': 'days_since_phone_change', 'min': 0, 'max': 5000, 'step': 1, 'unit': 'days',
                                         'allow_missing': True, 'missing_label': 'Not reported'},
                               'transform': 'DAYS_LAST_PHONE_CHANGE = -entered days'},
    'REGION_RATING_CLIENT_W_CITY': {'label': 'Region rating (with city)', 'description': "Lender's rating of the applicant's region, 1 (best) to 3, taking the city into account.",
                                    'input': {'kind': 'category', 'field': 'region_rating', 'numeric_levels': True, 'allow_missing': False},
                                    'transform': 'REGION_RATING_CLIENT_W_CITY = selected rating'},
    'FLOORSMAX_MEDI': {'label': 'Building height (normalised)', 'description': "Normalised maximum number of floors of the applicant's building (median statistic, 0 to 1).",
                       'input': {'kind': 'number', 'field': 'floors_max', 'min': 0, 'max': 1, 'step': 0.01, 'unit': 'normalised 0-1',
                                 'allow_missing': True, 'missing_label': 'Not reported'},
                       'transform': 'FLOORSMAX_MEDI = entered value'},
}


def input_to_features(inp):
    """Synthetic UI inputs -> model characteristics. Mirrors src/engine.js deriveFeatures() exactly."""
    nan = float('nan')
    f = {}
    no_history = bool(inp.get('no_bureau_history'))
    f['no_bureau_history'] = 1 if no_history else 0
    f['EXT_SOURCE_1'] = nan if inp.get('ext_source_1') is None else float(inp['ext_source_1'])
    if inp.get('not_employed'):
        days_employed = EMPLOYMENT_SENTINEL
    else:
        days_employed = -math.floor(float(inp['employment_years_input']) * DAYS_PER_YEAR + 0.5)
    f['DAYS_EMPLOYED'] = days_employed
    f['employment_years'] = nan if days_employed == EMPLOYMENT_SENTINEL else -days_employed / DAYS_PER_YEAR
    f['AMT_GOODS_PRICE'] = nan if inp.get('goods_price') is None else float(inp['goods_price'])
    if no_history:
        f['BUR_debt_sum'] = f['BUR_credit_sum'] = f['BUR_debt_to_credit'] = f['BUR_days_since_recent_credit'] = nan
    else:
        debt = nan if inp.get('bureau_debt_sum') is None else float(inp['bureau_debt_sum'])
        credit = float(inp['bureau_credit_sum'])
        f['BUR_debt_sum'], f['BUR_credit_sum'] = debt, credit
        f['BUR_debt_to_credit'] = debt / credit if (credit > 0 and not math.isnan(debt)) else nan
        f['BUR_days_since_recent_credit'] = float(inp['days_since_recent_credit'])
    f['OCCUPATION_TYPE'] = inp.get('occupation')
    f['DAYS_BIRTH'] = -math.floor(float(inp['age_input']) * DAYS_PER_YEAR + 0.5)
    f['age_years'] = -f['DAYS_BIRTH'] / DAYS_PER_YEAR
    f['ORGANIZATION_TYPE'] = inp.get('organisation')
    f['NAME_EDUCATION_TYPE'] = inp.get('education')
    f['DAYS_LAST_PHONE_CHANGE'] = nan if inp.get('days_since_phone_change') is None else -float(inp['days_since_phone_change'])
    f['REGION_RATING_CLIENT_W_CITY'] = float(inp['region_rating'])
    f['FLOORSMAX_MEDI'] = nan if inp.get('floors_max') is None else float(inp['floors_max'])
    return f


def main():
    import numpy as np
    import pandas as pd

    print('Executing the notebook (a few minutes)...')
    ns = run_notebook()
    print('Notebook executed.')

    final_pipe, final_vars, final_model = ns['final_pipe'], ns['final_vars'], ns['final_model']
    specs, maps = final_pipe['specs'], final_pipe['maps']
    FACTOR, OFFSET = ns['FACTOR'], ns['OFFSET']
    POLICY_CUTOFF, ASSUME = ns['POLICY_CUTOFF'], ns['ASSUME']
    MISSING, NO_HISTORY, UNSEEN = ns['MISSING'], ns['NO_HISTORY'], ns['UNSEEN']
    final_scorecard = ns['final_scorecard']
    bin_labels, assign_bins = ns['bin_labels'], ns['assign_bins']
    final_scores, band_of, schedule, portfolio = ns['final_scores'], ns['band_of'], ns['schedule'], ns['portfolio']
    TARGET = ns['TARGET']
    dev_train, validation, test = ns['dev_train'], ns['validation'], ns['test']
    assert set(final_vars) == set(CHARACTERISTIC_INFO), 'dashboard input mapping must cover exactly the final characteristics'

    nb_hash = hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest()[:12]
    version = {'model_version': f'HI-scorecard final (tuned, {len(final_vars)} characteristics)',
               'notebook': NOTEBOOK.name, 'notebook_sha256_12': nb_hash, 'git_commit': git_commit(),
               'fitted_on': 'dev_train', 'policy_selected_on': 'validation', 'evaluated_once_on': 'test'}

    # ------------------------------------------------------------ model contract
    coef = dict(zip(final_vars, final_model.coef_[0]))
    intercept = float(final_model.intercept_[0])
    n = len(final_vars)
    characteristics = []
    for var in final_vars:
        spec = specs[var]
        rows = final_scorecard[final_scorecard['Variable'] == var]
        attributes = []
        for _, r in rows.iterrows():
            attributes.append({'label': r['Attribute / Bin'], 'woe': float(r['WOE']),
                               'points_unrounded': float(r['Points (unrounded)']), 'points': int(r['Points']),
                               'special': r['Attribute / Bin'] in (MISSING, NO_HISTORY, UNSEEN)})
        entry = {'name': var, **{k: v for k, v in CHARACTERISTIC_INFO[var].items()},
                 'coefficient': float(coef[var]), 'type': spec['type'], 'attributes': attributes,
                 'bureau_field': var.startswith('BUR_')}
        if spec['type'] == 'numeric':
            entry['edges'] = [float(e) for e in spec['edges']]
            entry['bin_labels'] = bin_labels(spec)
            entry['discrete'] = bool(spec.get('discrete', False))
            entry['boundary_rule'] = 'right-inclusive: (lower, upper]; outer bins open-ended'
            if entry['discrete']:
                entry['levels'] = [float(x) for x in spec['levels']]
        else:
            entry['groups'] = {str(level): label for level, label in spec['groups'].items()}
            entry['boundary_rule'] = 'level -> group; level not seen in dev_train -> Unseen (WOE 0)'
        labels = {x['label'] for x in attributes}
        entry['missing_supported'] = MISSING in labels
        entry['no_history_supported'] = NO_HISTORY in labels
        entry['input'] = {**entry['input'], 'allow_missing': bool(entry['input'].get('allow_missing')) and MISSING in labels}
        characteristics.append(entry)

    contract = {
        'version': version,
        'target': {'name': TARGET, 'event': 1, 'event_label': 'payment difficulties',
                   'definition': 'TARGET = 1: payment more than X days late on at least one of the first Y instalments (X, Y not disclosed). Early payment difficulty, not a confirmed default or loss.',
                   'probability_label': 'Estimated probability of payment difficulties (TARGET = 1)'},
        'population': {'description': 'Applicants who own a house or flat (FLAG_OWN_REALTY = Y) aged 25-65 (proxy for home-improvement borrowers).',
                       'age_min': 25, 'age_max': 65},
        'special_bins': {'missing': MISSING, 'no_history': NO_HISTORY, 'unseen': UNSEEN,
                         'rules': ['Missing value -> Missing bin',
                                   'BUR_ characteristics: missing value with no bureau record -> No bureau history bin',
                                   'Categorical level not seen in dev_train -> Unseen bin with WOE 0']},
        'model': {'intercept': intercept, 'n_characteristics': n, 'calibration': 'none (unweighted logistic regression, calibrated on dev_train)',
                  'regularisation': 'L2, C = 1.0 (scikit-learn lbfgs)'},
        'scaling': {'target_score': ns['TARGET_SCORE'], 'target_odds_good_bad': ns['TARGET_ODDS'], 'pdo': ns['PDO'],
                    'factor': float(FACTOR), 'offset': float(OFFSET),
                    'points_formula': 'points_ij = Factor x (-(beta_i x WOE_ij + beta_0 / n)) + Offset / n',
                    'score_formula': 'score = Offset - Factor x z, z = beta_0 + sum(beta_i x WOE_i)',
                    'probability_formula': 'p = 1 / (1 + exp((score - Offset) / Factor))',
                    'rounding': 'Each attribute rounded to the nearest whole point for display; the decision uses the exact (unrounded) score'},
        'policy': {'cutoff': int(POLICY_CUTOFF), 'operator': '>=', 'score_used': 'exact (unrounded)',
                   'rule': f'Approve if exact score >= {POLICY_CUTOFF}',
                   'basis': 'Lowest cutoff whose accepted observed bad rate on validation is at most 6% (risk-appetite assumption)',
                   'risk_limit': float(ns['RISK_LIMIT'])},
        'pricing': {'band_edges': [None if not np.isfinite(e) else float(e) for e in ns['SCORE_BANDS']],
                    'band_labels': list(ns['band_labels']), 'band_rule': 'left-inclusive: [lower, upper)',
                    'rates': {b: float(r) for b, r in ns['offered_rate'].items()},
                    'term_months': int(ASSUME['term_months']), 'standard_principal': float(ASSUME['principal']),
                    'repayment': 'Equal monthly instalments; monthly rate = annual rate / 12',
                    'fees': 'No fees are modelled in the notebook',
                    'units': 'Dataset currency units (currency not stated in the data dictionary). Term and principal are hypothetical.'},
        'characteristics': characteristics,
        'known_gaps': [f"{c['name']}: the frozen model has no Missing attribute (no missing values in dev_train), so a missing value cannot be scored; the input requires a value."
                       for c in characteristics if not c['missing_supported']],
    }

    # consistency of the contract itself: unrounded points sum to the score formula
    for c in characteristics:
        for a in c['attributes']:
            expected = FACTOR * (-(c['coefficient'] * a['woe'] + intercept / n)) + OFFSET / n
            assert abs(expected - a['points_unrounded']) < 1e-9

    # ------------------------------------------------------------ private row-level parity (contract maths vs notebook)
    def contract_score(df):
        z = np.full(len(df), intercept)
        for c in characteristics:
            labels = assign_bins(df, c['name'], specs[c['name']])
            woe = labels.map({a['label']: a['woe'] for a in c['attributes']}).astype(float).values
            z += c['coefficient'] * woe
        return OFFSET - FACTOR * z

    verification = {'version': version, 'checks': []}
    for name, df in [('dev_train', dev_train), ('validation', validation), ('test', test)]:
        ref = final_scores(df)
        mine = contract_score(df)
        diff = float(np.max(np.abs(mine - ref['score'].values)))
        same_decisions = bool(((mine >= POLICY_CUTOFF) == (ref['score'].values >= POLICY_CUTOFF)).all())
        verification['checks'].append({'check': f'contract score vs notebook final_scores ({name})', 'rows': len(df),
                                       'max_abs_score_difference': diff, 'identical_decisions': same_decisions,
                                       'passed': diff < 1e-8 and same_decisions})

    # ------------------------------------------------------------ aggregates
    y_valid, y_test = validation[TARGET].values, test[TARGET].values
    v_scores, t_scores = ns['final_valid_scores'], ns['final_test_scores']

    def provenance(partition, status, extra=None):
        return {'model_version': version['model_version'], 'partition': partition, 'status': status, **(extra or {})}

    money_basis = {'units': 'dataset currency units', 'horizon': f"{ASSUME['term_months']}-month life of a hypothetical standard loan of {ASSUME['principal']:,.0f}",
                   'scale': f"per {ASSUME['applicants']:,} applicants"}

    def portfolio_full(scores, y, approve, assumptions):
        res = portfolio(scores, y, approve, assumptions)
        res['Funding and operating costs'] = res['Interest revenue'] - res['Credit losses'] - res['Net contribution (after funding and operating cost)']
        return clean(res)

    approve_test = (t_scores['score'] >= POLICY_CUTOFF).values
    test_bands = band_of(t_scores['score']).astype(str)
    band_table = pd.DataFrame({'applicants': test_bands.value_counts().reindex(ns['band_labels']).fillna(0).astype(int),
                               'observed_bad_rate': pd.Series(y_test, index=t_scores.index).groupby(test_bands).mean().reindex(ns['band_labels']),
                               'mean_predicted_p_bad': t_scores['p_bad'].groupby(test_bands).mean().reindex(ns['band_labels'])})
    portfolio_overview = {
        'provenance': provenance('test (held out, evaluated once)', 'observed outcomes; hypothetical approvals and projected economics'),
        'test_applicants': int(len(test)),
        'approvals': int(approve_test.sum()),
        'approval_rate': float(approve_test.mean()),
        'approved_principal_actual_amt_credit': float(test.loc[approve_test, 'AMT_CREDIT'].sum()),
        'approved_principal_note': 'Sum of AMT_CREDIT (requested credit amount) of test applications the frozen policy would approve. Hypothetical: no loans were issued.',
        'take_up': float(ASSUME['take_up']),
        'funded_principal_actual_amt_credit': float(test.loc[approve_test, 'AMT_CREDIT'].sum() * ASSUME['take_up']),
        'mean_predicted_p_bad_approved': float(t_scores.loc[approve_test, 'p_bad'].mean()),
        'observed_bad_rate_approved': float(y_test[approve_test].mean()),
        'observed_bad_rate_all': float(y_test.mean()),
        'economics_policy': portfolio_full(t_scores, y_test, approve_test, ASSUME),
        'economics_approve_all': portfolio_full(t_scores, y_test, np.ones(len(y_test), dtype=bool), ASSUME),
        'economics_basis': money_basis,
        'score_bands': records(band_table, 'band'),
        'performance': records(ns['final_perf'], 'partition'),
        'performance_note': f'Good payer = positive class (lecture convention). Measures at the policy cutoff {POLICY_CUTOFF}. Training = dev_train.',
    }

    cutoff_rows = []
    for c in ns['cutoff_grid']:
        approve = (v_scores['score'] >= c).values
        econ = portfolio_full(v_scores, y_valid, approve, ASSUME)
        row = ns['valid_cutoffs'].loc[c]
        cutoff_rows.append(clean({'cutoff': int(c), 'approved': int(approve.sum()), 'approval_rate': approve.mean(),
                                  'approved_principal_actual_amt_credit': validation.loc[approve, 'AMT_CREDIT'].sum(),
                                  'accepted_bad_rate_observed': y_valid[approve].mean(),
                                  'mean_predicted_p_bad_approved': v_scores.loc[approve, 'p_bad'].mean(),
                                  'boundary_good_bad_odds': row['Boundary good:bad odds'], 'boundary_pd': row['Boundary PD %'] / 100,
                                  'economics': econ}))
    approve_all_valid = portfolio_full(v_scores, y_valid, np.ones(len(y_valid), dtype=bool), ASSUME)
    scenarios = []
    for name, change in ns['scenarios']:
        a = {**ASSUME, **change}
        scenarios.append({'name': name, 'changes': clean(change),
                          'policy': portfolio_full(v_scores, y_valid, (v_scores['score'] >= POLICY_CUTOFF).values, a),
                          'approve_all': portfolio_full(v_scores, y_valid, np.ones(len(y_valid), dtype=bool), a)})
    policy_comparison = {
        'provenance': provenance('validation (policy selection)', 'observed outcomes; projected economics under stated assumptions'),
        'recommended_cutoff': int(POLICY_CUTOFF), 'risk_limit': float(ns['RISK_LIMIT']),
        'validation_applicants': int(len(validation)),
        'cutoffs': cutoff_rows, 'approve_all': {'approved': int(len(validation)), 'approval_rate': 1.0,
                                                'approved_principal_actual_amt_credit': float(validation['AMT_CREDIT'].sum()),
                                                'accepted_bad_rate_observed': float(y_valid.mean()),
                                                'mean_predicted_p_bad_approved': float(v_scores['p_bad'].mean()),
                                                'economics': approve_all_valid},
        'economics_basis': money_basis,
        'reasoning': ['The cutoff is the lowest score whose approved validation population has an observed payment-difficulty rate of at most 6% (stated risk appetite).',
                      'Under the base assumptions every score band is priced to break even plus a margin, so approving everyone projects a higher net contribution than the cutoff.',
                      'The extra contribution below the cutoff depends on the most uncertain assumptions: how many payment difficulties become losses, and whether higher rates can be charged without adverse selection. If all payment difficulties became losses, the cutoff would project more than approve-all.'],
        'scenarios': scenarios,
        'test_evaluation': {'provenance': provenance('test (held out, evaluated once)', 'frozen model and policy'),
                            'policy': portfolio_overview['economics_policy'], 'approve_all': portfolio_overview['economics_approve_all']},
    }
    pricing_table = ns['pricing'].copy()
    pricing = {'provenance': provenance('validation (risk estimates)', 'illustrative break-even rates under hypothetical loan terms'),
               'assumptions': clean(ASSUME), 'bands': records(pricing_table, 'band'),
               'method': 'Lowest annual rate at which (1 - q) x G(r) + q x L(r) covers the target margin; q = mean predicted probability x 0.5 (share of payment difficulties that become losses). G = performing-loan contribution after funding and operating cost; L = contribution if a loss occurs at mid-term (75% of outstanding balance lost). Rounded up to 0.25%, capped at 36%.',
               'not_optimal_note': 'Rates are break-even prices, not optimal prices: no price-response or take-up data exist.'}

    # monitoring
    edges = ns['decile_edges']
    to_decile = lambda s: pd.cut(s, bins=[-np.inf, *edges, np.inf], labels=False)
    ref_dec = to_decile(ns['final_train_scores']['score']).value_counts(normalize=True).sort_index()
    cur_dec = to_decile(t_scores['score']).value_counts(normalize=True).reindex(ref_dec.index).fillna(0)
    decile_labels = [f'<= {edges[0]:.1f}'] + [f'({a:.1f}, {b:.1f}]' for a, b in zip(edges[:-1], edges[1:])] + [f'> {edges[-1]:.1f}']
    features = []
    for var in final_vars:
        r = assign_bins(dev_train, var, specs[var]).value_counts(normalize=True)
        cshare = assign_bins(test, var, specs[var]).value_counts(normalize=True).reindex(r.index).fillna(0)
        order = [a['label'] for a in next(c for c in characteristics if c['name'] == var)['attributes'] if a['label'] in r.index]
        features.append({'name': var, 'label': CHARACTERISTIC_INFO[var]['label'], 'psi': float(ns['psi_table'].loc[var].iloc[0]),
                         'bins': order, 'reference': [float(r[b]) for b in order], 'comparison': [float(cshare[b]) for b in order]})
    monitoring = {
        'provenance': provenance('dev_train (reference) vs test (comparison)', 'sample-distribution comparison from the same period'),
        'reference_population': f'dev_train ({len(dev_train):,} applications)', 'comparison_population': f'test ({len(test):,} applications)',
        'formula': 'PSI = sum((comparison share - reference share) x ln(comparison share / reference share))',
        'smoothing': 'Shares floored at 0.0001 before the logarithm',
        'thresholds': {'stable_below': 0.1, 'significant_above': 0.25,
                       'source': 'Common industry rule of thumb quoted in the notebook (not a course requirement)'},
        'score': {'psi': float(ns['psi_table'].loc['Total score (deciles)'].iloc[0]), 'bins': decile_labels,
                  'reference': [float(x) for x in ref_dec.values], 'comparison': [float(x) for x in cur_dec.values],
                  'binning': 'Score deciles of dev_train (frozen edges)'},
        'features': features,
        'simulated_future': None,
        'simulated_future_note': 'Not available from the current analysis: the notebook does not define a simulated future population.',
        'limitation': 'The data have no application dates, so no historical trend or genuine out-of-time monitoring is possible.',
    }

    aggregates = {'version': version, 'portfolio_overview': portfolio_overview, 'policy_comparison': policy_comparison,
                  'pricing': pricing, 'monitoring': monitoring, 'top15_iv': records(ns['top15_final'], 'characteristic'),
                  'segment': {'applications': int(len(ns['model_data'])), 'bad_rate': float(ns['model_data'][TARGET].mean()),
                              'partitions': {k: int(len(v)) for k, v in [('dev_train', dev_train), ('validation', validation), ('test', test)]}}}

    # ------------------------------------------------------------ aggregates vs the notebook's own result tables
    def agree(name, mine, theirs, tol=1e-6):
        ok = abs(float(mine) - float(theirs)) <= tol * max(1.0, abs(float(theirs)))
        verification['checks'].append({'check': name, 'dashboard': float(mine), 'notebook': float(theirs), 'passed': bool(ok)})

    tp = ns['test_portfolio']
    pol_row, all_row = tp.iloc[0], tp.iloc[1]
    for key in ['Approval %', 'Funded loans', 'Accepted bad rate % (observed)', 'Interest revenue', 'Credit losses',
                'Net contribution (after funding and operating cost)']:
        agree(f'test policy: {key} (Table 5.9c)', portfolio_overview['economics_policy'][key], pol_row[key])
        agree(f'test approve-all: {key} (Table 5.9c)', portfolio_overview['economics_approve_all'][key], all_row[key])
    agree('test approvals x 100 / applicants = Table 5.9c approval %', portfolio_overview['approval_rate'] * 100, pol_row['Approval %'])
    for row in cutoff_rows:
        vc = ns['valid_cutoffs'].loc[row['cutoff']]
        agree(f"validation cutoff {row['cutoff']}: approved (Table 5.7a)", row['approved'], vc['Approved'])
        agree(f"validation cutoff {row['cutoff']}: accepted bad rate (Table 5.7a)", row['accepted_bad_rate_observed'] * 100, vc['Accepted bad rate % (observed)'])
        agree(f"validation cutoff {row['cutoff']}: net contribution (Table 5.8d)", row['economics']['Net contribution (after funding and operating cost)'],
              ns['risk_based_grid'].loc[row['cutoff'], 'Net contribution'])
    sens = ns['sensitivity']
    for s in scenarios:
        agree(f"scenario '{s['name']}': policy net (Table 5.8e)", s['policy']['Net contribution (after funding and operating cost)'], sens.loc[s['name'], 'Scorecard policy'])
        agree(f"scenario '{s['name']}': approve-all net (Table 5.8e)", s['approve_all']['Net contribution (after funding and operating cost)'], sens.loc[s['name'], 'Approve all'])
    agree('score PSI (Table 5.10a)', monitoring['score']['psi'], ns['psi_table'].loc['Total score (deciles)'].iloc[0])
    for f in features:
        recomputed = sum((c - r) * math.log(c / r) for r, c in zip([max(x, 1e-4) for x in f['reference']], [max(x, 1e-4) for x in f['comparison']]))
        agree(f"PSI {f['name']}: recomputed from exported shares", recomputed, f['psi'], tol=1e-9)
    for c in characteristics:
        agree(f"{c['name']}: coefficient matches final model", c['coefficient'], coef[c['name']], tol=0)
    agree('characteristic count', len(characteristics), len(final_vars), tol=0)

    # ------------------------------------------------------------ synthetic profiles (inputs only)
    profiles = [
        {'id': 'approved', 'name': 'Approved example: established owner', 'kind': 'Approved',
         'inputs': {'age_input': 54, 'employment_years_input': 16, 'not_employed': False, 'ext_source_1': 0.75, 'goods_price': 950000,
                    'no_bureau_history': False, 'bureau_debt_sum': 150000, 'bureau_credit_sum': 1500000, 'days_since_recent_credit': 900,
                    'occupation': 'Core staff', 'organisation': 'School', 'education': 'Higher education', 'days_since_phone_change': 2600,
                    'region_rating': 1, 'floors_max': 0.33, 'principal': 500000}},
        {'id': 'borderline', 'name': 'Borderline example: mid-career owner', 'kind': 'Borderline',
         'inputs': {'age_input': 38, 'employment_years_input': 4, 'not_employed': False, 'ext_source_1': None, 'goods_price': 500000,
                    'no_bureau_history': False, 'bureau_debt_sum': 380000, 'bureau_credit_sum': 900000, 'days_since_recent_credit': 300,
                    'occupation': 'Sales staff', 'organisation': 'Business Entity Type 3', 'education': 'Secondary / secondary special',
                    'days_since_phone_change': 1000, 'region_rating': 2, 'floors_max': 0.17, 'principal': 400000}},
        {'id': 'rejected', 'name': 'Rejected example: recent borrower', 'kind': 'Rejected',
         'inputs': {'age_input': 28, 'employment_years_input': 1.5, 'not_employed': False, 'ext_source_1': 0.25, 'goods_price': 300000,
                    'no_bureau_history': False, 'bureau_debt_sum': 900000, 'bureau_credit_sum': 1000000, 'days_since_recent_credit': 30,
                    'occupation': 'Laborers', 'organisation': 'Self-employed', 'education': 'Secondary / secondary special',
                    'days_since_phone_change': 100, 'region_rating': 3, 'floors_max': None, 'principal': 300000}},
        {'id': 'thin_file', 'name': 'Retired owner without bureau history', 'kind': 'No bureau history',
         'inputs': {'age_input': 63, 'employment_years_input': 0, 'not_employed': True, 'ext_source_1': None, 'goods_price': 450000,
                    'no_bureau_history': True, 'bureau_debt_sum': None, 'bureau_credit_sum': None, 'days_since_recent_credit': None,
                    'occupation': None, 'organisation': 'Not employed (XNA)', 'education': 'Secondary / secondary special',
                    'days_since_phone_change': 1500, 'region_rating': 2, 'floors_max': None, 'principal': 450000}},
    ]

    # ------------------------------------------------------------ parity fixtures (synthetic) with notebook-computed outcomes
    supports_missing = {c['name']: c['missing_supported'] for c in characteristics}
    rng = np.random.default_rng(453)
    occupations = sorted(k for k in next(c for c in characteristics if c['name'] == 'OCCUPATION_TYPE')['groups'])
    organisations = sorted(k for k in next(c for c in characteristics if c['name'] == 'ORGANIZATION_TYPE')['groups'])
    educations = sorted(k for k in next(c for c in characteristics if c['name'] == 'NAME_EDUCATION_TYPE')['groups'])
    cases = [p['inputs'] for p in profiles]
    for _ in range(400):
        no_hist = rng.random() < 0.15
        not_emp = rng.random() < 0.15
        cases.append({
            'age_input': float(rng.integers(25, 66)), 'employment_years_input': round(float(rng.uniform(0, 40)), 1), 'not_employed': bool(not_emp),
            'ext_source_1': None if (supports_missing['EXT_SOURCE_1'] and rng.random() < 0.4) else round(float(rng.uniform(0, 1)), 3),
            'goods_price': None if (supports_missing['AMT_GOODS_PRICE'] and rng.random() < 0.02) else float(rng.integers(40, 400) * 5000),
            'no_bureau_history': bool(no_hist),
            'bureau_debt_sum': None if (no_hist or rng.random() < 0.05) else float(rng.integers(0, 300) * 5000),
            'bureau_credit_sum': None if no_hist else float(rng.choice([0, *rng.integers(1, 600, size=5) * 5000])),
            'days_since_recent_credit': None if no_hist else float(rng.integers(0, 2900)),
            'occupation': None if (supports_missing['OCCUPATION_TYPE'] and rng.random() < 0.25) else (str(rng.choice(occupations)) if rng.random() > 0.05 else 'Unlisted occupation'),
            'organisation': str(rng.choice(organisations)) if rng.random() > 0.05 else 'Unlisted employer type',
            'education': None if (supports_missing['NAME_EDUCATION_TYPE'] and rng.random() < 0.03) else str(rng.choice(educations)),
            'days_since_phone_change': None if (supports_missing['DAYS_LAST_PHONE_CHANGE'] and rng.random() < 0.02) else float(rng.integers(0, 4200)),
            'region_rating': float(rng.integers(1, 4)), 'floors_max': None if (supports_missing['FLOORSMAX_MEDI'] and rng.random() < 0.45) else round(float(rng.uniform(0, 1)), 4),
            'principal': float(rng.integers(10, 200) * 5000)})
    # boundary cases: every numeric edge exactly, and just above, for the characteristics entered directly
    direct = {'EXT_SOURCE_1': 'ext_source_1', 'AMT_GOODS_PRICE': 'goods_price', 'FLOORSMAX_MEDI': 'floors_max',
              'BUR_days_since_recent_credit': 'days_since_recent_credit'}
    base = dict(profiles[1]['inputs'])
    for c in characteristics:
        if c['name'] in direct and c['type'] == 'numeric':
            for e in c['edges']:
                for value in (e, float(np.nextafter(e, np.inf))):
                    cases.append({**base, direct[c['name']]: value})
        if c['name'] == 'DAYS_LAST_PHONE_CHANGE':
            for e in c['edges']:
                cases.append({**base, 'days_since_phone_change': -e})          # raw value exactly at the edge
                cases.append({**base, 'days_since_phone_change': -e - 1})      # one day further back
        if c['name'] == 'BUR_debt_to_credit':
            for e in c['edges']:
                cases.append({**base, 'bureau_credit_sum': 1_000_000.0, 'bureau_debt_sum': e * 1_000_000.0})
    cases.append({**base, 'bureau_credit_sum': 0.0})       # zero credit: ratio undefined -> Missing
    cases.append({**base, 'bureau_debt_sum': 0.0})         # legitimate zero debt
    cases.append({**base, 'bureau_debt_sum': None})        # debt not reported -> Missing

    feature_rows = pd.DataFrame([input_to_features(c) for c in cases])
    scored = final_scores(feature_rows)
    fixtures = []
    for i, case in enumerate(cases):
        row = feature_rows.iloc[[i]]
        bins = {c['name']: assign_bins(row, c['name'], specs[c['name']]).iloc[0] for c in characteristics}
        lookup = {c['name']: {a['label']: a for a in c['attributes']} for c in characteristics}
        points = {v: lookup[v][b]['points'] for v, b in bins.items()}
        score = float(scored['score'].iloc[i])
        approved = score >= POLICY_CUTOFF
        band = str(band_of(pd.Series([score])).astype(str).iloc[0])
        rate = float(ns['offered_rate'][band])
        principal = float(case['principal'])
        months = int(ASSUME['term_months'])
        r = rate / 12
        payment = principal * r / (1 - (1 + r) ** -months)
        balances, interest = schedule(principal, rate, months)
        fixtures.append(clean({'inputs': case, 'expected': {
            'features': {k: feature_rows.iloc[i][k] for k in final_vars + ['no_bureau_history']},
            'bins': bins, 'points': points, 'rounded_total': int(sum(points.values())),
            'score': score, 'p_bad': float(scored['p_bad'].iloc[i]), 'approved': bool(approved), 'band': band,
            'rate': rate if approved else None, 'monthly_payment': payment if approved else None,
            'total_interest': float(interest.sum()) if approved else None}}))
    # cutoff equality checks on the decision rule itself
    decision_checks = [{'score': s, 'approved': bool(s >= POLICY_CUTOFF)} for s in
                       [POLICY_CUTOFF - 1e-9, float(POLICY_CUTOFF), POLICY_CUTOFF + 1e-9]]
    band_checks = [{'score': float(e) + d, 'band': str(band_of(pd.Series([float(e) + d])).astype(str).iloc[0])}
                   for e in ns['SCORE_BANDS'][1:-1] for d in (-1e-9, 0.0)]

    # ------------------------------------------------------------ write
    DATA_DIR.mkdir(exist_ok=True)
    TEST_DIR.mkdir(exist_ok=True)
    (DATA_DIR / 'model_contract.json').write_text(json.dumps(clean(contract), indent=1), encoding='utf-8')
    (DATA_DIR / 'dashboard_aggregates.json').write_text(json.dumps(clean(aggregates), indent=1), encoding='utf-8')
    (DATA_DIR / 'synthetic_profiles.json').write_text(json.dumps(clean({'note': 'Synthetic inputs only. Not real applicants. Outcomes are computed by the scoring engine.',
                                                                     'profiles': profiles}), indent=1), encoding='utf-8')
    (TEST_DIR / 'parity_fixtures.json').write_text(json.dumps({'version': version, 'cases': fixtures, 'decision_checks': decision_checks,
                                                               'band_checks': band_checks}, indent=1), encoding='utf-8')
    (TEST_DIR / 'verification_report.json').write_text(json.dumps(clean(verification), indent=1), encoding='utf-8')

    print(json.dumps(verification['checks'], indent=1))
    assert all(c['passed'] for c in verification['checks']), 'contract does not reproduce the notebook scores'
    print(f'Exported contract for {n} characteristics, {len(fixtures)} parity fixtures.')


if __name__ == '__main__':
    main()

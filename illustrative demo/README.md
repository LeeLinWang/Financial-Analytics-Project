# Illustrative demo – Home Improvement credit scorecard dashboard

A local, browser-only dashboard for the final scorecard in `../Home_Improvement_Credit_Scorecard.ipynb`.

- **Business Dashboard**: Portfolio Overview (frozen policy on the held-out test set), Policy Comparison (validation cutoffs, pricing, assumption scenarios, final test evaluation), Model Monitoring (PSI).
- **Applicant Assessment**: inputs → transformation → attribute → WOE → points → score → illustrative decision and offer, with synthetic examples and a what-if comparison.

There is no backend, database or cloud service. The browser scores applicants from `data/model_contract.json`, and every other figure comes from aggregate JSON exported from the notebook.

## Start

Run these from a terminal. The folder name contains a space, so keep the quotes.

```bash
cd "C:/Users/leeli/OneDrive/Desktop/FA project/Git/illustrative demo"
python -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>. Direct links: `#portfolio`, `#policy`, `#monitoring`, `#applicant`.

The page must be served over http, not opened as a file, because browsers block `fetch` for `file://` pages.

## Refresh the data after the notebook changes

The export script **executes the notebook** and reads its final pipeline objects. It needs the source data in `../IS453 Group Assignment - Data/` (or the folder named by `IS453_DATA_ROOT`) and takes a few minutes.

```bash
cd "C:/Users/leeli/OneDrive/Desktop/FA project/Git"
python "illustrative demo/export_dashboard_data.py"
```

It rewrites `data/*.json`, `tests/parity_fixtures.json` and `tests/verification_report.json`. It stops with an error if the exported rules do not reproduce the notebook's scores, or if any aggregate disagrees with the notebook's result tables.

## Verify

```bash
cd "C:/Users/leeli/OneDrive/Desktop/FA project/Git/illustrative demo"
node tests/parity.test.mjs          # JS scoring engine vs notebook outcomes on synthetic applicants
python tests/check_assets.py        # browser assets hold only rules, aggregates and synthetic data
```

For the interface smoke test, start the server and open <http://127.0.0.1:8765/tests/ui_smoke.html>. The page drives the dashboard and prints PASS or FAIL lines. Headless option:
`chrome --headless=new --virtual-time-budget=15000 --dump-dom http://127.0.0.1:8765/tests/ui_smoke.html`.

## Files

| Path | Content |
|---|---|
| `index.html`, `assets/styles.css` | Page shell and styles |
| `src/engine.js` | Scoring engine; reads every rule from the contract, holds no model numbers |
| `src/app.js`, `src/charts.js` | Interface and SVG charts |
| `export_dashboard_data.py` | Offline export from the executed notebook |
| `data/model_contract.json` | Final 12-characteristic scorecard: bins, WOE, coefficients, points, scaling, cutoff, pricing |
| `data/dashboard_aggregates.json` | Aggregate portfolio, policy, pricing and PSI results, with provenance |
| `data/synthetic_profiles.json` | Synthetic applicant inputs (outcomes are computed, not stored) |
| `tests/` | Parity fixtures and test, asset check, verification report, UI smoke test |

No borrower-level data is written to this folder. The private row-level checks run inside the export script, and only their aggregate results are saved.

## Known limitations carried from the notebook

- Six characteristics have **no Missing attribute** in the frozen model, because no values were missing in dev_train: `BUR_days_since_recent_credit`, `age_years`, `ORGANIZATION_TYPE`, `NAME_EDUCATION_TYPE`, `DAYS_LAST_PHONE_CHANGE` and `REGION_RATING_CLIENT_W_CITY`. The form requires a value for these instead of inventing a rule.
- The simulated future population is not available: the notebook defines no such scenario.
- Economics use a hypothetical standard loan (500,000 units over 36 months) per 10,000 applicants. The data does not state the currency or the income and annuity periods.
- The outcome is early payment difficulty (`TARGET = 1`), not a confirmed default or loss.

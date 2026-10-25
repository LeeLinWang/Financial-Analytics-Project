# AGENTS.md — IS453 Home Improvement Credit Scorecard

Persistent guidance for every coding-agent session (Codex, Claude Code or similar) in this repository.

**Read this file in full before every task.** Then inspect the current notebook and follow its existing structure. Reading this file does **not** authorise advancing to a new stage, running new experiments, committing, pushing or publishing anything. Do only what the current task instruction asks.

Detailed reference material (slide coverage record, lab error catalogue, data facts) is in `docs/PROJECT_CONTEXT.md`.

---

## 1. Project purpose and scope

- SMU IS453 Financial Analytics group assignment: build an **application credit scorecard** for a **Home Improvement loan**. This is an instalment loan, paid out once and repaid in fixed amounts, used by homeowners to renovate, repair or upgrade the home they live in.
- **Proxy population.** The assignment data has no loan-purpose field (verified: no purpose or reason column; bureau `CREDIT_TYPE` has no renovation category). Model a profile-based proxy of home-improvement borrowers. Never present it as confirmed renovation borrowing.
- HMEQ (`REASON = HomeImp`) is the **lab** dataset only. Never use it as assignment evidence.
- **In scope:** notebook analysis, summary-ready tables, cutoff comparisons, interest-rate determination, profitability.
- **Out of scope unless explicitly requested later:** presentations or PowerPoint, presentation introductions, web pages or interactive apps, Monte Carlo simulation, joint cutoff/pricing optimisation, other optional "A+" enhancements.
- Do not modify the original Excel templates (summary sheet, in-class exercise).

## 2. Locations

| Item | Path |
|---|---|
| Project root (OneDrive) | `C:\Users\leeli\OneDrive\Desktop\FA project\` |
| Repository root (this folder) | `FA project\Git\` |
| Submission notebook | `Git\Home_Improvement_Credit_Scorecard.ipynb` |
| Source data (git-ignored) | `Git\IS453 Group Assignment - Data\` — Application Data.csv, Bureau Data.csv, Data Dict.xlsx |
| Lecture decks | `FA project\IS453 Module 7.1 … 11.4 *.pptx` (14 decks, 214 slides) |
| Labs | `FA project\IS453 Session 07 / 09 / 10 Lab - Student*.ipynb`; completed version: `IS453 Session 10 Lab - lin.ipynb` |
| In-class exercise | `FA project\IS453 Module 10.5 - In-class Exercise (1).xlsx` |
| Summary template (do not edit) | `FA project\IS453 Group Assignment Summary Sheet - Copy.xlsx` (may be locked by Excel; read a copy) |
| Checkpoint and professor feedback | `FA project\Group Assignment Preparation.docx`, final section "Professor feedback" |
| Backups (outside the repo) | `FA project\_backups\` |
| Assignment brief | **Not found in the folder.** Ask for it rather than assuming its requirements |

Course materials live outside the repository and must stay there.

## 3. Required reading before each stage

- Read every relevant lecture slide for the stage (text, equations, diagrams, speaker notes). Inspect images where text extraction loses meaning. Read the relevant labs, especially the completed Session 10 lab. Do not infer content from filenames.
- **Equations caveat:** equations in the decks sit inside `mc:AlternateContent` / OMML and the process diagrams are SmartArt; python-pptx skips both. Parse the raw slide XML.
- Correct known lab and deck errors explicitly rather than copying them (catalogue: `docs/PROJECT_CONTEXT.md` §3–4).
- Stage → main sources:
  - Step 1: Module 7.3 and the Session 07 lab.
  - Step 2: Modules 9.1, 9.2 and the Session 09 lab.
  - Step 3: Modules 10.1–10.3, the Session 10 lab and the 10.5 workbook.
  - Step 4: Modules 10.4, 11.1, 11.2, 9.3.
  - Step 5: Modules 11.3, 11.4, 7.1.

## 4. Notebook structure and writing conventions

**Fixed structure.** Title `# Home Improvement Credit Scorecard`, then five steps. Keep these headings and numbering exactly; add content beneath them. Do not add a Step 0 or administrative sections.

```
# Step 1 — Data Exploration        1.1 Variable Types … 1.6 Outliers
# Step 2 — Data Preparation        2.1 Representative Records … 2.9 Partitions (2.9.1 test, 2.9.2 train/validation)
# Step 3 — Grouping and Screening  3.1 Fine Classing (3.1.1 equal interval, 3.1.2 equal frequency) … 3.8 Final bins and WOE
# Step 4 — Create Scorecard        4.1 WOE Encoding … 4.8 Applicant Total Scores
# Step 5 — Analysis and Tuning     5.1 Train/Validation Performance … 5.10 Population Stability
```

- Step 1 opens with the Home Improvement business context, proxy caveat and target definition, followed by three setup code cells (imports and seed, data paths, constants). Later cells depend on these. Keep them first.
- Business context belongs in Step 1. Pricing, interest rate and profitability belong in Step 5 (5.7–5.8).

**Writing style (follow the labs and the completed Session 10 lab)**

- Put a short Markdown introduction before each analysis, with a formula where it helps.
- Keep code cells short and readable, with lower-case names (`variable_data`, `bin_edges`, `woe_bin_data`) and brief comments.
- Label every table and chart.
- Follow results with a concise interpretation grounded in the printed numbers.
- Keep methodological choices and limitations next to the analysis they affect: segment selection, missing-value treatment, bin merges, target definition, pricing assumptions, data limitations.
- Avoid repetitive or generic introductions, decorative symbols, stock conclusions, unsupported claims, and empty "Objective / Method / Results" blocks. Unfinished stages stay as headings only, with no "Pending" notes or invented findings.
- Never mention "the AI", "the agent", prompts or how the notebook was generated.
- **Operational content stays out of the notebook.** Run guides, source inventories, requirements maps, progress logs, decision logs, handover notes and agent instructions belong in this file or `docs/`.

## 5. Progressive extension and execution

- Extend the **same** notebook, one stage per task, and stop after that stage's checks. Do not advance automatically.
- Use the fixed seed `RANDOM_STATE = 453`. Cells must run top to bottom from a clean kernel. Save outputs. Resolve errors in completed sections before finishing.
- **Data path:** defaults to `./IS453 Group Assignment - Data/`. Override with the environment variable `IS453_DATA_ROOT`. Never hard-code personal absolute paths or print them into outputs.
- **Install:** `pip install -r requirements.txt` (Python 3.12.5 tested; pandas 2.2.3, numpy 2.2.2, scikit-learn 1.9.1, seaborn 0.13.2).
- **Run fresh:** Kernel → Restart & Run All. On this machine there is no Jupyter CLI or nbclient. Execute headless through `jupyter_client.start_new_kernel` (Python 3 kernel), with the notebook folder as the working directory.
- **Environment quirks:**
  - `python -I` hides user site-packages here, so pandas fails on `dateutil`.
  - Never name scratch scripts after stdlib modules (a `profile.py` broke IPython).
- Before restructuring the notebook, back it up to `FA project\_backups\`.

## 6. Verified conventions

| Convention | Value | Source |
|---|---|---|
| Event / bad | `TARGET = 1` (payment difficulties; X days / Y instalments not given). Non-event / good = 0 | Data dictionary |
| WOE | ln(%non-events / %events) = ln(%good / %bad); positive means lower risk; Missing gets its own bin | Module 10.1 s8–9; Session 10 `woe_iv` |
| IV | bin IV = (%good − %bad) × WOE; characteristic IV = sum over bins | Module 10.2 s12 |
| IV bands | < 0.02 not useful; 0.02–0.1 weak; 0.1–0.3 medium; 0.3–0.5 strong; > 0.5 potentially over-predictive (investigate) | Module 10.2 s13 |
| Scorecard size | 8–15 characteristics; summary sheet lists the **top 15 by IV** | Modules 7.2 s3, 10.2 s13; summary sheet §6 |
| Coarse classing | ≥ 5% of observations per bin; events and non-events in every bin; monotonic WOE unless a business-justified U/J shape; IV should stay in the same band | Module 10.3 s11, s17, s18 |
| Logistic regression | models P(bad); WOE inputs, so coefficients are expected to be negative | Modules 9.3, 11.1 |
| Points | Score_ij = −(β_i·WOE_ij + β0/n) | Module 11.1 s8 |
| Scaling | Factor = PDO/ln2; Offset = TargetScore − Factor·ln(TargetOdds); Scaled_ij = Score_ij·Factor + Offset/n. TargetOdds are good:bad, so "1:50" means ln(50) | Module 11.2 s5–8 |
| Odds → PD | at good:bad odds o, PD = 1/(1+o) (1:20 → 4.76%) | Module 11.4 s9 |
| Metric convention | Lecture positive class = **good payer**. Summary "Recall" = recall of class 0; "Specificity" = recall of class 1 (bads rejected); F1 = class-0 F1. Always show both classes and label the mapping | Module 11.3 s7–15 |
| AUC bands | 0.5–0.6 not useful; 0.6–0.7 poor; 0.7–0.8 fair; 0.8–0.9 good; 0.9–1.0 excellent | Module 11.3 s18 |
| Profit at cutoff | Revenue = approved × revenue/loan; Loss = approved × default rate × loss/default; Net = Revenue − Loss | Module 11.4 s10–12 |
| Outliers | invalid → missing; valid → truncation (z ±3) or end bins | Modules 9.1 s8, 10.4 s8 |

**Unverified or undecided** (do not present as settled):

- Target score, target odds and PDO values (no required values found).
- The interest-rate method (decks give only the principle that the rate must cover default risk and operating cost, Module 7.1 s4, s8).
- Business assumption values: revenue per loan, loss per default, LGD.
- The required split ratio (current plan: test 1/3, validation 25% of development, from Module 11.3 s5).
- Whether `AMT_ANNUITY` and `AMT_INCOME_TOTAL` are monthly (assumed monthly; median credit/annuity ≈ 20.0, annuity/income ≈ 0.163).
- Labs use `class_weight='balanced'`, which shifts the intercept, so scaled scores would not equal true odds. Decide in Step 4 between an unweighted fit and an intercept prior correction, and say which in the notebook.

## 7. Leakage prevention: train / validation / test

- Hold out the outer test partition (stratified on `TARGET`) in 2.9.1. Split the remaining development data into dev-train and validation in 2.9.2.
- Fit every supervised or learned step on **dev-train only**: bin edges, WOE, IV screening, correlation filtering, learned caps or imputations, the logistic regression. Apply them unchanged to validation and test. If cross-validation is used, refit inside each fold.
- Validation is for tuning (5.5–5.7). The outer test set is used once, in 5.9, after the model **and** the lending policy (cutoff, pricing) are frozen. Never tune on test outcomes.
- Exploration in Step 1 may describe the full proxy segment, but must not drive supervised choices that leak test information.

## 8. Data protection, privacy and Git

- The GitHub remote `https://github.com/LeeLinWang/Financial-Analytics-Project.git` is **public**.
- **Never commit:** source data, borrower-level outputs (`outputs/`), course materials (slides, labs, templates, checkpoint doc), credentials or local config. `.gitignore` blocks `*.csv`, `*.xlsx`, Office files, `*.pkl`, `outputs/` and `.env`. Check `git status --ignored` before any commit.
- Show only aggregate tables in notebook outputs. Do not print raw applicant rows beyond small `head()` previews.
- Commit or push only when a task explicitly says so. 2026-10-25: commit `265b374` pushed to `origin/main` (notebook, README, requirements, .gitignore only). 2026-10-25 (later): at the user's request the full Git folder was pushed, including AGENTS.md, `docs/` and `illustrative demo/` (published to GitHub Pages by `.github/workflows/pages.yml`). Raw data and `outputs/` remain excluded.
- Fair lending: exclude `CODE_GENDER`. `NAME_FAMILY_STATUS` is under review (see Q2).

## 9. Current stage and handover

| Date | Stage | State |
|---|---|---|
| 2026-10-25 | 0 | Folder inventory, all 214 slides, labs, templates and data verified; repository initialised in place (`main`, `origin`); notebook skeleton created |
| 2026-10-25 | Restructure | Notebook reworked to the submission layout: title, five steps, 54 heading cells; Step 1 holds the business context, proxy caveat, target definition and 3 setup code cells (executed cleanly). Operational content moved here. Backup: `_backups\Home_Improvement_Credit_Scorecard_2026-10-25_pre-restructure.ipynb` |

| 2026-10-25 | Step 1 | 1.1–1.6 populated and executed from a clean kernel (33 code cells, 9 figures). Whole-population descriptive EDA, no filters. Key facts: 307,511 apps / 1,716,428 bureau rows; 14.3% apps without bureau; 251,103 orphan bureau rows; `DAYS_EMPLOYED=365243` = all 55,352 pensioners + 22 unemployed = `ORGANIZATION_TYPE 'XNA'`; `AMT_REQ_*` missing only for no-bureau apps; 38,454 bureau end dates > +20,000 days; 8,418 negative bureau debts. The checkpoint's "monthly" unit assumption is unverified and is not used as fact in the notebook |

| 2026-10-25 | Step 2 | Segment = own realty + age 25–65 (199,573 rows, 7.92% bad; F3 reading labelled as interpretation). Sentinel → NaN + `employment_not_recorded`; bureau amounts summed for `currency 1` only; negative debts and ±20,000-day dates → NaN; 15 `BUR_` aggregates, `no_bureau_history` (28,277); 129 candidates. Partitions: dev_train 99,786 / validation 33,262 / test 66,525 (all 7.92% bad). `outputs/split_membership.csv` |
| 2026-10-25 | Step 3 | Fine classing (qcut 20 / discrete levels / categories, Missing, No bureau history, Unseen → WOE 0), smoothing 0.5 per bin. Only 3 medium-IV characteristics (EXT_SOURCE_1 0.161, employment_years 0.110, AMT_GOODS_PRICE 0.106); none > 0.3. 14-characteristic shortlist after the redundancy rules; monotonic coarse classing (≥ 5%, ≤ 6 bins). AMT_GOODS_PRICE loses 56% IV (saw-tooth at round prices). Unstable on validation: ORGANIZATION_TYPE, DAYS_LAST_PHONE_CHANGE, DAYS_ID_PUBLISH. WOE plots use the user's lab `woe_iv_plot` style. `outputs/woe_mappings.json` |

| 2026-10-25 | Step 4 | WOE encoding; unweighted LR (L2, C=1, statsmodels check); 13 of 14 shortlisted (REGION_POPULATION_RELATIVE p=0.45 removed); all coefficients negative; calibrated (mean p 0.0791 vs 0.0792). Scaling 600 / 50:1 / PDO 20 → Factor 28.8539, Offset 487.1229. Synthetic profiles A–E |
| 2026-10-25 | Step 5 | Baseline AUC 0.688 / 0.679 (dev_train / validation). Tuning: cumulative adoption kept ORGANIZATION_TYPE → 3 groups + drop DAYS_ID_PUBLISH → **final 12 characteristics** (validation AUC 0.6783). Policy cutoff **545** (risk limit: accepted bad rate ≤ 6% on validation; approval 80.8%, accepted bad 5.88%). Band rates 7.75–10.25% (break-even + 1% margin, hypothetical 500,000 / 36-month loan). Under these assumptions approve-all earns more net contribution (157m vs 128m per 10,000 applicants); the policy is justified by risk appetite and assumption uncertainty, as disclosed in 5.8. Test (once, frozen): F1 0.879, recall 0.826, specificity 0.396, AUC 0.681. Fairness: approval gaps by gender, income type and age (age is a direct input — flag for regulatory review). PSI < 0.001 (random split) |

| 2026-10-25 | Dashboard | Local dashboard in `illustrative demo/` (not committed). `export_dashboard_data.py` executes the notebook and writes the contract and aggregates; JS engine parity 465/465; 113 notebook-alignment checks pass; UI smoke test 23/23. Known gap: 6 final characteristics have no Missing attribute (see the demo README). Reference images were not received; design follows the written brief |

**Integrity note (2026-10-25):** during development the notebook was re-run end to end several times, so test-set cells executed before the final policy was fixed. Tuning and policy changes (cumulative adoption rule; adding the contribution grid and the worst-case sensitivity) were driven only by validation tables. No decision used test results.

- **Status:** all five steps complete. Possible follow-ups, only if requested: confirm the F3 reading with the group or professor; review the use of age and the not-employed proxies with the group; obtain the assignment brief to check any required scaling or split values; transfer summary-ready results into the summary template (Table 5.9f, 5.6a, 5.6b) — the template itself has not been edited.
- **Previous next-task note (completed):** Step 4 (then 5). Step 2 — Data Preparation (2.1–2.9.2) is done, per `FA project\FA_Credit_Scorecard_Step_Prompts.docx` Prompt 2. The user asked (2026-10-25) to run Prompts 2–5 sequentially in one session; Prompt 5 authorises commit and push after full verification.
- **Remaining:** Steps 1–5 in full, then summary-ready tables for the summary sheet.

**Requirements map** (from the summary template; ❓ = cannot be confirmed without the brief):

| # | Requirement | Section |
|---|---|---|
| R1–R2 | Segment, product, demographics; selection criteria, rows, bad count and % | 1, 2.1 |
| R3 | Merge method for application and bureau data | 2.5–2.6 |
| R4 | Transformations and extracted features | 2.7 |
| R5 | Monotonic / non-monotonic variables and why; missing and outlier treatment | 2.3–2.4, 3.5–3.6 |
| R6 | Top 15 by IV, IV score, used in final scorecard (Y/N) | 3.4, 5.6 |
| R7 | Number of final variables and reasons | 4.3, 5.6 |
| R8 | Three tuning approaches: starting measures, adjustment, result, adopted | 5.5 |
| R9 | Train and test F1, Recall, Specificity (good = positive) | 5.1–5.3, 5.9 |
| R10 | Target score, target odds, PDO | 4.5–4.6 |
| R11 | Cutoff, approval rate and method, odds at cutoff, basis | 5.7 |
| R12 | Revenue per loan, loss per default, applicants, assumptions; revenue, default rate, losses, net profit with calculations | 5.8 |
| R13 | Final scorecard table (variable, attribute, points, notes) | 4.7, 5.6 |
| R14 | Interest-rate determination ❓ method unconfirmed | 5.8 |
| R15 | Cutoff comparison | 5.7 |
| R16 | Fair-lending exclusions | 2.8 |
| R17 | Split ratio, scorecard size limits, deliverable format ❓ brief missing | — |

## 10. Professor feedback action log

Source: `Group Assignment Preparation.docx`, final section "Professor feedback" (plain text with line breaks; no Word comments, tracked changes or images). Close an item only when the notebook contains the supporting work.

| ID | Feedback (verbatim) | Interpretation | Section | Planned correction | Evidence required | Status |
|---|---|---|---|---|---|---|
| F1 | "be as inclusive as possible" / "keep it as open as possible" | Minimum segment filters | 2.1 | Rebuild filter waterfall | Waterfall: rows, bads, bad rate per filter | Open |
| F2 | "what happened if data is not reported - see what we can do if we filter it data set is smaller" | Handle missing / unreported data instead of dropping rows; show shrinkage | 1.5, 2.3, 3.1 | Missing and "no bureau history" bins | Missing table; Missing WOE bins | Open |
| F3 | "do either 1) or 2) not both probably 1" | **Ambiguous.** Likely filter 1 (`FLAG_OWN_REALTY = 'Y'`) or 2 (`NAME_HOUSING_TYPE`), prefer 1 | 2.1 | Keep 1, drop 2 | Waterfall with and without 2 | **Needs group confirmation** |
| F4 | "days birth makes sense" | Keep age 25–65 filter | 2.1 | Keep | Waterfall | Open |
| F5 | "income type do not discriminate" | Do not filter on `NAME_INCOME_TYPE` | 2.1, 3.4 | Drop filter; whether it may be a characteristic is unconfirmed | Waterfall; IV | Open |
| F6 | "own realy can drop hoysing type and name contract type can drop" | Keep own realty; drop housing-type and contract-type filters | 2.1 | Drop; both become candidate characteristics | Waterfall; IV | Open |
| F7 | "rest is OK" | Merge plan, no-bureau group, gender exclusion, outlier review, `EXT_SOURCE_1` missing bin and assumptions accepted | 2–3 | Implement and re-check | Merge row checks, bins | Open |

- **Contradiction to state openly in 2.1:** dropping the cash-loan filter admits revolving loans, which conflicts with the instalment-loan product definition. Follow the professor's explicit correction and report the revolving share.
- **Verified facts:** the original checkpoint segment replicates exactly (135,005 rows, 11,781 bads, 8.73%). The leading feedback reading (own realty + age 25–65) gives 199,573 rows (64.9%) with a 7.92% bad rate.
- **Assumptions to keep visible in the notebook where relevant:**
  - early-delinquency target;
  - no application date, so there is no out-of-time test;
  - approved loans only (reject-inference bias);
  - monthly annuity and income units;
  - unsecured loan, so high LGD.

**Open questions for the group**

- Q1: confirm the F3 reading and the F5 characteristic question.
- Q2: exclude `NAME_FAMILY_STATUS` too?
- Q3: provide the assignment brief.
- Q4: balanced weights vs true-odds scaling (Step 4).

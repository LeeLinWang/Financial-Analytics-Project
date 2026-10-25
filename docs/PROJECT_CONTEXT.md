# Project context and handover log

Detailed reference for `AGENTS.md` (read that first). This file holds the slide coverage record, data facts and lab error catalogue. Rules, conventions, stage status and the feedback log are maintained in `AGENTS.md`; where the two differ, `AGENTS.md` is current.

- Course: SMU IS453 Financial Analytics, group assignment
- Product: Home Improvement loans, modelled as a **proxy population** because there is no purpose field
- Notebook: `Home_Improvement_Credit_Scorecard.ipynb` (this repo)
- Stopping point: see `AGENTS.md` §9 (current stage and handover).
- Last updated: 2026-10-25

---

## 1. Folder and repository layout (verified 2026-10-25)

```
FA project/                                   <- project root (OneDrive). Course files live here, NOT in Git
├── Git/                                      <- Git repository (initialised in place; was a plain folder)
│   ├── .gitignore                            <- blocks data, outputs, Office files, credentials
│   ├── README.md                             <- run guide
│   ├── requirements.txt
│   ├── Home_Improvement_Credit_Scorecard.ipynb
│   ├── AGENTS.md                             <- agent guidance (read first)
│   ├── docs/PROJECT_CONTEXT.md               <- this file
│   ├── outputs/                              <- git-ignored, borrower-level outputs
│   └── IS453 Group Assignment - Data/        <- git-ignored source data (+ .DS_Store, a stray .swp)
├── Group Assignment Preparation.docx         <- Week 10 checkpoint + professor feedback
├── IS453 Group Assignment Summary Sheet - Copy.xlsx   <- summary template (do not edit)
├── IS453 Module 7.1 ... 11.4 *.pptx          <- 14 lecture decks
├── IS453 Module 10.5 - In-class Exercise (1).xlsx
└── IS453 Session 07 / 09 / 10 Lab notebooks (+ "Session 10 Lab - lin" = completed version)
```

- Remote: `https://github.com/LeeLinWang/Financial-Analytics-Project.git`. It is **public** and was **empty** when fetched on 2026-10-25.
- Branch `main`, remote `origin` set. **Nothing has been committed or pushed yet.**
- No applicable `AGENTS.md`. The only one on the machine belongs to an unrelated project.
- Python 3.12.5. pandas 2.2.3, numpy 2.2.2, scikit-learn 1.9.1, seaborn 0.13.2, matplotlib 3.10.0. No Jupyter CLI or nbclient; `ipykernel` and `jupyter_client` are installed (VS Code can run the notebook).

## 2. Data facts (verified against the files)

| Item | Value |
|---|---|
| Application data | 307,511 rows × 120 cols; `SK_ID_CURR` unique |
| Bureau data | 1,716,428 rows × 17 cols; 305,811 distinct `SK_ID_CURR` |
| Link | one application → 0..many bureau rows on `SK_ID_CURR` |
| Coverage | 85.7% of applications have at least one bureau row; 85.4% of bureau rows link to an application (14.6% are orphans) |
| `TARGET` | 1 = payment difficulties (24,825 = 8.07%); 0 = other (282,686) |
| Purpose field | **None.** Only `AMT_GOODS_PRICE` (consumer-goods price). Bureau `CREDIT_TYPE` has no renovation category ("Cash loan (non-earmarked)" = 56 rows) |
| Dictionary vs data | Application columns match exactly. Bureau: the dictionary says `SK_BUREAU_ID`, the data says `SK_ID_BUREAU` |
| Known invalid codes | `DAYS_EMPLOYED = 365243` (55,374 rows); `CODE_GENDER = 'XNA'` (4 rows) |
| Age range | 20.5 to 69.1 years |
| Unit sanity | median AMT_CREDIT/AMT_ANNUITY = 20.0; median AMT_ANNUITY/AMT_INCOME_TOTAL = 0.163 |

**HMEQ vs assignment data.** HMEQ (5,960 home-equity loans, `BAD`, and `REASON` ∈ {DebtCon, HomeImp}) is the **lab** dataset. It has a genuine home-improvement purpose field. The assignment data does not, so HMEQ results must never be presented as assignment evidence.

## 3. Lecture slide coverage record

Method: python-pptx for text, tables, groups and speaker notes; a raw-XML pass for OMML equations (inside `mc:AlternateContent`, which python-pptx skips) and SmartArt text; every embedded image exported and **viewed** on contact sheets (all content images; the repeated course-logo icons were skipped). Rendering whole slides was not possible (no LibreOffice), so layout was judged from the component images plus text. Equation fallback images were not opened one by one because their OMML source was recovered as text.

| Deck | Slides | Reviewed | Unique images | Key theory | Stages |
|---|---|---|---|---|---|
| 7.1 Credit Risk Overview | 16 | 16 | 19 | NIM; default losses offset interest; current/delinquent/default; judgmental (5 Cs) vs statistical; points-sum scorecard + cutoff; gender-bias example (s13 notes, s14 Apple Card) | 1, 5 |
| 7.2 Credit Scorecard Concepts | 15 | 15 | 15 | 8-15 variables; loss-event definitions; bureau data; segmentation; adjusting terms for low/high scores; champion/challenger | 1, 3, 5 |
| 7.3 Data Exploration | 17 | 17 | 21 | Five-step SmartArt; variable types; describe / hist / boxplot / countplot; KDE by target; stacked bars; correlation heat map; missing values; z-score outliers (|z| > 3 or 2.5) | 1 |
| 9.1 Data Preparation | 21 | 21 | 17 | MCAR / MAR / MNAR / structural missing; keep (encode "Missing") / delete / replace; invalid outlier → missing; valid outlier truncation at mean ± 3σ (notes: IQR, M ± 3s with s = IQR/(2×0.6745)); min-max and z normalisation; aggregation; discretisation; curse of dimensionality; correlation-based selection; feature extraction (debt/income); records: ≥ 2,000 goods and bads, bads ≥ 10-20% (notes); representative sample | 2 |
| 9.2 Data Merging | 9 | 9 | 2 (logos) | Left join duplicates rows and labels; wide columns are sparse; aggregate / engineer features (option 3) | 2 |
| 9.3 ML for Credit Analysis | 23 | 23 | 17 | Decision trees; linear vs logistic; odds ↔ probability; P = 1/(1+e^-(β0+βX)); 0.5 cutoff; coefficient interpretation; multicollinearity; class imbalance; linearity assumption | 4 |
| 10.1 Weight of Evidence | 11 | 11 | 6 | WOE = ln(%non-events/%events); good/bad ratio intuition; CLAGE worked example (−1.73) | 3 |
| 10.2 Characteristic Screening | 15 | 15 | 13 | Terminology (characteristic / attribute); equal-width vs equal-frequency fine classing (20+ bins); IV formula; IV bands; drop weak, keep 8-15; business-reason exceptions | 3 |
| 10.3 Coarse Classing | 20 | 20 | 20 | Overfitting; monotonic WOE; ≥ 5% per bin; events and non-events per bin; combine similar WOE; keep IV in the same band; U / J-shape exceptions (YOJ example) | 3 |
| 10.4 Data Normalisation | 9 | 9 | 11 | WOE encoding replaces raw values; Missing mapped to its WOE; outliers into end bins | 3, 4 |
| 11.1 Scorecard Construction | 13 | 13 | 12 | Score_ij = −(β_i·WOE_ij + β0/n); worked YOJ < 5 = −0.702; s11 non-monotonic scorecard ("what is wrong") | 4 |
| 11.2 Scorecard Scaling | 10 | 10 | 7 | Factor = pdo/ln2; Offset = TargetScore − Factor·ln(TargetOdds); Scaled = Score·Factor + Offset/n; 600 / 1:50 / 20 example | 4 |
| 11.3 Performance Evaluation | 20 | 20 | 11 | Split sample (≈ 1/3 test, stratified, > 1000 obs and > 30 bads); train / validation / test diagram; confusion matrix with **good = positive**; accuracy, error, recall, specificity, precision, F1; classification_report mapping; ROC, AUC bands; KS shown in images | 4, 5 |
| 11.4 Model Considerations | 15 | 15 | 10 | Tuning levers; selection criteria; cutoff vs target score (1:20 at 600 → PD 4.76%); revenue = approved × revenue/loan; expense = approved × default rate × loss/default; profit; PSI | 5 |
| **Total** | **214** | **214** | **181** | | |

**Errors and inconsistencies found in the decks** (follow the formula, not the faulty number):

- 10.1 s9 and 10.2 s12 use the same counts but different CLAGE bin labels (80-140 / 140-200 / > 200 vs 80-125 / 125-140 / > 140).
- 10.2 s8: the equal-frequency example lists "1100, 1200", but the data are 1050, 1100; bin 4 says "<= 1,500" where it should be "> 1,500".
- 11.2 s8: the score points (YOJ < 5 = 0.60, > 11 WOE 0.420) contradict 11.1 (−0.70 with WOE 0.183). Offset is 487.14 on s7 but 487.12 on s8.
- 9.3 s9: the equation intercept is 971.31 but the chart says 997.31. 9.3 s16 writes β0 = −0.000032246, while s15 has β0 = −0.4241 (the stated P = 0.0865 matches −0.4241).

## 4. Lab notebooks – structure and observations

**Style to follow:** h2 `## IS453 Financial Analytics` title block → dataset description → numbered `## 1.` sections with `###` sub-steps → short Markdown explanation before each short code cell (`# sample code` comments, lower-case variable names such as `hmeq_data`, `variable_data`, `bin_edges`, `woe_bin_data`) → plot → **Ex Q / DIY** questions → short interpretation. Reusable functions: `woe_iv(data)` → binning table with Count, Events, Non_Events, %_of_Events, %_of_Non_Events, WOE, IV, total_IV; `woe_iv_plot(data, name)` → WOE line, Missing point, bar of % observations.

| Lab | Content | Issues to correct, not copy |
|---|---|---|
| Session 07 (EDA) | info / describe, hist, boxplots, countplots, KDE by BAD, stacked bars, correlation heat map, missingness; DIY Q4 explores the assignment files | Cell 25 says "Box plots work better" but the code uses countplots; cell 24's title is outside the loop, so only the last plot gets it |
| Session 09 (prep + LR) | Invalid-outlier removal (CLAGE > 960 months), drop one of each pair with abs(r) > 0.8 keeping the stronger BAD correlation, `LogisticRegression(solver='liblinear', class_weight='balanced')`, manual sigmoid probability, accuracy | `class_weight='balanced'` inflates probabilities. The lab itself warns about this. Scaled scores would not equal true odds, so decide in Stage 4. Accuracy is the only metric, which misleads at an 8% bad rate |
| Session 10 student | Fine classing (qcut 20 + Missing), WOE / IV table, functions, IV screening, coarse classing with pd.cut | `woe_iv` has no guard for bins with zero events or non-events, which gives infinite WOE |
| **Session 10 – lin (completed)** | Ex Q1-Q3 and DIY Q1-Q3 answered; DIY Q4 draft IV screening code for the assignment | (1) Cell 3 `read_csv` is a **Markdown** cell, so a clean kernel fails. (2) Cell 22's saved output ("20 bin: …") does not match its code ("20 bin total IV:"), so the output is stale. (3) DEROG: the text says the IV "is expected to decrease", but the output went **up** from 0.2993 to 0.3472; the sample edges [0, 1, …] with `include_lowest` merge DEROG 0 and 1. (4) LOAN coarse classing loses 55% of IV (0.227 → 0.1018), contrary to 10.3 s17 "IV should not change too much"; 0.1018 is only just medium. (5) DEBTINC IV ≈ 2.0 is called "exceptionally strong", but the lecture says > 0.5 is *potentially over-predictive – investigate*. (6) DIY Q4 was never run, uses undefined `segment_df`, and screens on the **whole** segment before any split (leakage); smoothing is applied only conditionally |
| 10.5 in-class xlsx | Parts 1-3 WOE / IV by hand (CLAGE 7 and 4 bins, JOB); Part 4 WOE encoding by VLOOKUP | Part 4 YOJ lookup is **reversed** vs 10.4 (< 5 should be −0.515, not 0.183); Part 1 D6:D8 COUNTIF ranges are offset by 2-3 rows; Part 2 E-column divides by D$11 (181) instead of D$21 (182) |

## 5. Five-step workflow and conventions (verified)

See `AGENTS.md` §6 (authoritative). Key points:

- **Event / bad = `TARGET = 1`.** WOE = ln(%good/%bad), so positive WOE means lower risk. IV = Σ(%good − %bad)·WOE.
- Points: Score_ij = −(β_i·WOE_ij + β0/n). Scaled = Score_ij·Factor + Offset/n. Factor = PDO/ln2. Offset = TS − Factor·ln(TO), with TO as good:bad odds. Higher score = lower risk.
- PD at good:bad odds o is 1/(1+o).
- **Metric convention:** the lecture treats the *good payer as positive*. Summary sheet "Recall" = recall of class 0 (goods approved); "Specificity" = recall of class 1 (bads rejected); F1 = class-0 F1. Always show both classes and label the mapping.
- Top-IV count for the summary sheet = **15** (15 slots, rows A38:A83). The scorecard itself should hold 8-15 characteristics.
- Profit at cutoff = approved × revenue/loan − approved × default rate × loss/default.

## 6. Requirements map

See `AGENTS.md` §9 (R1-R17). Cannot be confirmed without the assignment brief (not in the folder): required split ratio, scaling values, interest-rate method, business assumption values, deliverable format. The interest-rate requirement comes from the user's scope; the decks give only the principle (7.1 s4, s8: the rate must match default risk and operating costs).

## 7. Professor feedback action log

Source: `Group Assignment Preparation.docx`, final section "Professor feedback". One paragraph with line breaks; no Word comments, tracked changes or images. Verbatim lines:

1. "be as inclusive as possible"
2. "what happened if data is not reported - see what we can do if we filter it data set is smaller"
3. "do either 1) or 2) not both probably 1"
4. "keep it as open as possible"
5. "days birth makes sense"
6. "income type do not discriminate"
7. "own realy can drop hoysing type and name contract type can drop"
8. "rest is OK"

| ID | Interpretation | Stage | Planned correction | Evidence required | Status |
|---|---|---|---|---|---|
| F1 (lines 1, 4) | Use the minimum number of segment filters | 1 | Rebuild the waterfall | Waterfall table | Open |
| F2 (line 2) | Handle unreported or missing data rather than filtering rows; show the shrinkage | 1-3 | Missingness profile; Missing and No-bureau bins | Missing table, WOE bins | Open |
| F3 (line 3) | **Ambiguous.** Likely filter 1 (own realty) or 2 (housing type), prefer 1 | 1 | Keep 1, drop 2 | Waterfall | **Needs group confirmation** |
| F4 (line 5) | Keep age 25-65 | 1 | Keep 4a | Waterfall | Open |
| F5 (line 6) | Do not filter on income type | 1, 3 | Drop 4b; screen it as a characteristic? (confirm) | Waterfall; IV | Open |
| F6 (line 7) | Keep own realty; drop housing and contract type filters | 1 | Drop 2 and 3; both become candidate variables | Waterfall; IV | Open |
| F7 (line 8) | Rest of the plan accepted | 2-3 | Implement and re-check | Merge checks etc. | Open |

**Contradiction:** dropping the cash-loan filter adds revolving loans, which conflicts with the checkpoint's "instalment loan" product definition. We follow the professor and report it openly.

**Checkpoint replication** (exact match): 307,511 → own realty 213,312 (7.96%) → + house/apt 199,197 (7.82%) → + cash 177,989 (8.12%) → + age 25-65 167,906 (8.13%) → + earned income 135,005 (8.73%, 11,781 bads); 18,824 without bureau; 672,645 bureau rows.

**Feedback-implied options** (for the decision; final analysis in Section 1):

| Option | Rows | % | Bad rate |
|---|---|---|---|
| A own realty + age 25-65 (leading reading) | 199,573 | 64.9 | 7.92% |
| B own realty only | 213,312 | 69.4 | 7.96% |
| C own realty + age + cash loans | 178,829 | 58.2 | 8.25% |
| D house/apt + age 25-65 (if "2)" were kept instead) | 256,873 | 83.5 | 7.77% |

## 8. Decisions, assumptions, open questions

See `AGENTS.md` §6, §10 (assumptions, Q1-Q4). The most important open items:

- **Q1:** confirm the F3 reading and whether `NAME_INCOME_TYPE` may be a model characteristic.
- **Q2:** exclude `NAME_FAMILY_STATUS` too?
- **Q3:** the assignment brief is missing.
- **Q4:** balanced class weights vs true-odds scaling.

## 9. Standing instructions for later stages (summary)

- Extend the **same** notebook. Before each stage, read this file, the notebook and the relevant decks and labs.
- Put Markdown before major code (what, why, formula) and evidence-based interpretation after results, lab style. Label assumptions, sources and departures from class methods.
- Fixed seed (`RANDOM_STATE = 453`), clean-kernel order, saved outputs, no errors in completed sections.
- Develop on outer-train with an internal validation split. Fit every learned step on dev-train only (refit inside CV folds). Use the outer test once, on the frozen model. Never tune on test.
- Do one stage per prompt and stop after its checks. Close feedback items only when the notebook contains the evidence.
- Out of scope: PowerPoint, presentation intro, web pages, Monte Carlo, joint cutoff/pricing optimisation. In scope: cutoff comparisons, interest-rate determination, profitability. Do not edit the original Excel templates.

## 10. Handover log

| Date | Stage | Done | Next |
|---|---|---|---|
| 2026-10-25 | 0 | Full inventory; 214/214 slides; 4 labs + in-class xlsx; summary template; data dictionary; checkpoint and feedback; data verification; repo initialised (`main`, `origin`, nothing committed); notebook skeleton executed cleanly (3 code cells) | Stage 1 – Data Exploration. Get the Q1 answer (F3 / F5) first, or proceed with option A and flag it |

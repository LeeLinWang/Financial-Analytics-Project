# IS453 Financial Analytics – Home Improvement Loan Scorecard

Group assignment for SMU IS453. One Jupyter notebook builds an application credit scorecard for a Home Improvement loan product, following the five class steps: Data Exploration → Data Preparation → Grouping and Screening → Create Scorecard → Analysis and Tuning.

- Notebook: `Home_Improvement_Credit_Scorecard.ipynb`

The data has no loan-purpose field, so the notebook models a profile-based **proxy** for home-improvement borrowers, not confirmed renovation loans.

## Run guide

1. **Data is not in this repository.** Get the three assignment files from the course page and put them in one folder:
   - `IS453 Group Assignment - Application Data.csv`
   - `IS453 Group Assignment - Bureau Data.csv`
   - `IS453 Group Assignment - Data Dict.xlsx`
2. **Tell the notebook where they are.** The default is `./IS453 Group Assignment - Data/` next to the notebook. To use another folder, set `IS453_DATA_ROOT` before starting Jupyter:
   - PowerShell: `$env:IS453_DATA_ROOT = "D:\IS453 data"`
   - macOS/Linux: `export IS453_DATA_ROOT="$HOME/IS453 data"`
3. **Install packages:** `pip install -r requirements.txt` (Python 3.10 or newer).
4. **Run from a clean kernel:** Kernel → Restart & Run All.

## What must never be committed

The repository is **public**. `.gitignore` blocks the following, but check `git status` before every commit:

- source data (`*.csv`, `*.xlsx`, the data folder)
- borrower-level outputs (`outputs/`)
- course materials (slides, lab files, the summary template)
- credentials or local config (`.env`, `config_local.*`)

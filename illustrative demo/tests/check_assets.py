"""Checks that the browser assets contain only rules, aggregates and synthetic records.

Run from anywhere:  python "illustrative demo/tests/check_assets.py"
"""
import json
import sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
failures = []


def walk(obj, path='$'):
    """Yield (path, key, value) for every dict entry and list length found."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield path, k, v
            yield from walk(v, f'{path}.{k}')
    elif isinstance(obj, list):
        yield path, '__len__', len(obj)
        for i, v in enumerate(obj):
            yield from walk(v, f'{path}[{i}]')


for name in ['model_contract.json', 'dashboard_aggregates.json', 'synthetic_profiles.json']:
    path = DEMO / 'data' / name
    data = json.loads(path.read_text(encoding='utf-8'))
    for where, key, value in walk(data):
        if key in ('SK_ID_CURR', 'SK_ID_BUREAU', 'TARGET_row', 'id_list'):
            failures.append(f'{name}: identifier field {key} at {where}')
        if key == '__len__' and value > 200:
            failures.append(f'{name}: list of {value} items at {where} (possible row-level data)')
    size_kb = path.stat().st_size / 1024
    print(f'{name}: {size_kb:.0f} KB')
    if size_kb > 500:
        failures.append(f'{name}: unexpectedly large ({size_kb:.0f} KB)')

# no data files other than the three exports are served from data/
extra = [p.name for p in (DEMO / 'data').iterdir() if p.name not in {'model_contract.json', 'dashboard_aggregates.json', 'synthetic_profiles.json'}]
if extra:
    failures.append(f'unexpected files in data/: {extra}')

# notebook-alignment report produced by the export must be fully passing
report = json.loads((DEMO / 'tests' / 'verification_report.json').read_text(encoding='utf-8'))
failed = [c['check'] for c in report['checks'] if not c['passed']]
print(f"verification_report.json: {len(report['checks'])} checks, {len(failed)} failed")
failures += [f'verification failed: {c}' for c in failed]

print('ALL ASSET CHECKS PASSED' if not failures else '\n'.join(failures))
sys.exit(1 if failures else 0)

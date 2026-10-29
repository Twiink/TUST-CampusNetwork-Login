#!/usr/bin/env python3
"""Fail when a measured budget is exceeded or required evidence is absent."""
import argparse
import json
from pathlib import Path
import statistics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('report', type=Path)
    parser.add_argument('--android', action='store_true')
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    limit = (100 if report.get('mode') == 'foreground' else 60) if args.android else (150 if report.get('mode') == 'foreground' else 50)
    peak = report.get('peakMemoryBytes',report.get('peakPssBytes'))
    if peak <= 0 or peak > limit * 1048576:
        raise SystemExit(f'Memory budget failed: {peak} bytes / {limit} MiB')
    if not args.android:
        cpu = report['cpuSingleCorePercent']
        if cpu < 0 or (report.get('mode') == 'background' and cpu > .2):
            raise SystemExit(f'CPU budget failed: {cpu}% of one core')
    if report.get('peakSwapPssBytes',0)>0:raise SystemExit('Live pages were swapped; repeat the memory acceptance without host memory pressure')
    samples = report['samples']
    key = 'totalPssBytes' if args.android else ('memoryBytes' if 'peakMemoryBytes' in report else 'pssBytes')
    if len(samples) >= 120:
        growth = statistics.median(s[key] for s in samples[-20:]) - statistics.median(s[key] for s in samples[:20])
        if growth > 5 * 1048576:
            raise SystemExit(f'Stable memory growth exceeded 5 MiB: {growth}')
    print('Measured memory/CPU budgets passed')

if __name__ == '__main__':
    main()

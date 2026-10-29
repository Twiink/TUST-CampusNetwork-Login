#!/usr/bin/env python3
"""Collect all package process PSS, including the cached UI process."""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', default='com.netmate.app')
    parser.add_argument('--ui',action='store_true')
    parser.add_argument('--apk',type=Path)
    parser.add_argument('--seconds', type=int, default=600)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    samples = []
    for _ in range(max(1, args.seconds // 5)):
        processes = []
        for line in adb('shell', 'ps', '-A', '-o', 'PID,NAME').splitlines():
            parts = line.split()
            if len(parts) == 2 and (parts[1] == args.package or parts[1].startswith(args.package + ':')):
                text = adb('shell', 'dumpsys', 'meminfo', parts[0])
                match = re.search(r'TOTAL PSS:\s*(\d+)', text)
                if match is None:
                    match = re.search(r'^\s*TOTAL\s+(\d+)', text, re.M)
                if match is None:
                    raise RuntimeError('PSS unavailable; refusing to report zero memory')
                graphics=re.search(r'^\s*Graphics:\s*(\d+)',text,re.M)
                processes.append({'graphicsBytes':int(graphics[1])*1024 if graphics else None,'pid': int(parts[0]), 'name': parts[1], 'pssBytes': int(match[1]) * 1024})
        if not processes:
            raise RuntimeError('No application process found')
        samples.append({'processes': processes, 'totalPssBytes': sum(p['pssBytes'] for p in processes),'graphicsBytes':sum(p['graphicsBytes']or 0 for p in processes)})
        time.sleep(5)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps({'mode':'foreground' if args.ui else 'background', 'device':adb('shell','getprop','ro.product.model').strip(), 'fingerprint':adb('shell','getprop','ro.build.fingerprint').strip(), 'sdk':adb('shell','getprop','ro.build.version.sdk').strip(),'emulator':adb('shell','getprop','ro.kernel.qemu').strip()=='1','debugger':False,'gpuMetric':'dumpsys app-summary Graphics; included in PSS when Android accounts it', 'memoryMetric':'pssBytes','package': args.package, 'android': adb('shell', 'getprop', 'ro.build.version.release').strip(), 'samples': samples, 'peakPssBytes': max(s['totalPssBytes'] for s in samples)}, indent=2) + '\n')

if __name__ == '__main__':
    main()

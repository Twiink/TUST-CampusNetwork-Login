#!/usr/bin/env python3
"""Measure config-loaded native first paint using fresh application profiles."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import signal
import subprocess
import tempfile
import time


def stop(process):
    if os.name=='nt':
        import psutil
        try: children=psutil.Process(process.pid).children(recursive=True)
        except psutil.NoSuchProcess: children=[]
        for child in reversed(children):
            try:child.terminate()
            except psutil.NoSuchProcess:pass
        process.terminate()
    else:
        try:os.killpg(process.pid,signal.SIGTERM)
        except ProcessLookupError:pass
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name!='nt':os.killpg(process.pid,signal.SIGKILL)
        else:process.kill()
        process.wait()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('binary',type=Path)
    parser.add_argument('--runs',type=int,default=30)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if args.runs<20:raise SystemExit('At least 20 samples are required for P95')
    samples=[]
    for _ in range(args.runs):
        with tempfile.TemporaryDirectory(prefix='netmate-startup-') as profile,tempfile.TemporaryFile() as log:
            env=dict(os.environ,NETMATE_DATA_DIR=profile,XDG_CONFIG_HOME=str(Path(profile,'config')),NETMATE_PERF_READY='1')
            started=time.perf_counter()
            process=subprocess.Popen([str(args.binary.resolve())],env=env,stdout=log,stderr=log,start_new_session=os.name!='nt')
            try:
                marker=Path(profile,'ui-ready')
                while not marker.exists():
                    if process.poll() is not None:raise RuntimeError('Agent exited during startup')
                    if time.perf_counter()-started>15:raise RuntimeError('Native UI first paint timed out')
                    time.sleep(.005)
                samples.append(time.perf_counter()-started)
            finally:stop(process)
    p95=sorted(samples)[math.ceil(len(samples)*.95)-1]
    result=dict(os=platform.platform(),hardware=platform.machine(),binary=str(args.binary.resolve()),binarySha256=hashlib.sha256(args.binary.read_bytes()).hexdigest(),debugger=False,kind='native-config-and-first-paint',profile='fresh per process launch',osPageCache='uncontrolled',seconds=samples,p95Seconds=p95)
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Native UI startup P95: {p95:.3f} seconds ({len(samples)} samples)')
    if p95>1:raise SystemExit('Desktop startup budget exceeded')
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Run comparable isolated desktop measurements sequentially, with no debugger."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--baseline',type=Path);args=parser.parse_args()
    out=ROOT/'dist-native';out.mkdir(exist_ok=True)
    binary=ROOT/'target/release/netmate-agent'
    commands=[['dbus-run-session','--',sys.executable,'tools/native/measure.py',str(binary),'--seconds','600','--out',str(out/'linux-background.json')],
              ['dbus-run-session','--','xvfb-run','-a',sys.executable,'tools/native/measure.py',str(binary),'--ui','--seconds','60','--out',str(out/'linux-foreground.json')],
              ['dbus-run-session','--','xvfb-run','-a',sys.executable,'tools/native/startup.py',str(binary),'--runs','30','--out',str(out/'linux-startup.json')]]
    if args.baseline:
        for mode in ('foreground','background'):
            commands.append(['dbus-run-session','--','xvfb-run','-a',sys.executable,'tools/native/measure_baseline.py',str(args.baseline.resolve()),'--seconds','60','--out',str(out/f'linux-baseline-{mode}.json')]+(['--background']if mode=='background'else[]))
    for command in commands:
        print('Running',command[command.index('--out')+1],flush=True)
        subprocess.run(command,cwd=ROOT,check=True)
    for mode in ('foreground','background'):
        subprocess.run([sys.executable,'tools/native/check_budget.py',str(out/f'linux-{mode}.json')],cwd=ROOT,check=True)
if __name__=='__main__':main()

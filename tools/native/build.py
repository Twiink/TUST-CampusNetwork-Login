#!/usr/bin/env python3
"""Host-native builds; Cargo.toml is the product version source."""
import argparse
from pathlib import Path
import platform
import subprocess

ROOT = Path(__file__).resolve().parents[2]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--release',action='store_true')
    parser.add_argument('--run',action='store_true')
    args=parser.parse_args()
    command=['cargo','build','--locked','-p','netmate-agent']
    if platform.system()!='Darwin': command+=['-p','netmate-ui']
    if args.release: command+=['--release']
    subprocess.run(command,cwd=ROOT,check=True)
    if platform.system()=='Darwin':
        subprocess.run(['swift','build','-c','release' if args.release else 'debug'],cwd=ROOT/'apps/macos',check=True)
        import shutil
        for name in ('netmate-ui','netmate-host'):
            shutil.copy2(ROOT/'apps/macos/.build'/('release' if args.release else 'debug')/name,ROOT/'target'/('release' if args.release else 'debug')/name)
    if args.run:
        subprocess.run([str(ROOT/'target'/('release' if args.release else 'debug')/('netmate-agent.exe' if platform.system()=='Windows' else 'netmate-agent'))],cwd=ROOT,check=True)
if __name__=='__main__': main()

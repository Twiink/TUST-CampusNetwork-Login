#!/usr/bin/env python3
"""Measure Activity.reportFullyDrawn after native config has rendered, across cold processes."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time


def adb(*args):return subprocess.check_output(['adb',*args],text=True,stderr=subprocess.STDOUT)
def last_draw(package):
    lines=adb('logcat','-d','-t','1500','-s','ActivityTaskManager:I').splitlines()
    return next((line for line in reversed(lines)if f'Fully drawn {package}/'in line),None)
def millis(text):
    units={'h':3600000,'m':60000,'s':1000,'ms':1}
    parts=re.findall(r'(\d+)(ms|h|m|s)',text)
    if not parts:raise RuntimeError('Unrecognized fully drawn duration')
    return sum(int(count)*units[unit]for count,unit in parts)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--package',default='com.netmate.app');parser.add_argument('--runs',type=int,default=30);parser.add_argument('--apk',type=Path);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    if args.runs<20:raise SystemExit('At least 20 samples are required for P95')
    times=[]
    for _ in range(args.runs):
        previous=last_draw(args.package)
        output=adb('shell','am','start','-W','-S','-n',f'{args.package}/.MainActivity')
        if 'Error:'in output:raise RuntimeError(output)
        deadline=time.monotonic()+15
        while time.monotonic()<deadline:
            current=last_draw(args.package)
            if current and current!=previous:
                match=re.search(r'Fully drawn .+: \+([^\s]+)',current)
                if match:times.append(millis(match[1]));break
            time.sleep(.1)
        else:raise RuntimeError('Fully drawn evidence missing; refusing to substitute am start TotalTime')
    p95=sorted(times)[math.ceil(len(times)*.95)-1]
    result=dict(package=args.package,os=adb('shell','getprop','ro.build.fingerprint').strip(),emulator=adb('shell','getprop','ro.kernel.qemu').strip()=='1',cpuOnline=adb('shell','cat','/sys/devices/system/cpu/online').strip(),display=adb('shell','wm','size').strip(),sourceRevision=os.environ.get('GITHUB_SHA'),apkSha256=hashlib.file_digest(args.apk.open('rb'),'sha256').hexdigest()if args.apk else None,debugger=False,kind='reportFullyDrawn-after-config-draw',milliseconds=times,p95Milliseconds=p95)
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,indent=2)+'\n');print(f'Android startup P95: {p95} ms')
    if p95>1500:raise SystemExit('Android startup budget exceeded')
if __name__=='__main__':main()

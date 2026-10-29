#!/usr/bin/env python3
"""Read-only Linux memory/CPU measurement of the preserved packaged Electron baseline."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import tempfile
import time
from measure import linux_tree

def close_window(window):
    class Data(ctypes.Union):_fields_=[('b',ctypes.c_char*20),('s',ctypes.c_short*10),('l',ctypes.c_long*5)]
    class ClientMessage(ctypes.Structure):_fields_=[('type',ctypes.c_int),('serial',ctypes.c_ulong),('send_event',ctypes.c_int),('display',ctypes.c_void_p),('window',ctypes.c_ulong),('message_type',ctypes.c_ulong),('format',ctypes.c_int),('data',Data)]
    class Event(ctypes.Union):_fields_=[('client',ClientMessage),('padding',ctypes.c_long*24)]
    lib=ctypes.CDLL('libX11.so.6');lib.XOpenDisplay.restype=ctypes.c_void_p;lib.XInternAtom.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int];lib.XInternAtom.restype=ctypes.c_ulong
    lib.XSendEvent.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_long,ctypes.POINTER(Event)];lib.XFlush.argtypes=[ctypes.c_void_p];lib.XCloseDisplay.argtypes=[ctypes.c_void_p]
    display=lib.XOpenDisplay(None)
    if not display:raise RuntimeError('Cannot access the isolated X display')
    try:
        event=Event();event.client.type=33;event.client.send_event=1;event.client.display=display;event.client.window=int(window);event.client.format=32;event.client.message_type=lib.XInternAtom(display,b'WM_PROTOCOLS',0);event.client.data.l[0]=lib.XInternAtom(display,b'WM_DELETE_WINDOW',0)
        if not lib.XSendEvent(display,int(window),0,0,ctypes.byref(event)):raise RuntimeError('Window close request failed')
        lib.XFlush(display)
    finally:lib.XCloseDisplay(display)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('binary',type=Path);parser.add_argument('--background',action='store_true');parser.add_argument('--warmup',type=int);parser.add_argument('--seconds',type=int,default=600);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='netmate-baseline-')as profile,tempfile.TemporaryFile()as log:
        env=dict(os.environ,XDG_CONFIG_HOME=str(Path(profile,'config')))
        process=subprocess.Popen([str(args.binary.resolve()),f'--user-data-dir={profile}','--ozone-platform=x11'],env=env,stdout=log,stderr=log,start_new_session=True)
        try:
            time.sleep(5)
            if args.background:
                windows=subprocess.check_output(['xdotool','search','--pid',str(process.pid),'--name','NetMate'],text=True).splitlines()
                if not windows:raise RuntimeError('Baseline window was not created')
                for window in windows:close_window(window)
            time.sleep(args.warmup if args.warmup is not None else (150 if args.background else 30));known={};cpu={};samples=[]
            for _ in range(args.seconds):
                if process.poll()is not None:raise RuntimeError('Baseline exited')
                samples.append(dict(linux_tree(process.pid,known,cpu),elapsed=time.monotonic()));time.sleep(1)
            duration=samples[-1]['elapsed']-samples[0]['elapsed']
            result=dict(os=platform.platform(),distribution=platform.freedesktop_os_release().get('PRETTY_NAME'),baselineRef='refs/codex/baselines/native-rewrite-20261029',binarySha256=hashlib.sha256(args.binary.read_bytes()).hexdigest(),mode='background'if args.background else'foreground',debugger=False,seconds=args.seconds,warmupSeconds=args.warmup if args.warmup is not None else (150 if args.background else 30),windowClose='WM_DELETE_WINDOW'if args.background else None,display=env.get('DISPLAY'),samples=samples,peakPssBytes=max(s['pssBytes']for s in samples),peakRssBytes=max(s['rssBytes']for s in samples),cpuSingleCorePercent=(samples[-1]['cpuSeconds']-samples[0]['cpuSeconds'])/duration*100,gpuBytes=None,peakSwapPssBytes=max(s['swapPssBytes']for s in samples))
            args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='samples'}))
        finally:
            log.seek(0);args.out.with_suffix('.stderr.log').write_bytes(log.read(131072))
            try:os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            process.wait(timeout=10)
if __name__=='__main__':main()

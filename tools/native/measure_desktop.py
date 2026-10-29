#!/usr/bin/env python3
"""Windows Private Bytes/Working Set and macOS physical footprint/RSS, full process tree."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import time
import psutil
from startup import stop

class RusageV2(ctypes.Structure):
    _fields_=[('uuid',ctypes.c_ubyte*16)]+[(name,ctypes.c_uint64)for name in ('user','system','idle','interrupt','pageins','wired','resident','footprint','started','exited','child_user','child_system','child_idle','child_interrupt','child_pageins','child_elapsed','read','written')]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('binary',type=Path);parser.add_argument('--ui',action='store_true')
    parser.add_argument('--seconds',type=int,default=600);parser.add_argument('--warmup',type=int,default=30)
    parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    system=platform.system()
    if system not in ('Windows','Darwin'):raise SystemExit('Use measure.py on Linux')
    lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)if system=='Darwin'else None
    with tempfile.TemporaryDirectory(prefix='netmate-perf-')as profile,tempfile.TemporaryFile()as log:
        env=dict(os.environ,NETMATE_DATA_DIR=profile,NETMATE_PERF_READY='1')
        process=subprocess.Popen([str(args.binary.resolve())]+([]if args.ui else['--background']),env=env,stdout=log,stderr=log,start_new_session=system!='Windows')
        try:
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                ready=Path(profile,'ui-ready').exists()if args.ui else subprocess.run([str(args.binary.resolve()),'--status'],env=env,capture_output=True).returncode==0
                if ready:break
                if process.poll()is not None:raise RuntimeError(f'Agent exited before ready (exit {process.returncode})')
                time.sleep(.02)
            else:raise RuntimeError('Application did not become ready')
            ui=psutil.Process(int(Path(profile,'ui-ready').read_text()))if args.ui else None
            ui_started=ui.create_time()if ui else None
            time.sleep(args.warmup);known={};cpu={};samples=[]
            for _ in range(args.seconds):
                if process.poll()is not None:raise RuntimeError('Agent exited')
                if ui and (not ui.is_running()or ui.create_time()!=ui_started or ui.status()==psutil.STATUS_ZOMBIE):
                    raise RuntimeError('Visible UI exited during foreground measurement')
                root=psutil.Process(process.pid)
                for child in [root]+root.children(recursive=True):known[(child.pid,child.create_time())]=child
                if ui:known[(ui.pid,ui_started)]=ui
                memory=rss=0;active=[]
                for identity,child in list(known.items()):
                    try:
                        if child.create_time()!=identity[1]:continue
                        info=child.memory_info();rss+=info.rss
                        usage=child.cpu_times();cpu[identity]=usage.user+usage.system
                        if system=='Windows':size=info.private
                        else:
                            usage=RusageV2()
                            if lib.proc_pid_rusage(child.pid,2,ctypes.byref(usage))!=0:raise RuntimeError(f'physical footprint unavailable for {child.pid}')
                            size=usage.footprint
                        memory+=size;active.append(dict(pid=child.pid,name=child.name(),residentBytes=info.rss,memoryBytes=size,threads=child.num_threads(),handles=child.num_handles()if system=='Windows'else child.num_fds()))
                    except psutil.NoSuchProcess:continue
                samples.append(dict(elapsed=time.monotonic(),memoryBytes=memory,rssBytes=rss,cpuSeconds=sum(cpu.values()),processes=active));time.sleep(1)
            duration=samples[-1]['elapsed']-samples[0]['elapsed']
            result=dict(os=platform.platform(),machine=platform.machine(),binarySha256=hashlib.sha256(args.binary.read_bytes()).hexdigest(),mode='foreground'if args.ui else'background',debugger=False,memoryMetric='privateBytes'if system=='Windows'else'physicalFootprintBytes',peakMemoryBytes=max(s['memoryBytes']for s in samples),peakRssBytes=max(s['rssBytes']for s in samples),cpuSingleCorePercent=(samples[-1]['cpuSeconds']-samples[0]['cpuSeconds'])/duration*100,samples=samples,gpuBytes=None,gpuNote='Measure separately with platform GPU tools; no GPU estimate included in process memory')
            args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='samples'}))
        finally:
            log.seek(0)
            args.out.parent.mkdir(parents=True,exist_ok=True)
            args.out.with_suffix('.stderr.log').write_bytes(log.read(262144))
            stop(process)
if __name__=='__main__':main()

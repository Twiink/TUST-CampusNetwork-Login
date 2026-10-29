#!/usr/bin/env python3
"""Measure a packaged process tree without debugger injection (Linux/Android)."""
import argparse
import json
import hashlib
import platform
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time


def linux_tree(root, known, cpu_totals):
    records = {}
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            fields = (path / 'stat').read_text().rsplit(')', 1)[1].split()
            records[int(path.name)] = (int(fields[1]), (int(fields[11]) + int(fields[12])) / os.sysconf('SC_CLK_TCK'), int(fields[19]), fields[0])
        except (OSError, ValueError, IndexError):
            continue
    found = {root} | {pid for pid,started in known.items() if pid in records and records[pid][2]==started}
    while True:
        children = {pid for pid, record in records.items() if record[0] in found}
        if children <= found:
            break
        found |= children
    known.update({pid:records[pid][2] for pid in found if pid in records})
    rss = pss = swap = 0
    details=[]
    for pid in found:
        try:
            if pid not in records or records[pid][3]=='Z':continue
            values = {}
            for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines():
                key, _, value = line.partition(':')
                if key in ('Rss', 'Pss','SwapPss'):
                    values[key] = int(value.split()[0]) * 1024
            if 'Rss' not in values or 'Pss' not in values:raise RuntimeError(f'Memory accounting unavailable for PID {pid}')
            rss += values['Rss']
            pss += values['Pss'];swap+=values.get('SwapPss',0)
            cpu_totals[(pid,records[pid][2])] = records[pid][1]
            details.append({'pid':pid,'name':Path(f'/proc/{pid}/comm').read_text().strip(),'pssBytes':values['Pss'],'rssBytes':values['Rss']})
        except FileNotFoundError:continue
        except PermissionError as error:raise RuntimeError(f'Memory access denied for PID {pid}; report would omit a live process') from error
    return {'rssBytes': rss, 'pssBytes': pss, 'swapPssBytes':swap,'cpuSeconds': sum(cpu_totals.values()), 'processes':len(details),'details':details}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('binary', type=Path)
    parser.add_argument('--seconds', type=int, default=600)
    parser.add_argument('--warmup', type=int, default=30)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--ui', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='netmate-perf-') as profile:
        env = dict(os.environ, NETMATE_DATA_DIR=profile, XDG_CONFIG_HOME=str(Path(profile, 'config')), NETMATE_PERF_READY='1')
        command = [str(args.binary.resolve())] + ([] if args.ui else ['--background'])
        with tempfile.TemporaryFile() as log:
            start = time.monotonic()
            process = subprocess.Popen(command, env=env, stdout=log, stderr=log, start_new_session=True)
            try:
                ready = None
                while time.monotonic() - start < 15:
                    if process.poll() is not None:
                        raise RuntimeError('Application exited before ready')
                    if Path(profile, 'agent.sock').exists() and (not args.ui or Path(profile, 'ui-ready').exists()):
                        ready = time.monotonic() - start
                        break
                    time.sleep(0.02)
                if ready is None:
                    raise RuntimeError('Agent did not become ready')
                ui_pid=int(Path(profile,'ui-ready').read_text()) if args.ui else None
                time.sleep(args.warmup)
                samples = []
                known={};cpu_totals={}
                for _ in range(args.seconds):
                    if process.poll() is not None:
                        raise RuntimeError('Application exited while measuring')
                    if ui_pid is not None:
                        status=Path(f'/proc/{ui_pid}/stat')
                        if not status.exists() or status.read_text().rsplit(')',1)[1].split()[0]=='Z':raise RuntimeError('UI exited; refusing to report background memory as foreground')
                    samples.append(dict(linux_tree(process.pid,known,cpu_totals), elapsed=time.monotonic() - start))
                    time.sleep(1)
                duration = samples[-1]['elapsed'] - samples[0]['elapsed']
                result = {'os': platform.platform(), 'distribution': platform.freedesktop_os_release().get('PRETTY_NAME'), 'processor':next((line.split(':',1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines()if line.startswith('model name')),'unknown'), 'binarySha256':hashlib.sha256(Path(f'/proc/{process.pid}/exe').read_bytes()).hexdigest(), 'memoryMetric':'pssBytes', 'gpuBytes':None, 'gpuNote':'GPU allocations require separate driver/compositor measurement', 'machine': os.uname().machine,
                          'binary': str(args.binary.resolve()), 'debugger': False,
                          'mode': 'foreground' if args.ui else 'background',
                          'display': env.get('DISPLAY'), 'rendererOverride': env.get('GSK_RENDERER'),
                          'storageBytes':{file.name:file.stat().st_size for file in Path(profile).glob('*')if file.is_file()}, 'uiBinarySha256':hashlib.sha256(Path(f'/proc/{ui_pid}/exe').read_bytes()).hexdigest()if args.ui else None, 'readySeconds': ready, 'readyKind': 'painted-ui-with-config' if args.ui else 'agent-socket', 'samples': samples,
                          'cpuSingleCorePercent': (samples[-1]['cpuSeconds'] - samples[0]['cpuSeconds']) / duration * 100 if duration else 0,
                          'peakPssBytes': max(s['pssBytes'] for s in samples),
                          'peakSwapPssBytes':max(s['swapPssBytes']for s in samples),'peakRssBytes': max(s['rssBytes'] for s in samples)}
                args.out.parent.mkdir(parents=True, exist_ok=True)
                args.out.write_text(json.dumps(result, indent=2) + '\n')
                print(json.dumps({k: v for k, v in result.items() if k != 'samples'}))
            finally:
                log.seek(0)
                args.out.parent.mkdir(parents=True,exist_ok=True)
                args.out.with_suffix('.stderr.log').write_bytes(log.read(262144))
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Keep a system trace of a failed CI startup; never used to replace gate samples."""
import argparse
from pathlib import Path
import subprocess
import time


def adb(*args, **kwargs):
    return subprocess.run(['adb', *args], check=True, text=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=Path('dist-native/android-startup.perfetto-trace'))
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    remote = '/data/misc/perfetto-traces/netmate-startup.perfetto-trace'
    config = '''buffers { size_kb: 32768 fill_policy: RING_BUFFER }
duration_ms: 12000
data_sources { config { name: "linux.ftrace" ftrace_config {
  ftrace_events: "sched/sched_switch"
  ftrace_events: "sched/sched_waking"
  ftrace_events: "power/cpu_frequency"
  atrace_categories: "am"
  atrace_categories: "wm"
  atrace_categories: "gfx"
  atrace_categories: "view"
  atrace_categories: "binder_driver"
  atrace_apps: "com.netmate.app"
} } }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true } } }
'''
    adb('shell', 'perfetto', '--background', '--txt', '-c', '-', '-o', remote, input=config)
    time.sleep(1)
    adb('shell', 'am', 'start', '-W', '-S', '-n', 'com.netmate.app/.MainActivity')
    time.sleep(12)
    adb('pull', remote, str(args.out))
    for name, command in [('cpu', ['shell', 'dumpsys', 'cpuinfo']),
                          ('gfx', ['shell', 'dumpsys', 'gfxinfo', 'com.netmate.app'])]:
        with args.out.with_suffix(f'.{name}.txt').open('w') as output:
            adb(*command, stdout=output)


if __name__ == '__main__':
    main()

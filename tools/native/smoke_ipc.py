#!/usr/bin/env python3
"""Native backend lifecycle/configuration/log integration, isolated from user data."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time


def main():
    parser=argparse.ArgumentParser();parser.add_argument('binary',type=Path);args=parser.parse_args()
    binary=str(args.binary.resolve())
    version=subprocess.check_output([binary,'--version'],text=True)
    if 'controlled OS adapter'not in version:raise SystemExit('Integration requires the separately built test-driver agent')
    with tempfile.TemporaryDirectory(prefix='netmate-native-ipc-')as profile:
        env=dict(os.environ,NETMATE_DATA_DIR=profile,XDG_CONFIG_HOME=str(Path(profile,'config')))
        def request(op,body=None):
            command={'op':op}
            if body is not None:command['args']=body
            result=subprocess.run([binary,'--request',json.dumps(command)],env=env,capture_output=True,text=True,timeout=20)
            if result.returncode:raise RuntimeError(result.stderr)
            return json.loads(result.stdout)
        with tempfile.TemporaryFile()as log:
            agent=subprocess.Popen([binary,'--background'],env=env,stdout=log,stderr=log)
            try:
                for _ in range(100):
                    try:request('snapshot');break
                    except Exception:
                        if agent.poll()is not None:raise RuntimeError('Test agent exited')
                        time.sleep(.05)
                else:raise RuntimeError('Agent IPC unavailable')
                for _ in range(10):subprocess.run([binary,'--background'],env=env,check=True,timeout=10,stdout=subprocess.DEVNULL)
                config=request('config');old=config.copy();config['settings']['autoUpdate']=False
                saved=request('save_config',config);assert saved['revision']>old['revision']
                stale=subprocess.run([binary,'--request',json.dumps({'op':'save_config','args':old})],env=env,capture_output=True)
                assert stale.returncode!=0,'stale configuration was accepted'
                assert isinstance(request('scan'),list)
                request('retry');time.sleep(.2);request('stop_recovery')
                state=request('snapshot');assert not state['authenticated'] and not state['internetReachable']
                page=request('logs',{'limit':2});assert len(page['entries'])<=2 and 'total'in page
                export=Path(request('export_logs',{'format':'json','query':{}})['path'])
                assert json.loads(export.read_text())['entries']
                request('clear_logs');assert request('logs',{})['generation']>page['generation']
                request('quit');agent.wait(timeout=10);assert agent.returncode==0
            finally:
                if agent.poll()is None:
                    agent.terminate();agent.wait(timeout=10)
    print('Native IPC/config/log lifecycle integration passed')
if __name__=='__main__':main()

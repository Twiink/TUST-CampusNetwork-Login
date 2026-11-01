#!/usr/bin/env python3
"""CI native Win32 UI Automation smoke; hardware operations are never invoked."""
import os
from pathlib import Path
import subprocess
import tempfile
import time

from pywinauto import findwindows


def enable_dump_collection():
    """WER LocalDumps keeps a full user-mode dump for every netmate-ui abort."""
    key = r'HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\netmate-ui.exe'
    dumps = Path(os.environ.get('NETMATE_DUMP_DIR', r'C:\netmate-dumps'))
    dumps.mkdir(parents=True, exist_ok=True)
    subprocess.run(['reg', 'add', key, '/v', 'DumpFolder', '/t', 'REG_EXPAND_SZ',
                    '/d', str(dumps), '/f'], capture_output=True)
    subprocess.run(['reg', 'add', key, '/v', 'DumpType', '/t', 'REG_DWORD', '/d', '2', '/f'],
                   capture_output=True)
    subprocess.run(['reg', 'add', key, '/v', 'DumpCount', '/t', 'REG_DWORD', '/d', '3', '/f'],
                   capture_output=True)


def crash_report():
    query = ("Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000,1001} -MaxEvents 10 | "
             "Where-Object { $_.Message -match 'netmate' } | "
             "ForEach-Object { $_.TimeCreated.ToString('s') + ' ' + $_.Message }")
    result = subprocess.run(['powershell', '-NoProfile', '-Command', query],
                            capture_output=True, text=True)
    lines = [result.stdout.strip() or '(no application error events)']
    dumps = Path(os.environ.get('NETMATE_DUMP_DIR', r'C:\netmate-dumps'))
    if dumps.exists():
        lines.append('--- local dumps ---')
        lines += [f'{p.name} {p.stat().st_size} bytes' for p in sorted(dumps.glob('*'))]
    return '\n'.join(lines)


def main():
    if os.environ.get('CI') != 'true':
        raise SystemExit('Native UI E2E runs in CI; local execution is disabled for this workspace')
    from pywinauto import Application
    root = Path(__file__).resolve().parents[2]
    binary = root / 'target/release'
    trace = Path(tempfile.gettempdir()) / 'netmate-ui-trace.log'
    enable_dump_collection()
    with tempfile.TemporaryDirectory(prefix='netmate-native-ui-') as profile:
        env = dict(os.environ, NETMATE_DATA_DIR=profile, NETMATE_UI_TRACE='1', RUST_BACKTRACE='1')
        agent = subprocess.Popen([str(binary / 'netmate-agent.exe'), '--background'], env=env)
        try:
            time.sleep(1)
            screenshots = root / 'dist-native/visual/windows'
            screenshots.mkdir(parents=True, exist_ok=True)
            for cycle in range(100):
                ui_log = Path(profile) / 'ui-console.log'
                with open(ui_log, 'ab') as console:
                    process = subprocess.Popen(
                        [str(binary / 'netmate-ui.exe')],
                        env=env,
                        stdout=console,
                        stderr=console,
                        stdin=subprocess.DEVNULL,
                    )
                try:
                    app = Application(backend='uia').connect(process=process.pid, timeout=15)
                    window = app.window(title='NetMate')
                    window.wait('visible', timeout=15)
                except Exception:
                    report = [f'cycle {cycle}: netmate-ui pid {process.pid} poll={process.poll()}']
                    report.append('--- netmate-ui startup trace ---')
                    report.append(trace.read_text(errors='replace') if trace.exists() else '(missing)')
                    report.append('--- windows error reporting ---')
                    report.append(crash_report())
                    report.append('--- netmate-ui console output ---')
                    report.append(ui_log.read_text(errors='replace') if ui_log.exists() else '(empty)')
                    report.append('--- windows reported by UIA for the process ---')
                    try:
                        report += [str(e) for e in findwindows.find_elements(process=process.pid, backend='uia')]
                    except Exception as exc:
                        report.append(f'enumeration failed: {exc!r}')
                    raise RuntimeError('\n'.join(report)) from None
                if cycle == 0:
                    for theme, switch, next_switch in [('light', '切换至白天模式', '切换至黑夜模式'), ('dark', '切换至黑夜模式', '切换至白天模式')]:
                        toggle = window.child_window(title=switch, control_type='Button')
                        if toggle.exists(timeout=1):
                            toggle.click()
                        window.child_window(title=next_switch, control_type='Button').wait('visible', timeout=5)
                        for page, ready in [('运行状态', '网络连接状态'), ('配置设置', '账号配置'), ('运行日志', '搜索 / 刷新'), ('关于', '检查更新')]:
                            window.child_window(title=page, control_type='Button').click()
                            window.child_window(title=ready).wait('visible', timeout=5)
                            window.capture_as_image().save(screenshots / f'{theme}-{page}.png')
                    window.child_window(title='运行日志', control_type='Button').click()
                    search = window.child_window(auto_id='120', control_type='Edit')
                    search.set_edit_text('draft-filter')
                    assert search.get_value() == 'draft-filter', 'UI Automation could not populate the filter'
                    window.child_window(title='切换至白天模式', control_type='Button').click()
                    assert search.get_value() == 'draft-filter', 'Theme switch discarded an input'
                    assert Path(profile, 'appearance-v1').read_text().strip() == 'light'
                else:
                    window.child_window(title='切换至黑夜模式', control_type='Button').wait('visible', timeout=5)
                window.child_window(title='关于', control_type='Button').click()
                window.child_window(title='检查更新', control_type='Button').wait('visible', timeout=5)
                window.close()
                process.wait(timeout=10)
                assert subprocess.run([str(binary / 'netmate-agent.exe'), '--status'], env=env, capture_output=True).returncode == 0
        finally:
            subprocess.run([str(binary / 'netmate-agent.exe'), '--request', '{"op":"quit"}'], env=env, capture_output=True)
            agent.wait(timeout=10)

if __name__ == '__main__':
    main()

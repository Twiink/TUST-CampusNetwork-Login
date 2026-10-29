#!/usr/bin/env python3
"""CI native Win32 UI Automation smoke; hardware operations are never invoked."""
import os
from pathlib import Path
import subprocess
import tempfile
import time

def main():
    if os.environ.get('CI') != 'true':
        raise SystemExit('Native UI E2E runs in CI; local execution is disabled for this workspace')
    from pywinauto import Application
    root = Path(__file__).resolve().parents[2]
    binary = root / 'target/release'
    with tempfile.TemporaryDirectory(prefix='netmate-native-ui-') as profile:
        env = dict(os.environ, NETMATE_DATA_DIR=profile)
        agent = subprocess.Popen([str(binary / 'netmate-agent.exe'), '--background'], env=env)
        try:
            time.sleep(1)
            screenshots = root / 'dist-native/visual/windows'
            screenshots.mkdir(parents=True, exist_ok=True)
            for cycle in range(100):
                process = subprocess.Popen([str(binary / 'netmate-ui.exe')], env=env)
                app = Application(backend='uia').connect(process=process.pid, timeout=15)
                window = app.window(title='NetMate')
                window.wait('visible', timeout=15)
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
                    window.child_window(title='切换至白天模式', control_type='Button').click()
                    assert search.window_text() == 'draft-filter', 'Theme switch discarded an input'
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

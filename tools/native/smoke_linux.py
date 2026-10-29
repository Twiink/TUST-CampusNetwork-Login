#!/usr/bin/env python3
"""CI-only native AT-SPI smoke and repeated window lifecycle regression."""
import os
from pathlib import Path
import subprocess
import tempfile
import time


def main():
    if os.environ.get('CI') != 'true':
        raise SystemExit('Native UI E2E runs in CI; local execution is disabled for this workspace')
    import pyatspi
    import gi
    gi.require_version('Gtk', '4.0')
    from gi.repository import GLib
    root = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix='netmate-native-ui-') as profile:
        env = dict(os.environ, NETMATE_DATA_DIR=profile, XDG_CONFIG_HOME=str(Path(profile, 'config')), GTK_A11Y='atspi')
        agent = subprocess.Popen([str(Path(os.environ.get('NETMATE_BINARY_DIR', root / 'target/release')) / 'netmate-agent'), '--background'], env=env)
        def find(name):
            return pyatspi.findDescendant(pyatspi.Registry.getDesktop(0), lambda item: item.name == name)
        def wait_for(name, seconds=10):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                item = find(name)
                if item is not None:
                    return item
                time.sleep(.05)
            raise AssertionError(f'Native control was not accessible: {name}')
        screenshots = root / 'dist-native/visual/linux'
        screenshots.mkdir(parents=True, exist_ok=True)
        try:
            for cycle in range(100):
                ui = subprocess.Popen([str(Path(os.environ.get('NETMATE_BINARY_DIR', root / 'target/release')) / 'netmate-ui')], env=env)
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline and find('关于') is None:
                    if ui.poll() is not None:
                        raise RuntimeError('UI exited before becoming interactive')
                    time.sleep(.1)
                about = find('关于')
                assert about is not None, 'Native navigation was not exposed through AT-SPI'
                if cycle == 0:
                    for theme, switch, next_switch in [('light', '切换至白天模式', '切换至黑夜模式'), ('dark', '切换至黑夜模式', '切换至白天模式')]:
                        toggle = find(switch)
                        if toggle is not None:
                            toggle.queryAction().doAction(0)
                        wait_for(next_switch)
                        for page, ready in [('运行状态', '网络连接状态'), ('配置设置', '账号配置'), ('运行日志', '搜索全部保留历史'), ('关于', '检查更新')]:
                            wait_for(page).queryAction().doAction(0)
                            wait_for(ready)
                            subprocess.run(['scrot', str(screenshots / f'{theme}-{page}.png')], env=env, check=True)
                    wait_for('运行日志').queryAction().doAction(0)
                    search = wait_for('搜索全部保留历史').queryEditableText()
                    search.setTextContents('draft-filter')
                    wait_for('切换至白天模式').queryAction().doAction(0)
                    wait_for('切换至黑夜模式')
                    value = wait_for('搜索全部保留历史').queryText()
                    assert value.getText(0, value.characterCount) == 'draft-filter', 'Theme switch discarded an input'
                    assert Path(profile, 'appearance-v1').read_text().strip() == 'light'
                else:
                    wait_for('切换至黑夜模式')
                about.queryAction().doAction(0)
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline and find('检查更新') is None:
                    time.sleep(.05)
                assert find('检查更新') is not None, 'About page did not render'
                window = find('NetMate')
                if window is None:
                    raise RuntimeError('Native window disappeared')
                # GTK application quit is an OS window lifecycle action, not SIGKILL.
                subprocess.run(['gdbus', 'call', '--session', '--dest', 'com.netmate.native.ui', '--object-path', '/com/netmate/native/ui', '--method', 'org.gtk.Actions.Activate', 'quit', '[]', '{}'], env=env, check=True, capture_output=True)
                ui.wait(timeout=10)
                result = subprocess.run([str(Path(os.environ.get('NETMATE_BINARY_DIR', root / 'target/release')) / 'netmate-agent'), '--status'], env=env, capture_output=True)
                assert result.returncode == 0, f'Agent failed after window cycle {cycle}'
        finally:
            subprocess.run([str(Path(os.environ.get('NETMATE_BINARY_DIR', root / 'target/release')) / 'netmate-agent'), '--request', '{"op":"quit"}'], env=env, capture_output=True)
            agent.wait(timeout=10)

if __name__ == '__main__':
    main()

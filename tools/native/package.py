#!/usr/bin/env python3
"""Build native distribution artifacts. No JavaScript runtime enters the packages."""
import argparse
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = tomllib.loads((ROOT / 'Cargo.toml').read_text())['workspace']['package']['version']


def run(*command, cwd=ROOT):
    subprocess.run([str(x) for x in command], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target')
    parser.add_argument('--format', choices=['deb', 'rpm', 'exe', 'mac'])
    parser.add_argument('--skip-build', action='store_true')
    args = parser.parse_args()
    host = platform.system()
    arch = 'arm64' if platform.machine().lower() in ('aarch64', 'arm64') else 'x64'
    target = ['--target', args.target] if args.target else []
    if args.target:
        arch = 'arm64' if args.target.startswith('aarch64') else 'x64'
    binary = ROOT / 'target' / (args.target or '') / 'release'
    output = ROOT / 'dist-native'
    output.mkdir(exist_ok=True)
    if not args.skip_build:
        packages = ['-p', 'netmate-agent'] + ([] if host == 'Darwin' else ['-p', 'netmate-ui'])
        run('cargo', 'build', '--release', '--locked', *packages, *target)
        if host == 'Darwin':
            run('swift', 'build', '-c', 'release', cwd=ROOT / 'apps/macos')
    kind = args.format or {'Linux': 'deb', 'Windows': 'exe', 'Darwin': 'mac'}[host]
    with tempfile.TemporaryDirectory(prefix='netmate-package-') as temporary:
        stage = Path(temporary)
        if kind in ('deb', 'rpm'):
            lib = stage / 'usr/lib/netmate-native'; lib.mkdir(parents=True)
            for name in ('netmate-agent', 'netmate-ui'):
                shutil.copy2(binary / name, lib / name)
            launch = stage / 'usr/bin'; launch.mkdir(parents=True)
            (launch / 'netmate').symlink_to('../lib/netmate-native/netmate-ui')
            applications = stage / 'usr/share/applications'; applications.mkdir(parents=True)
            (applications / 'netmate.desktop').write_text('[Desktop Entry]\nType=Application\nName=NetMate\nExec=/usr/lib/netmate-native/netmate-ui\nIcon=network-wireless\nCategories=Network;\nStartupNotify=true\n')
            if kind == 'deb':
                control = stage / 'DEBIAN'; control.mkdir()
                (control / 'control').write_text(f'Package: netmate-native\nVersion: {VERSION}\nArchitecture: {"arm64" if arch == "arm64" else "amd64"}\nMaintainer: Twiink <Twiink@users.noreply.github.com>\nDepends: libgtk-4-1 (>= 4.16), libdbus-1-3, network-manager, xdg-utils\nSection: net\nPriority: optional\nDescription: NetMate native WiFi and campus authentication manager\n')
                run('dpkg-deb', '--root-owner-group', '--build', stage, output / f'NetMate-{VERSION}-linux-{arch}.deb')
            else:
                top = stage / 'rpmbuild'
                for name in ('BUILD', 'BUILDROOT', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS'):
                    (top / name).mkdir(parents=True)
                spec = top / 'SPECS/netmate.spec'
                spec.write_text(f'Name: netmate-native\nVersion: {VERSION}\nRelease: 1\nSummary: Native WiFi and campus authentication manager\nLicense: ISC\nRequires: gtk4 >= 4.16, NetworkManager, xdg-utils\n\n%description\nNetMate native desktop application.\n\n%install\nmkdir -p %{{buildroot}}/usr\ncp -a "{stage}/usr/." %{{buildroot}}/usr/\n\n%files\n/usr/lib/netmate-native\n/usr/bin/netmate\n/usr/share/applications/netmate.desktop\n')
                run('rpmbuild', '--define', f'_topdir {top}', '-bb', spec)
                for file in (top / 'RPMS').rglob('*.rpm'):
                    shutil.copy2(file, output / f'NetMate-{VERSION}-linux-{arch}.rpm')
        elif kind == 'exe':
            for name in ('netmate-agent.exe', 'netmate-ui.exe'):
                shutil.copy2(binary / name, stage / name)
            installer = stage / 'installer.nsi'
            installer.write_text(f'''Unicode true
Name "NetMate"
OutFile "{output / f'NetMate-{VERSION}-windows-{arch}.exe'}"
InstallDir "$LOCALAPPDATA\\Programs\\NetMate"
RequestExecutionLevel user
Page directory
Page instfiles
Section
SetOutPath "$INSTDIR"
File "{stage / 'netmate-agent.exe'}"
File "{stage / 'netmate-ui.exe'}"
CreateShortcut "$SMPROGRAMS\\NetMate.lnk" "$INSTDIR\\netmate-ui.exe"
WriteUninstaller "$INSTDIR\\Uninstall.exe"
SectionEnd
Section "Uninstall"
Delete "$SMPROGRAMS\\NetMate.lnk"
DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "NetMateNative"
Delete "$INSTDIR\\netmate-ui.exe"
Delete "$INSTDIR\\netmate-agent.exe"
Delete "$INSTDIR\\Uninstall.exe"
RMDir "$INSTDIR"
SectionEnd
''')
            makensis = shutil.which('makensis') or str(Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'NSIS/makensis.exe')
            run(makensis, installer)
        else:
            import plistlib
            app = stage / 'NetMate.app'; executables = app / 'Contents/MacOS'; executables.mkdir(parents=True)
            shutil.copy2(binary / 'netmate-agent', executables / 'netmate-agent')
            for name in ('netmate-ui', 'netmate-host'):
                shutil.copy2(ROOT / 'apps/macos/.build/release' / name, executables / name)
            with (app / 'Contents/Info.plist').open('wb') as file:
                plistlib.dump({'CFBundleName': 'NetMate', 'CFBundleDisplayName': 'NetMate', 'CFBundleIdentifier': 'com.netmate.native', 'CFBundleExecutable': 'netmate-ui', 'CFBundleVersion': VERSION, 'CFBundleShortVersionString': VERSION, 'LSMinimumSystemVersion': '27.0', 'NSLocationWhenInUseUsageDescription': '读取 WiFi 名称以应用对应的连接和认证规则', 'NSHighResolutionCapable': True}, file)
            entitlements = ROOT / 'apps/macos/NetMate.entitlements'
            identity = os.environ.get('APPLE_SIGNING_IDENTITY', '-')
            for file in executables.iterdir():
                run('codesign', '--force', '--options', 'runtime', '--entitlements', entitlements, '--sign', identity, file)
            run('codesign', '--force', '--sign', identity, app)
            run('ditto', '-c', '-k', '--keepParent', app, output / f'NetMate-{VERSION}-macos-arm64.zip')
            run('hdiutil', 'create', '-volname', 'NetMate', '-srcfolder', app, '-ov', '-format', 'UDZO', output / f'NetMate-{VERSION}-macos-arm64.dmg')
    for file in sorted(output.glob('*')):
        if file.is_file():
            size = file.stat().st_size
            print(f'{file.name}: {size / 1048576:.2f} MiB')
            if size > 20 * 1048576:
                raise SystemExit(f'Package exceeds 20 MiB budget: {file.name}')

if __name__ == '__main__':
    main()

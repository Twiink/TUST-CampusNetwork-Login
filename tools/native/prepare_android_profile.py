#!/usr/bin/env python3
"""Use the APK's shipped profile for reproducible, profile-compiled cold starts."""
import argparse
import re
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', default='com.netmate.app')
    args = parser.parse_args()
    result = subprocess.check_output([
        'adb', 'shell', 'am', 'broadcast', '-a', 'androidx.profileinstaller.action.INSTALL_PROFILE',
        '-n', f'{args.package}/androidx.profileinstaller.ProfileInstallReceiver'], text=True)
    print(result.strip())
    if not re.search(r'\bresult=(1|2)\b', result):
        raise SystemExit('The APK Baseline Profile was not installed')
    result = subprocess.check_output(['adb', 'shell', 'cmd', 'package', 'compile',
                                      '-f', '-m', 'speed-profile', args.package], text=True)
    print(result.strip())
    if 'Success' not in result:
        raise SystemExit('ART could not compile the installed Baseline Profile')


if __name__ == '__main__':
    main()

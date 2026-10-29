#!/usr/bin/env python3
"""CI-only isolated instrumentation classes; service-owned tests never share fixture engines."""
import os
from pathlib import Path
import subprocess
if os.environ.get('CI')!='true':raise SystemExit('Run native instrumentation in CI or on the dedicated validation device')
root=Path(__file__).resolve().parents[2]
package='com.netmate.app.debug'
for apk in ('apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk','apps/mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'):
 subprocess.run(['adb','install','-r',str(root/apk)],check=True)
output=root/'dist-native/instrumentation';output.mkdir(parents=True,exist_ok=True)
classes=['auth.NativeEngineIntegrationTest','auth.PlatformHardeningIntegrationTest','logging.LogExportIntegrationTest','ipc.NetworkServiceIntegrationTest','NativeUiTest']
for name in classes:
 subprocess.run(['adb','shell','am','force-stop',package],check=True)
 subprocess.run(['adb','shell','pm','clear',package],check=True,stdout=subprocess.DEVNULL)
 result=subprocess.run(['adb','shell','am','instrument','-w','-e','class',f'com.netmate.app.{name}',f'{package}.test/androidx.test.runner.AndroidJUnitRunner'],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (output/f'{name}.txt').write_text(result.stdout)
 if result.returncode or 'FAILURES!!!'in result.stdout or 'INSTRUMENTATION_FAILED'in result.stdout or 'OK ('not in result.stdout:raise SystemExit(f'Native instrumentation failed: {name}; see {output}')
 print(f'Passed {name}')
 if name=='NativeUiTest':
  screenshots=root/'dist-native/visual/android';screenshots.mkdir(parents=True,exist_ok=True)
  subprocess.run(['adb','pull',f'/sdcard/Android/data/{package}/files/native-visual/.',str(screenshots)],check=True)
subprocess.run(['adb','shell','am','force-stop',package],check=True)

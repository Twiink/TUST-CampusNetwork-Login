import path from 'node:path';

export function createElectronLaunchOptions(
  currentDir: string,
  platform: NodeJS.Platform = process.platform,
  baseEnv: NodeJS.ProcessEnv = process.env
) {
  const args = [path.join(currentDir, 'electron-main.mjs')];
  const env = {
    ...baseEnv,
    NETMATE_E2E: '1',
  };

  if (platform === 'linux' || baseEnv.CI === 'true') {
    args.unshift('--disable-dev-shm-usage');
    args.unshift('--no-sandbox');
    env.ELECTRON_DISABLE_SANDBOX = '1';
  }

  return {
    args,
    cwd: path.join(currentDir, '..'),
    env,
  };
}

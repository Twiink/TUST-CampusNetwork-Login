import path from 'node:path';

type ElectronLaunchEnvInput = Record<string, string | undefined>;

type ElectronLaunchEnv = Record<string, string> & {
  NETMATE_E2E: string;
  ELECTRON_DISABLE_SANDBOX?: string;
};

export function createElectronLaunchOptions(
  currentDir: string,
  platform: NodeJS.Platform = process.platform,
  baseEnv: ElectronLaunchEnvInput = process.env
) {
  const args = [path.join(currentDir, 'electron-main.mjs')];
  const env = {
    ...Object.fromEntries(
      Object.entries({ ...process.env, ...baseEnv }).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    ),
    NETMATE_E2E: '1',
  } as ElectronLaunchEnv;

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

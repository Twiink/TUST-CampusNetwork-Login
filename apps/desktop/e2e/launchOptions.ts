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
  const args = [path.join(currentDir, '..', 'dist-e2e', 'e2e-main.js')];
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

  if (platform === 'linux')
    args.unshift('--password-store=gnome-libsecret', '--ozone-platform=x11');

  if (baseEnv.E2E_CRYPTO_DEBUG === '1') args.unshift('--enable-logging=stderr', '--v=1');

  return {
    args,
    cwd: path.join(currentDir, '..'),
    env,
  };
}

import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [location, version] = process.argv.slice(2);
function find(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? find(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  );
}
const executable =
  existsSync(location) &&
  !location.endsWith('.exe') &&
  !['NetMate', 'netmate-desktop', 'netmate'].includes(path.basename(location))
    ? find(location).find((file) =>
        ['NetMate', 'NetMate.exe', 'netmate-desktop', 'netmate'].includes(path.basename(file))
      )
    : location;
if (!executable) throw new Error('未找到打包程序');
const resources =
  process.platform === 'darwin'
    ? path.resolve(executable, '../../Resources')
    : path.join(path.dirname(executable), 'resources');
const asarPath = path.join(resources, 'app.asar');
const require = createRequire(path.resolve('apps/desktop/package.json'));
const asar = require('@electron/asar');
if (JSON.parse(asar.extractFile(asarPath, 'package.json').toString()).version !== version)
  throw new Error('安装包版本不符');
const entries = asar.listPackage(asarPath);
if (entries.some((entry) => /dist-e2e|e2e-main|\.test\./.test(entry)))
  throw new Error('安装包包含测试入口');
const main = asar.extractFile(asarPath, 'dist-electron/main.js').toString();
if (/netmateHardware|受控网络|10\.0\.2\.2:38081/.test(main)) throw new Error('安装包包含测试边界');
if (!find(path.join(resources, 'app.asar.unpacked')).some((file) => file.endsWith('.node')))
  throw new Error('安装包未包含解包原生模块');
const application = await electron.launch({
  executablePath: executable,
  args: process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=x11'] : [],
  timeout: 45000,
});
mkdirSync('release-smoke', { recursive: true });
try {
  const page = await application.firstWindow();
  await page.getByRole('button', { name: '运行状态', exact: true }).waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: '关于', exact: true }).click();
  await page.getByText(`版本 ${version}`, { exact: true }).waitFor();
  const actual = await application.evaluate(({ app }) => app.getVersion());
  if (actual !== version) throw new Error('运行版本不符');
  const native = await application.evaluate(async ({ app }) => {
    const { createRequire } = await import('node:module');
    const req = createRequire(app.getAppPath() + '/package.json');
    const module = req('@repo/native');
    return {
      error: module.__loadError,
      currentWifi: typeof module.currentWifi,
      networkInfo: typeof module.networkInfo,
    };
  });
  if (native.error || native.currentWifi !== 'function' || native.networkInfo !== 'function')
    throw new Error('打包原生模块无法加载: ' + JSON.stringify(native));
  await page.screenshot({ path: `release-smoke/${process.platform}.png` });
  writeFileSync(
    `release-smoke/${process.platform}.json`,
    JSON.stringify({ version: actual, native, archiveEntries: entries.length }, null, 2) + '\n'
  );
  console.log(`安装包冒烟通过: ${process.platform} ${actual}`);
} finally {
  await application.close();
}

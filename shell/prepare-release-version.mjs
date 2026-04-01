import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const versionArg = args.find((arg) => arg !== '--dry-run' && arg !== '--');

  if (!versionArg) {
    throw new Error(
      '缺少版本参数，用法: node shell/prepare-release-version.mjs [--dry-run] v1.2.3'
    );
  }

  return { dryRun, versionArg };
}

function normalizeVersion(input) {
  const match = input.match(/^v?(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error(`版本格式无效: ${input}，仅支持 vX.Y.Z`);
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  const version = `${major}.${minor}.${patch}`;
  const tag = `v${version}`;
  const androidVersionCode = major * 10000 + minor * 100 + patch;

  return {
    tag,
    version,
    androidVersionCode,
  };
}

function updateJsonVersion(filePath, version, dryRun) {
  const currentContent = fs.readFileSync(filePath, 'utf-8');
  const packageJson = JSON.parse(currentContent);
  const previousVersion = packageJson.version;
  packageJson.version = version;
  const nextContent = `${JSON.stringify(packageJson, null, 2)}\n`;

  if (!dryRun) {
    fs.writeFileSync(filePath, nextContent, 'utf-8');
  }

  return {
    filePath,
    previousVersion,
    nextVersion: version,
  };
}

function main() {
  const { dryRun, versionArg } = parseArgs(process.argv);
  const { tag, version, androidVersionCode } = normalizeVersion(versionArg);

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(currentDir, '..');
  const desktopPackagePath = path.join(projectRoot, 'apps', 'desktop', 'package.json');

  const changedFiles = [updateJsonVersion(desktopPackagePath, version, dryRun)];

  console.log(`[prepare-release-version] tag=${tag}`);
  console.log(`[prepare-release-version] version=${version}`);
  console.log(`[prepare-release-version] androidVersionCode=${androidVersionCode}`);

  for (const changedFile of changedFiles) {
    console.log(
      `[prepare-release-version] ${dryRun ? '将更新' : '已更新'} ${changedFile.filePath}: ${changedFile.previousVersion} -> ${changedFile.nextVersion}`
    );
  }
}

main();

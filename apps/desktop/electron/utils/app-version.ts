/**
 * 统一解析应用版本号
 * 开发态下 Electron 默认返回的是宿主二进制版本，这里优先读取应用 package.json。
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

interface AppPackageJson {
  version?: string;
}

export function getResolvedAppVersion(): string {
  const fallbackVersion = app.getVersion();
  const appRoot = process.env.APP_ROOT;

  if (!appRoot) {
    return fallbackVersion;
  }

  const packageJsonPath = path.join(appRoot, 'package.json');

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as AppPackageJson;
    return packageJson.version?.trim() || fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

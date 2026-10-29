/** Configuration IPC commits include the result of applying OS autostart. */
import { ipcMain } from 'electron';
import { ConfigManager, type AppConfig, type AppSettings, type Logger } from '@repo/shared';
import type { AutoLaunchService } from '../services/auto-launch';
import { IPC_CHANNELS } from './channels';
import { assertAppConfigInput } from './validate';

export interface ConfigApplyResult {
  config: AppConfig;
  applied: boolean;
  error?: string;
}
export type ConfigChangedHandler = (config: AppConfig) => void | Promise<void>;

export function registerConfigIPC(
  manager: ConfigManager,
  logger: Logger,
  onConfigChanged?: ConfigChangedHandler,
  autoLaunch?: AutoLaunchService
) {
  let queue: Promise<unknown> = Promise.resolve();
  const commit = (save: () => Promise<unknown>): Promise<ConfigApplyResult> => {
    const operation = queue.then(async () => {
      await save(); // Persistence failures reject; no OS side effects precede this commit.
      let error: string | undefined;
      if (autoLaunch) {
        const wanted = manager.getSettings().autoLaunch;
        const actual = await autoLaunch.isEnabled();
        if (wanted !== actual && !(await autoLaunch.setEnabled(wanted))) {
          const restored = await autoLaunch.isEnabled();
          await manager.updateSettings({ autoLaunch: restored });
          error = '系统未能更改开机自启，开关已恢复为系统实际状态';
          logger.error(error);
        }
      }
      const config = manager.getConfig()!;
      await onConfigChanged?.(config);
      return { config, applied: !error, ...(error ? { error } : {}) };
    });
    queue = operation.catch(() => undefined);
    return operation;
  };
  const updateSettings = (settings: Partial<AppSettings>) =>
    commit(() => manager.updateSettings(settings));
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => manager.getConfig());
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_, config: AppConfig) => {
    assertAppConfigInput(config, '保存配置');
    return commit(() => manager.save(config));
  });
  ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, () => commit(() => manager.reset()));
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => manager.getSettings());
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_, settings: Partial<AppSettings>) =>
    updateSettings(settings)
  );
  return { updateSettings };
}

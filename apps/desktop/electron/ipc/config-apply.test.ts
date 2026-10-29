import { beforeEach, expect, it, vi } from 'vitest';
import { ConfigManager, MemoryStorageAdapter, createLogger } from '@repo/shared';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(key, handler),
  },
}));
import { registerConfigIPC, type ConfigApplyResult } from './config';
import { registerAutoLaunchIPC } from './auto-launch';
import { IPC_CHANNELS } from './channels';
import type { AutoLaunchService } from '../services/auto-launch';
beforeEach(() => handlers.clear());
it.each([
  IPC_CHANNELS.CONFIG_SET,
  IPC_CHANNELS.SETTINGS_UPDATE,
  IPC_CHANNELS.CONFIG_RESET,
  IPC_CHANNELS.AUTO_LAUNCH_SET,
])('%s waits for rejected OS disable and preserves all other saved settings', async (channel) => {
  const storage = new MemoryStorageAdapter();
  const manager = new ConfigManager(storage);
  await manager.load();
  await manager.updateSettings({ autoLaunch: true });
  let finish!: (success: boolean) => void;
  const setEnabled = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  const auto = { isEnabled: async () => true, setEnabled } as unknown as AutoLaunchService;
  const logger = createLogger();
  const commands = registerConfigIPC(manager, logger, undefined, auto);
  registerAutoLaunchIPC(auto, logger, commands.updateSettings);
  const requested = manager.getConfig()!;
  requested.settings.autoLaunch = false;
  requested.settings.enableHeartbeat = false;
  const arg =
    channel === IPC_CHANNELS.CONFIG_SET
      ? requested
      : channel === IPC_CHANNELS.AUTO_LAUNCH_SET
        ? false
        : { autoLaunch: false, enableHeartbeat: false };
  let completed = false;
  const pending = handlers.get(channel)!({}, arg).then((result) => {
    completed = true;
    return result as ConfigApplyResult;
  });
  await vi.waitFor(() => expect(setEnabled).toHaveBeenCalledTimes(1));
  expect(completed).toBe(false);
  finish(false);
  const result = await pending;
  expect(result.applied).toBe(false);
  expect(result.error).toContain('系统');
  expect(result.config.settings.autoLaunch).toBe(true);
  if (channel === IPC_CHANNELS.CONFIG_SET || channel === IPC_CHANNELS.SETTINGS_UPDATE)
    expect(result.config.settings.enableHeartbeat).toBe(false);
  expect(manager.getConfig()).toEqual(result.config);
  logger.stopAutoCleanup();
});
it('persistence failure rejects before any OS operation', async () => {
  const storage = new MemoryStorageAdapter();
  const manager = new ConfigManager(storage);
  await manager.load();
  const setEnabled = vi.fn();
  const auto = { isEnabled: async () => false, setEnabled } as unknown as AutoLaunchService;
  registerConfigIPC(manager, createLogger(), undefined, auto);
  vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('disk full'));
  await expect(
    handlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!({}, { autoLaunch: true })
  ).rejects.toThrow('disk full');
  expect(setEnabled).not.toHaveBeenCalled();
});

import { expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createLogger } from '@repo/shared';
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));
import { runtimePorts } from '../runtime-ports';
import { UpdaterService } from './updater';
it('update retry clears the old error through progress, completion and install readiness', async () => {
  const updater = Object.assign(new EventEmitter(), {
    downloadUpdate: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
  runtimePorts.updater = updater as never;
  const logger = createLogger();
  const service = new UpdaterService(logger);
  updater.emit('update-available', { version: '1.0.3' });
  updater.emit('error', new Error('fixture download interrupted'));
  expect(service.getStatus().error).toBe('fixture download interrupted');
  await service.downloadUpdate();
  expect(service.getStatus()).toMatchObject({ downloading: true, downloaded: false, error: null });
  updater.emit('download-progress', { percent: 55, bytesPerSecond: 1000 });
  expect(service.getStatus()).toMatchObject({ progress: 55, downloading: true, error: null });
  updater.emit('download-progress', { percent: 100, bytesPerSecond: 1000 });
  updater.emit('update-downloaded', { version: '1.0.3' });
  expect(service.getStatus()).toMatchObject({
    downloaded: true,
    downloading: false,
    progress: 100,
    error: null,
  });
  delete runtimePorts.updater;
  logger.stopAutoCleanup();
});

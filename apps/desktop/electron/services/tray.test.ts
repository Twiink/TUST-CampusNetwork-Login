import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrayService } from './tray';

const {
  trayInstance,
  nativeImageInstance,
  TrayMock,
  buildFromTemplateMock,
  createFromPathMock,
  createFromDataUrlMock,
} = vi.hoisted(() => {
  const trayInstance = {
    setToolTip: vi.fn(),
    on: vi.fn(),
    setContextMenu: vi.fn(),
    setImage: vi.fn(),
    destroy: vi.fn(),
  };

  const nativeImageInstance = {
    isEmpty: vi.fn(() => false),
    setTemplateImage: vi.fn(),
  };

  return {
    trayInstance,
    nativeImageInstance,
    TrayMock: vi.fn(function TrayMock() {
      return trayInstance;
    }),
    buildFromTemplateMock: vi.fn(() => ({})),
    createFromPathMock: vi.fn(() => nativeImageInstance),
    createFromDataUrlMock: vi.fn(() => nativeImageInstance),
  };
});

vi.mock('electron', () => ({
  app: { isPackaged: false },
  Tray: TrayMock,
  Menu: {
    buildFromTemplate: buildFromTemplateMock,
  },
  nativeImage: {
    createFromPath: createFromPathMock,
    createFromDataURL: createFromDataUrlMock,
  },
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn(() => false),
}));

describe('TrayService', () => {
  beforeEach(() => {
    TrayMock.mockImplementation(function TrayMock() {
      return trayInstance;
    });
    buildFromTemplateMock.mockClear();
    createFromPathMock.mockClear();
    createFromDataUrlMock.mockClear();
    trayInstance.setToolTip.mockClear();
    trayInstance.on.mockClear();
    trayInstance.setContextMenu.mockClear();
    trayInstance.setImage.mockClear();
    trayInstance.destroy.mockClear();
    nativeImageInstance.isEmpty.mockClear();
    nativeImageInstance.setTemplateImage.mockClear();
  });

  it('当 Tray 构造失败时应返回 false 且不抛出异常', () => {
    TrayMock.mockImplementation(() => {
      throw new Error('tray unsupported');
    });

    const service = createTrayService('/tmp', {
      onLogin: vi.fn(async () => {}),
      onLogout: vi.fn(async () => {}),
      onShowWindow: vi.fn(),
      onQuit: vi.fn(),
    });

    let result = true;
    expect(() => {
      result = service.init();
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it('当 Tray 构造成功时应返回 true 并初始化菜单', () => {
    TrayMock.mockImplementation(function Tray() {
      return trayInstance;
    });

    const service = createTrayService('/tmp', {
      onLogin: vi.fn(async () => {}),
      onLogout: vi.fn(async () => {}),
      onShowWindow: vi.fn(),
      onQuit: vi.fn(),
    });

    expect(service.init()).toBe(true);
    expect(TrayMock).toHaveBeenCalledTimes(1);
    expect(trayInstance.setToolTip).toHaveBeenCalledWith('NetMate - 校园网登录');
    expect(buildFromTemplateMock).toHaveBeenCalledTimes(1);
  });
});

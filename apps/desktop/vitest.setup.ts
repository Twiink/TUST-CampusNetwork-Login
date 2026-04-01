import '@testing-library/jest-dom/vitest';

beforeEach(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const on = (channel: string, callback: (...args: unknown[]) => void) => {
    const current = listeners.get(channel) || [];
    listeners.set(channel, [...current, callback]);
    return () => {
      const next = (listeners.get(channel) || []).filter((item) => item !== callback);
      listeners.set(channel, next);
    };
  };

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      auth: {
        login: vi.fn(),
        logout: vi.fn(),
      },
      config: {
        get: vi.fn(),
        set: vi.fn(),
        reset: vi.fn(),
      },
      account: {
        list: vi.fn(),
        getCurrent: vi.fn(),
        add: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        switch: vi.fn(),
      },
      wifi: {
        list: vi.fn(),
        add: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        switch: vi.fn(),
        scan: vi.fn(),
      },
      network: {
        getStatus: vi.fn(),
        getInfo: vi.fn(),
        check: vi.fn(),
        getWifiSSID: vi.fn(),
        getFullInfo: vi.fn(),
      },
      log: {
        get: vi.fn(),
        clear: vi.fn(),
        export: vi.fn(),
      },
      settings: {
        get: vi.fn(),
        update: vi.fn(),
      },
      autoLaunch: {
        get: vi.fn(),
        set: vi.fn(),
      },
      notification: {
        show: vi.fn(),
        getEnabled: vi.fn(),
        setEnabled: vi.fn(),
      },
      update: {
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        getStatus: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        quit: vi.fn(),
      },
      on: vi.fn(on),
      off: vi.fn(),
    },
  });
});

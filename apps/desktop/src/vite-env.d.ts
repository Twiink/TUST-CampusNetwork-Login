/// <reference types="vite/client" />

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Window {
  ipcRenderer: {
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    off(channel: string, listener: (...args: any[]) => void): void;
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

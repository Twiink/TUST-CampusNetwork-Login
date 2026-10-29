/**
 * WiFi 重连状态管理 Hook
 * 监听 WiFi 自动重连进度和失败事件
 */

import { useState, useEffect, useRef } from 'react';
import { IPC_EVENTS } from '../constants/ipc';
import type { WifiReconnectProgress, WifiAllReconnectsFailed } from '../types/electron';

/**
 * WiFi 重连状态
 */
export interface WifiReconnectState {
  /** 是否正在重连 */
  isReconnecting: boolean;
  /** 当前重连进度 */
  progress: WifiReconnectProgress | null;
  /** 所有WiFi重连失败信息 */
  allFailed: WifiAllReconnectsFailed | null;
}

/**
 * 使用 WiFi 重连状态
 */
export function useWifiReconnect() {
  const [state, setState] = useState<WifiReconnectState>({
    isReconnecting: false,
    progress: null,
    allFailed: null,
  });
  const progressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    let eventReceived = false;
    window.electronAPI.wifi.getReconnectProgress?.().then((progress) => {
      if (mounted && !eventReceived && progress)
        setState({
          isReconnecting: ['connecting', 'authenticating', 'verifying'].includes(progress.status),
          progress,
          allFailed: progress.failedList ? { failedList: progress.failedList } : null,
        });
    });
    // 监听 WiFi 重连进度事件
    const unsubscribeProgress = window.electronAPI.on(
      IPC_EVENTS.WIFI_RECONNECT_PROGRESS,
      (...args: unknown[]) => {
        eventReceived = true;
        if (progressResetTimerRef.current) {
          clearTimeout(progressResetTimerRef.current);
          progressResetTimerRef.current = null;
        }
        const progress = args[0] as WifiReconnectProgress;
        console.log('[useWifiReconnect] 收到重连进度:', progress);

        setState((prev) => {
          // 如果状态是 success，说明重连成功，清除失败信息
          if (progress.status === 'success') {
            return {
              isReconnecting: false,
              progress,
              allFailed: null,
            };
          }

          // 如果状态是 connecting 或 failed，更新进度
          return {
            ...prev,
            allFailed:
              progress.status === 'cancelled' || progress.status === 'connecting'
                ? null
                : progress.failedList
                  ? { failedList: progress.failedList }
                  : prev.allFailed,
            isReconnecting: ['connecting', 'authenticating', 'verifying'].includes(progress.status),
            progress,
          };
        });

        // 如果重连成功，3秒后清除进度信息
        if (progress.status === 'success') {
          if (progressResetTimerRef.current) {
            clearTimeout(progressResetTimerRef.current);
          }
          progressResetTimerRef.current = setTimeout(() => {
            setState((prev) => ({
              ...prev,
              progress: null,
            }));
            progressResetTimerRef.current = null;
          }, 3000);
        }
      }
    );

    // 监听所有 WiFi 重连失败事件
    const unsubscribeFailed = window.electronAPI.on(
      IPC_EVENTS.WIFI_ALL_RECONNECTS_FAILED,
      (...args: unknown[]) => {
        const failed = args[0] as WifiAllReconnectsFailed;
        console.log('[useWifiReconnect] 所有WiFi重连失败:', failed);

        setState((previous) => ({
          isReconnecting: false,
          progress: previous.progress,
          allFailed: failed,
        }));
      }
    );

    // 清理监听器
    return () => {
      mounted = false;
      if (progressResetTimerRef.current) {
        clearTimeout(progressResetTimerRef.current);
        progressResetTimerRef.current = null;
      }
      unsubscribeProgress();
      unsubscribeFailed();
    };
  }, []);

  /**
   * 手动清除失败信息
   */
  const clearAllFailed = () => {
    setState((prev) => ({
      ...prev,
      allFailed: null,
    }));
  };

  return {
    ...state,
    clearAllFailed,
  };
}

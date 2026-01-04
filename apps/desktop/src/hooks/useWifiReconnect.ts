/**
 * WiFi 重连状态管理 Hook
 * 监听 WiFi 自动重连进度和失败事件
 */

import { useState, useEffect } from 'react';
import type {
  WifiReconnectProgress,
  WifiAllReconnectsFailed,
} from '../types/electron';

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

  useEffect(() => {
    // 监听 WiFi 重连进度事件
    const unsubscribeProgress = window.electronAPI.on(
      'event:wifi:reconnectProgress',
      (...args: unknown[]) => {
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
            isReconnecting: progress.status === 'connecting',
            progress,
          };
        });

        // 如果重连成功，3秒后清除进度信息
        if (progress.status === 'success') {
          setTimeout(() => {
            setState((prev) => ({
              ...prev,
              progress: null,
            }));
          }, 3000);
        }
      }
    );

    // 监听所有 WiFi 重连失败事件
    const unsubscribeFailed = window.electronAPI.on(
      'event:wifi:allReconnectsFailed',
      (...args: unknown[]) => {
        const failed = args[0] as WifiAllReconnectsFailed;
        console.log('[useWifiReconnect] 所有WiFi重连失败:', failed);

        setState({
          isReconnecting: false,
          progress: null,
          allFailed: failed,
        });
      }
    );

    // 清理监听器
    return () => {
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

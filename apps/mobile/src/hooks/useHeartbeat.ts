/**
 * 心跳检测 Hook
 *
 * 提供网络心跳检测功能，定期检查网络连接状态
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createNetworkDetector, type NetworkStatus } from '@repo/shared';

export interface UseHeartbeatOptions {
  /** 是否启用心跳检测 */
  enabled?: boolean;
  /** 检测间隔（毫秒），默认 30000 */
  interval?: number;
  /** 连接断开时的回调 */
  onDisconnect?: () => void;
  /** 连接恢复时的回调 */
  onReconnect?: () => void;
  /** 状态变化时的回调 */
  onStatusChange?: (status: NetworkStatus) => void;
}

export interface UseHeartbeatResult {
  /** 当前网络状态 */
  status: NetworkStatus;
  /** 是否正在检测 */
  isChecking: boolean;
  /** 上次检测时间 */
  lastCheckTime: Date | null;
  /** 手动触发检测 */
  checkNow: () => Promise<NetworkStatus>;
  /** 启动心跳检测 */
  start: () => void;
  /** 停止心跳检测 */
  stop: () => void;
  /** 心跳是否激活 */
  isActive: boolean;
}

const defaultStatus: NetworkStatus = {
  connected: false,
  authenticated: false,
};

/**
 * 心跳检测 Hook
 */
export function useHeartbeat(options: UseHeartbeatOptions = {}): UseHeartbeatResult {
  const {
    enabled = true,
    interval = 30000,
    onDisconnect,
    onReconnect,
    onStatusChange,
  } = options;

  const [status, setStatus] = useState<NetworkStatus>(defaultStatus);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [isActive, setIsActive] = useState(false);

  // 保存上一次状态用于比较
  const prevStatusRef = useRef<NetworkStatus>(defaultStatus);
  const detectorRef = useRef(createNetworkDetector());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 执行单次检测
  const checkNow = useCallback(async (): Promise<NetworkStatus> => {
    setIsChecking(true);
    try {
      const newStatus = await detectorRef.current.getNetworkStatus();
      setStatus(newStatus);
      setLastCheckTime(new Date());

      // 检测状态变化
      const wasConnected = prevStatusRef.current.connected;
      const isConnected = newStatus.connected;

      if (wasConnected && !isConnected) {
        onDisconnect?.();
      } else if (!wasConnected && isConnected) {
        onReconnect?.();
      }

      if (
        prevStatusRef.current.connected !== newStatus.connected ||
        prevStatusRef.current.authenticated !== newStatus.authenticated
      ) {
        onStatusChange?.(newStatus);
      }

      prevStatusRef.current = newStatus;
      return newStatus;
    } catch (error) {
      const errorStatus = { connected: false, authenticated: false };
      setStatus(errorStatus);

      if (prevStatusRef.current.connected) {
        onDisconnect?.();
        onStatusChange?.(errorStatus);
      }

      prevStatusRef.current = errorStatus;
      return errorStatus;
    } finally {
      setIsChecking(false);
    }
  }, [onDisconnect, onReconnect, onStatusChange]);

  // 启动心跳检测
  const start = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsActive(true);

    // 立即执行一次
    checkNow();

    // 设置定时器
    timerRef.current = setInterval(() => {
      checkNow();
    }, interval);
  }, [checkNow, interval]);

  // 停止心跳检测
  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsActive(false);
  }, []);

  // 根据 enabled 选项自动启停
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  // interval 变化时重新启动
  useEffect(() => {
    if (isActive && enabled) {
      start();
    }
  }, [interval, isActive, enabled, start]);

  return {
    status,
    isChecking,
    lastCheckTime,
    checkNow,
    start,
    stop,
    isActive,
  };
}

export default useHeartbeat;

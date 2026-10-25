import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatencyResult } from '@repo/shared';

export interface HeartbeatState {
  remainingSeconds: number;
  totalSeconds: number;
  // 新增：心跳检测详细信息
  connected: boolean;
  authenticated: boolean;
  latency: LatencyResult | null;
  lastCheckTime: number | null;
  nextHeartbeatAt?: number;
}

export interface ReconnectProgress {
  status: 'idle' | 'reconnecting' | 'success' | 'failed';
  currentAttempt: number;
  maxAttempts: number;
  message: string;
}

/**
 * 监听心跳检测倒计时和重连进度
 */
export function useHeartbeat() {
  const [heartbeat, setHeartbeat] = useState<HeartbeatState>({
    remainingSeconds: 0,
    totalSeconds: 30,
    connected: false,
    authenticated: false,
    latency: null,
    lastCheckTime: null,
  });

  const [reconnectProgress, setReconnectProgress] = useState<ReconnectProgress>({
    status: 'idle',
    currentAttempt: 0,
    maxAttempts: 3,
    message: '',
  });

  const scheduleRef = useRef<HeartbeatState | null>(null);

  const recomputeCountdown = useCallback(() => {
    const schedule = scheduleRef.current;
    if (!schedule?.nextHeartbeatAt) {
      return;
    }
    setHeartbeat({
      ...schedule,
      remainingSeconds: Math.max(0, Math.ceil((schedule.nextHeartbeatAt - Date.now()) / 1000)),
    });
  }, []);

  useEffect(() => {
    // 主进程只推送下一次检测时间戳；倒计时由渲染层本地推导，避免 1Hz IPC。
    const unsubscribeHeartbeat = window.electronAPI.on(
      'event:heartbeat:countdown',
      (data: unknown) => {
        const heartbeatData = data as HeartbeatState;
        scheduleRef.current = heartbeatData;
        setHeartbeat({
          ...heartbeatData,
          remainingSeconds: heartbeatData.nextHeartbeatAt
            ? Math.max(0, Math.ceil((heartbeatData.nextHeartbeatAt - Date.now()) / 1000))
            : heartbeatData.remainingSeconds,
        });
      }
    );

    // 监听重连进度
    const unsubscribeReconnect = window.electronAPI.on(
      'event:reconnect:progress',
      (data: unknown) => {
        const progressData = data as ReconnectProgress;
        setReconnectProgress(progressData);

        // 3秒后自动清除成功或失败状态
        if (progressData.status === 'success' || progressData.status === 'failed') {
          setTimeout(() => {
            setReconnectProgress({
              status: 'idle',
              currentAttempt: 0,
              maxAttempts: 3,
              message: '',
            });
          }, 3000);
        }
      }
    );

    const countdownTimer = window.setInterval(recomputeCountdown, 1000);

    return () => {
      clearInterval(countdownTimer);
      unsubscribeHeartbeat();
      unsubscribeReconnect();
    };
  }, [recomputeCountdown]);

  return {
    heartbeat,
    reconnectProgress,
  };
}

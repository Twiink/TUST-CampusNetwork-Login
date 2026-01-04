import { useState, useEffect } from 'react';

export interface HeartbeatState {
  remainingSeconds: number;
  totalSeconds: number;
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
  });

  const [reconnectProgress, setReconnectProgress] = useState<ReconnectProgress>({
    status: 'idle',
    currentAttempt: 0,
    maxAttempts: 3,
    message: '',
  });

  useEffect(() => {
    // 监听心跳检测倒计时
    const unsubscribeHeartbeat = window.electronAPI.on(
      'event:heartbeat:countdown',
      (data: unknown) => {
        const heartbeatData = data as HeartbeatState;
        setHeartbeat(heartbeatData);
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

    return () => {
      unsubscribeHeartbeat();
      unsubscribeReconnect();
    };
  }, []);

  return {
    heartbeat,
    reconnectProgress,
  };
}

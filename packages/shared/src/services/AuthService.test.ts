import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './AuthService';

function createFetchResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : 'OK',
    text: async () => body,
    headers: {
      forEach: (callback: (value: string, key: string) => void) =>
        callback('text/plain', 'content-type'),
    },
  };
}

/** 连通性探测点（generate_204）统一返回 204，登录接口按传入回调返回 */
function createUrlAwareFetch(loginResponder: () => ReturnType<typeof createFetchResponse>) {
  return vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('generate_204')) {
      return Promise.resolve(createFetchResponse('', 204));
    }
    return Promise.resolve(loginResponder());
  });
}

describe('AuthService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('parseLoginResponse 多标志并联判定', () => {
    const service = new AuthService();

    it('ret_code=0 应判成功', () => {
      expect(
        service.parseLoginResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})')
      ).toMatchObject({ success: true, code: 0 });
    });

    it('ret_code=2（已在线）应判成功', () => {
      expect(
        service.parseLoginResponse('dr1005({"result":0,"msg":"已在线","ret_code":2})')
      ).toMatchObject({ success: true, code: 2 });
    });

    it('ret_code=1 应判失败', () => {
      expect(
        service.parseLoginResponse('dr1005({"result":0,"msg":"用户名错误","ret_code":1})')
      ).toMatchObject({ success: false, code: 1 });
    });

    it('status:1 应判成功（对齐生产参考实现）', () => {
      expect(service.parseLoginResponse('dr1005({"status":1,"msg":"ok","ret_code":1})')).toMatchObject(
        { success: true }
      );
    });

    it('result:1 应判成功', () => {
      expect(service.parseLoginResponse('dr1005({"result":1,"ret_code":1})')).toMatchObject({
        success: true,
      });
    });

    it('原始文本含"已经在线"应判成功', () => {
      expect(service.parseLoginResponse('您已经在线！')).toMatchObject({ success: true });
    });

    it('无法解析且无成功标志应判失败', () => {
      expect(service.parseLoginResponse('<html>error</html>')).toMatchObject({ success: false });
    });
  });

  it('当首个绑定账号失败时应继续尝试后续账号', async () => {
    let loginCall = 0;
    const fetchMock = createUrlAwareFetch(() => {
      loginCall += 1;
      return loginCall === 1
        ? createFetchResponse('dr1005({"result":0,"msg":"密码错误","ret_code":1})')
        : createFetchResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})');
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthService();
    const result = await service.loginWithAccounts(
      [
        {
          id: 'acc-1',
          name: '主账号',
          username: '20260001',
          password: 'wrong',
          serverUrl: 'http://10.10.102.50:801',
          isp: 'campus',
        },
        {
          id: 'acc-2',
          name: '备用账号',
          username: '20260002',
          password: 'correct',
          serverUrl: 'http://10.10.102.50:801',
          isp: 'campus',
        },
      ],
      {
        wlanUserIp: '10.0.0.2',
        wlanUserIpv6: undefined,
        wlanUserMac: '001122334455',
      }
    );

    expect(result.success).toBe(true);
    expect(result.accountId).toBe('acc-2');
    expect(result.attempts).toHaveLength(2);
    // 两次登录请求（账号数），连通性探测另计
    expect(loginCall).toBe(2);
  });

  it('登录响应成功但连通性未确认时，仍判成功并在消息中标注', async () => {
    // 连通性点返回非 204（模拟 captive portal），登录接口返回成功
    const fetchMock = vi.fn(() =>
      Promise.resolve(createFetchResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})', 200))
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthService();
    const result = await service.login({
      serverUrl: 'http://10.10.102.50:801',
      userAccount: '20260001',
      userPassword: 'pwd',
      wlanUserIp: '10.0.0.2',
      isp: 'campus',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('连通性未确认');
  });

  it('loginWithRetry 在失败后应重试并最终成功', async () => {
    vi.useFakeTimers();
    let loginCall = 0;
    const fetchMock = createUrlAwareFetch(() => {
      loginCall += 1;
      return loginCall < 2
        ? createFetchResponse('dr1005({"result":0,"msg":"密码错误","ret_code":1})')
        : createFetchResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})');
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthService();
    const promise = service.loginWithRetry(
      {
        serverUrl: 'http://10.10.102.50:801',
        userAccount: '20260001',
        userPassword: 'pwd',
        wlanUserIp: '10.0.0.2',
        isp: 'campus',
      },
      { maxRetries: 2, delayMs: 2000 }
    );

    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(loginCall).toBe(2);
  });

  it('loginWithRetry 耗尽次数后应返回最后一次失败结果', async () => {
    vi.useFakeTimers();
    const fetchMock = createUrlAwareFetch(() =>
      createFetchResponse('dr1005({"result":0,"msg":"密码错误","ret_code":1})')
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthService();
    const promise = service.loginWithRetry(
      {
        serverUrl: 'http://10.10.102.50:801',
        userAccount: '20260001',
        userPassword: 'pwd',
        wlanUserIp: '10.0.0.2',
        isp: 'campus',
      },
      { maxRetries: 2, delayMs: 1000 }
    );

    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.success).toBe(false);
  });
});

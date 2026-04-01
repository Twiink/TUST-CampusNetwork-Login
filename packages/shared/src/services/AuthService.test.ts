import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './AuthService';

function createFetchResponse(body: string) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => body,
    headers: {
      forEach: (callback: (value: string, key: string) => void) =>
        callback('text/plain', 'content-type'),
    },
  };
}

describe('AuthService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('应正确解析登录响应中的成功、失败和已在线状态', () => {
    const service = new AuthService();

    expect(
      service.parseLoginResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})')
    ).toMatchObject({
      success: true,
      code: 0,
    });
    expect(
      service.parseLoginResponse('dr1005({"result":0,"msg":"用户名错误","ret_code":1})')
    ).toMatchObject({
      success: false,
      code: 1,
    });
    expect(
      service.parseLoginResponse('dr1005({"result":0,"msg":"已在线","ret_code":2})')
    ).toMatchObject({
      success: true,
      code: 2,
    });
  });

  it('当首个绑定账号失败时应继续尝试后续账号', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse('dr1005({"result":0,"msg":"密码错误","ret_code":1})')
      )
      .mockResolvedValueOnce(
        createFetchResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})')
      );
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

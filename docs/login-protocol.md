# 校园网登录协议文档

> 本文档基于 Wireshark 抓包分析，总结校园网自动登录的实现方案。

## 1. 协议概述

- **认证服务器**: `10.10.102.50:801`
- **协议**: HTTP GET
- **路径**: `/eportal/portal/login`

## 2. 请求参数

### 完整请求示例

```
GET http://10.10.102.50:801/eportal/portal/login?
  callback=dr1005&
  login_method=1&
  user_account=%2C0%2C23103421&
  user_password=050423%40zy&
  wlan_user_ip=10.48.8.10&
  wlan_user_ipv6=2001%3A0da8%3Aa005%3A0330%3A0000%3A0000%3A0000%3A25a1&
  wlan_user_mac=000000000000&
  wlan_ac_ip=&
  wlan_ac_name=&
  jsVersion=4.1.3&
  terminal_type=1&
  lang=zh-cn&
  v=5819&
  lang=zh
```

### 参数说明

| 参数 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `callback` | string | JSONP 回调函数名 | `dr1005` |
| `login_method` | number | 登录方式，固定为 `1` | `1` |
| `user_account` | string | 用户账号，格式见下方 | `,023103421` |
| `user_password` | string | 密码 (URL编码) | `050423@zy` |
| `wlan_user_ip` | string | 客户端 IPv4 地址 | `10.48.8.10` |
| `wlan_user_ipv6` | string | 客户端 IPv6 地址 (URL编码) | `2001:0da8:a005:330::25a1` |
| `wlan_user_mac` | string | MAC地址，固定值 | `000000000000` |
| `wlan_ac_ip` | string | AC控制器IP，可为空 | 空或 `10.10.102.49` |
| `wlan_ac_name` | string | AC名称，可为空 | 空 |
| `jsVersion` | string | JS版本，固定值 | `4.1.3` |
| `terminal_type` | number | 终端类型 | `1` |
| `lang` | string | 语言 | `zh-cn` |
| `v` | number | 随机参数(防缓存) | `5819` |

## 3. 账号格式

账号格式: `,0{学号}@{运营商}`

| 运营商 | 后缀 | 完整账号示例 | 说明 |
|--------|------|-------------|------|
| 校园网 | 无 | `,023103421` | 直接使用学号 |
| 中国联通 | `@unicom` | `,023103421@unicom` | 选择联通网络 |
| 中国移动 | `@cmcc` | `,023103421@cmcc` | 选择移动网络 |
| 中国电信 | `@telecom` | `,023103421@telecom` | 选择电信网络 |

> **注意**: 账号需要添加 `,0` 前缀，格式为 `,0{学号}@{运营商}`

## 4. 响应格式

### 响应示例

```json
// JSONP 格式
dr1005({...})
```

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `result` | number | 结果码，0表示请求成功 |
| `msg` | string | 消息描述 |
| `ret_code` | number | 业务状态码 |

### 业务状态码 (ret_code)

| ret_code | msg 示例 | 说明 |
|----------|----------|------|
| 0 | - | 请求成功 |
| 1 | `统一身份认证密码错误` | 密码错误 |
| 1 | `domain error: @cmcc` | 运营商错误/不支持 |
| 2 | `IP: 10.48.8.10 已经在线！` | 已在线(无需重复登录) |

### 完整响应示例

```json
// 成功或已在线
{
  "result": 0,
  "msg": "IP: 10.48.8.10 已经在线！",
  "ret_code": 2
}

// 密码错误
{
  "result": 0,
  "msg": "统一身份认证密码错误",
  "ret_code": 1
}

// 运营商错误
{
  "result": 0,
  "msg": "domain error: @cmcc",
  "ret_code": 1
}
```

## 5. 抓包数据对比

### 校园网登录

```
user_account=%2C0%2C23103421          // 无运营商后缀
```

### 中国联通登录

```
user_account=%2C0%2C23103421%40unicom  // @unicom 后缀
```

### 中国移动登录

```
user_account=%2C0%2C23103421%40cmcc    // @cmcc 后缀
```

### 中国电信登录

```
user_account=%2C0%2C23103421%40telecom // @telecom 后缀
```

## 6. 桌面端实现

### TypeScript 实现示例

```typescript
// packages/shared/src/services/AuthService.ts

interface LoginParams {
  account: string;        // 学号，如 "23103421"
  password: string;       // 密码
  isp: 'campus' | 'cmcc' | 'unicom' | 'telecom';
  ipv4: string;
  ipv6: string;
}

interface LoginResult {
  result: number;
  msg: string;
  ret_code: number;
}

// 运营商后缀映射
const ISP_SUFFIX: Record<string, string> = {
  campus: '',
  cmcc: '@cmcc',
  unicom: '@unicom',
  telecom: '@telecom'
};

// 默认服务器地址
const DEFAULT_SERVER = '10.10.102.50';
const DEFAULT_PORT = 801;

export class AuthService {
  private server: string;
  private port: number;

  constructor(server: string = DEFAULT_SERVER, port: number = DEFAULT_PORT) {
    this.server = server;
    this.port = port;
  }

  /**
   * 校园网登录
   */
  async login(params: LoginParams): Promise<LoginResult> {
    const { account, password, isp, ipv4, ipv6 } = params;

    // 构建账号: ",0{学号}@{运营商}"
    const userAccount = `,0${account}${ISP_SUFFIX[isp]}`;
    const userPassword = encodeURIComponent(password);
    const ipv6Encoded = encodeURIComponent(ipv6);

    // 生成随机参数防止缓存
    const v = Math.floor(Math.random() * 10000);

    const url = new URL(`http://${this.server}:${this.port}/eportal/portal/login`);
    url.searchParams.set('callback', 'dr1005');
    url.searchParams.set('login_method', '1');
    url.searchParams.set('user_account', userAccount);
    url.searchParams.set('user_password', userPassword);
    url.searchParams.set('wlan_user_ip', ipv4);
    url.searchParams.set('wlan_user_ipv6', ipv6Encoded);
    url.searchParams.set('wlan_user_mac', '000000000000');
    url.searchParams.set('wlan_ac_ip', '');
    url.searchParams.set('jsVersion', '4.1.3');
    url.searchParams.set('terminal_type', '1');
    url.searchParams.set('lang', 'zh-cn');
    url.searchParams.set('v', v.toString());
    url.searchParams.set('lang', 'zh');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Referer': 'http://10.10.102.50/'
      }
    });

    const text = await response.text();

    // 解析 JSONP 响应: dr1005({...})
    const jsonMatch = text.match(/dr1005\((.+)\)/);
    if (!jsonMatch) {
      throw new Error('无效的响应格式');
    }

    return JSON.parse(jsonMatch[1]);
  }

  /**
   * 判断登录是否成功
   */
  isSuccess(result: LoginResult): boolean {
    return result.ret_code === 0 || result.ret_code === 2;
  }
}
```

### 处理逻辑

```typescript
async function handleLoginResult(result: LoginResult): Promise<void> {
  if (result.ret_code === 0) {
    // 登录成功
    console.log('登录成功');
  } else if (result.ret_code === 2) {
    // 已在线
    console.log('已在线，无需重复登录');
  } else {
    // 登录失败
    console.error('登录失败:', result.msg);

    // 错误类型判断
    if (result.msg.includes('密码错误')) {
      // 密码错误处理
    } else if (result.msg.includes('domain error')) {
      // 运营商错误处理
    }
  }
}
```

## 7. 自动登录流程

```
┌─────────────────────────────────────────────────────────────┐
│                    校园网自动登录流程                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                           │
│   │ 检测网络状态 │                                           │
│   └──────┬──────┘                                           │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────┐                                           │
│   │ 是否需要登录? │ ──否──→ 结束                              │
│   └──────┬──────┘                                           │
│          │ 是                                                │
│          ▼                                                   │
│   ┌─────────────┐                                           │
│   │ 获取IP信息   │                                           │
│   │ IPv4 + IPv6 │                                           │
│   └──────┬──────┘                                           │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────────────────────┐                           │
│   │ 构造登录请求 (含账号/ISP)    │                           │
│   └──────┬──────────────────────┘                           │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────┐                                           │
│   │ 发送HTTP请求 │                                           │
│   └──────┬──────┘                                           │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────┐                                           │
│   │ 解析响应结果 │                                           │
│   └──────┬──────┘                                           │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────────────────────────────┐                   │
│   │ ret_code=0 → 成功                   │                   │
│   │ ret_code=2 → 已在线(成功)           │                   │
│   │ ret_code=1 → 失败(检查msg)          │                   │
│   └─────────────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 8. 注意事项

1. **账号前缀**: 用户名必须添加 `,0` 前缀
2. **URL编码**: 密码和IPv6地址必须进行URL编码
3. **运营商后缀**: 根据用户选择的运营商添加对应后缀
4. **已在线处理**: `ret_code=2` 表示IP已在线，应视为登录成功
5. **随机参数**: `v` 参数使用随机数防止请求被缓存
6. **Referer**: 需要设置正确的 Referer 头

## 9. 参考

- 抓包脚本: `shell/base.sh`
- 认证服务: `packages/shared/src/services/AuthService.ts`

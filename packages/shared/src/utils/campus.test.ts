import { describe, expect, it } from 'vitest';
import { isCampusNetwork } from './campus';

describe('isCampusNetwork（对齐参考实现：SSID 前缀 + 10.x 双条件）', () => {
  it.each([
    ['TUST-Student', '10.1.2.3'],
    ['tust-student', '10.200.0.1'],
    ['CU_TUST_5G', '10.10.98.7'],
    ['cu_tust', '10.0.0.1'],
    ['TUST', '10.255.255.255'],
  ])('校园 SSID + 10.x IP 应判定为校园网（%s）', (ssid, ip) => {
    expect(isCampusNetwork(ssid, ip)).toBe(true);
  });

  it.each([
    ['TUST-Student', '192.168.1.5'],
    ['TUST-Student', '172.16.0.1'],
    ['Home-WiFi', '10.1.2.3'],
    ['ChinaNet-xxxx', '10.1.2.3'],
    ['MYTUST-Fake', '10.1.2.3'],
  ])('SSID 或 IP 任一不满足应判非校园网（%s / %s）', (ssid, ip) => {
    expect(isCampusNetwork(ssid, ip)).toBe(false);
  });

  it('SSID 缺失或 IP 缺失时应保守返回 false', () => {
    expect(isCampusNetwork(null, '10.1.2.3')).toBe(false);
    expect(isCampusNetwork(undefined, '10.1.2.3')).toBe(false);
    expect(isCampusNetwork('', '10.1.2.3')).toBe(false);
    expect(isCampusNetwork('TUST-Student', undefined)).toBe(false);
    expect(isCampusNetwork('TUST-Student', null)).toBe(false);
    expect(isCampusNetwork('TUST-Student', '')).toBe(false);
  });
});

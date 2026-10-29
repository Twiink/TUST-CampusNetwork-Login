import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { WifiMetricGrid } from './WifiMetricGrid';
it.each([
  [2412, '2.4GHz'],
  [5180, '5GHz'],
  [5935, '6GHz'],
  [7115, '6GHz'],
  [0, '未知'],
])('N6: %s MHz 显示 %s', (frequency, band) => {
  render(
    <WifiMetricGrid
      networkStatus={{
        connected: true,
        authenticated: false,
        wifiConnected: true,
        frequency: frequency as number,
      }}
    />
  );
  expect(screen.getAllByText(band as string).length).toBeGreaterThan(0);
  expect(screen.queryByText(/0 Mbps/)).toBeNull();
});

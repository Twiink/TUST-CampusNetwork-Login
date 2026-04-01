import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('应默认渲染运行状态页', async () => {
    render(<App />);

    expect(await screen.findByText('TUST-WIFI')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByText('运行状态').length).toBeGreaterThan(0);
    });
  });
});

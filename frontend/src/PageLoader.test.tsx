// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import PageLoader from './PageLoader';
import '@testing-library/jest-dom';

test('renders dynamic page title from metadata api', async () => {
  const mockPageData = {
    pageCode: 'order_list',
    title: 'Order List Dashboard',
    config: { actions: [], columns: [], filters: [] }
  };

  global.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      json: () => Promise.resolve(mockPageData),
    } as Response)
  );

  render(<PageLoader pageCode="order_list" />);
  await waitFor(() => {
     expect(screen.getByText('Order List Dashboard')).toBeInTheDocument();
  });
});

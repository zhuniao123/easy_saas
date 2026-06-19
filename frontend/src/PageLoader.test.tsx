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

test('renders table headers and rows based on dynamic query response', async () => {
  const mockPageData = {
    pageCode: 'user_list',
    title: 'User Management Dashboard',
    queryCode: 'q_users_score',
    config: { actions: [], columns: [], filters: [] }
  };

  const mockQueryData = {
    columns: [
      { field: 'username', label: '用户名', type: 'string' },
      { field: 'total_score', label: 'total_score', type: 'integer' }
    ],
    rows: [
      { username: 'john_doe', total_score: 95 }
    ]
  };

  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/')) {
      return Promise.resolve({
        json: () => Promise.resolve(mockPageData),
      } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score/execute')) {
      return Promise.resolve({
        json: () => Promise.resolve(mockQueryData),
      } as Response);
    }
    return Promise.reject(new Error('Unknown url'));
  });

  render(<PageLoader pageCode="user_list" />);
  
  await waitFor(() => {
    expect(screen.getByText('User Management Dashboard')).toBeInTheDocument();
    expect(screen.getByText('用户名')).toBeInTheDocument();
    expect(screen.getByText('total_score')).toBeInTheDocument();
    expect(screen.getByText('john_doe')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();
  });
});


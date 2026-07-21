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

  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
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
    entityCode: 'users',
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

  globalThis.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/entities/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ entityCode: 'users', fields: [] }),
      } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score/execute')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockQueryData),
      } as Response);
    }
    if (url.includes('/api/v1/queries/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ queryCode: 'q_users_score', sqlText: '' }),
      } as Response);
    }
    if (url.includes('/api/v1/pages/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPageData),
      } as Response);
    }
    return Promise.reject(new Error('Unknown url: ' + url));
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

test('renders developer configuration panel and inputs', async () => {
  const mockPageData = {
    pageCode: 'user_list',
    title: 'User Dashboard',
    queryCode: 'q_users_score',
    entityCode: 'users',
    config: { actions: [], columns: [], filters: [] }
  };

  const mockQueryConfig = {
    queryCode: 'q_users_score',
    sqlText: 'SELECT username FROM users'
  };

  const mockEntityConfig = {
    entityCode: 'users',
    fields: []
  };

  globalThis.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/user_list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPageData) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score/execute')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ columns: [], rows: [] }) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockQueryConfig) } as Response);
    }
    if (url.includes('/api/v1/pages/entities/users')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEntityConfig) } as Response);
    }
    return Promise.reject(new Error('Unknown url: ' + url));
  });

  render(<PageLoader pageCode="user_list" mode="config" />);
  
  await waitFor(() => {
    expect(screen.getByText('Page, entity, and remote SQL control center')).toBeInTheDocument();
  });
});

test('renders smart grid action area', async () => {
  const mockPageData = {
    pageCode: 'user_list',
    title: 'User Dashboard',
    queryCode: 'q_users_score',
    entityCode: 'users',
    config: { actions: [{ code: 'refresh', label: 'Refresh', handler: 'refresh' }], columns: [], filters: [] }
  };

  globalThis.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/user_list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPageData) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score/execute')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ columns: [], rows: [] }) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sqlText: '' }) } as Response);
    }
    if (url.includes('/api/v1/pages/entities/users')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ fields: [] }) } as Response);
    }
    return Promise.reject(new Error('Unknown url: ' + url));
  });

  render(<PageLoader pageCode="user_list" mode="config" />);
  
  await waitFor(() => {
    expect(screen.getByText('Page, entity, and remote SQL control center')).toBeInTheDocument();
    expect(screen.getByText('Save SQL model')).toBeInTheDocument();
    expect(screen.getByText('Hide Preview')).toBeInTheDocument();
  });
});

test('supports page DSL presentation and table config', async () => {
  const mockPageData = {
    pageCode: 'orders_page',
    title: 'Orders',
    queryCode: 'q_orders',
    entityCode: 'orders',
    config: {
      presentation: {
        title: 'Orders Control Tower',
        description: 'Track live order signals from the page DSL.',
      },
      table: {
        columns: [{ field: 'order_no', label: 'Order No' }],
        filters: [{ field: 'order_no', label: 'Order No' }],
        actions: [{ code: 'refresh_grid', label: 'Refresh Grid', dsl: 'grid.refresh' }],
      },
      dataSource: {
        pageSize: 20,
        pageSizeOptions: [20, 50],
      },
    },
  };

  globalThis.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/entities/orders')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ fields: [] }) } as Response);
    }
    if (url.includes('/api/v1/queries/q_orders/execute')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            columns: [{ field: 'order_no', label: 'order_no', type: 'string' }],
            rows: [{ order_no: 'SO-001' }],
            total: 1,
          }),
      } as Response);
    }
    if (url.includes('/api/v1/queries/q_orders')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sqlText: 'select 1' }) } as Response);
    }
    if (url.includes('/api/v1/pages/orders_page')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPageData) } as Response);
    }
    return Promise.reject(new Error('Unknown url: ' + url));
  });

  render(<PageLoader pageCode="orders_page" />);

  await waitFor(() => {
    expect(screen.getByText('Orders Control Tower')).toBeInTheDocument();
    expect(screen.getByText('Track live order signals from the page DSL.')).toBeInTheDocument();
    expect(screen.getAllByText('Order No')).toHaveLength(2);
    expect(screen.getByText('Refresh Grid')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '20 / page' })).toBeInTheDocument();
  });
});

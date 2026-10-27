import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SourcePage } from '../desktop/plugin.js';
import { context, profile } from './web-sdk.js';
import './web.css';

function DashboardPage() {
  // One cache per mounted page, never the host cache or another profile's.
  const [client] = React.useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
  }));
  React.useEffect(() => () => client.clear(), [client]);
  return React.createElement('div', { className: 'composio-dashboard', 'data-composio-profile': profile },
    React.createElement(QueryClientProvider, { client }, React.createElement(SourcePage, { ctx: context })));
}
window.__HERMES_PLUGINS__.register('composio-connections', DashboardPage);

// Browser bridge for the shared Desktop UI. No native SDK or second React copy.
export const SDK = window.__HERMES_PLUGIN_SDK__;
if (!SDK?.React || !SDK?.fetchJSON || !window.__HERMES_PLUGINS__) {
  throw new Error('Composio requires the Hermes dashboard plugin SDK');
}
const ownerScript = document.currentScript;
export const profile = ownerScript?.getAttribute('data-hermes-profile') ?? window.__HERMES_DASHBOARD_PROFILE__ ?? '';
const isCurrent = () => !ownerScript || ownerScript.isConnected;
const subscribe = notify => {
  // Profile switches remove the old bundle's script. Fence stale requests even
  // before React unmounts the old page; never retarget a captured mutation.
  const observer = new MutationObserver(notify);
  observer.observe(document.body, { childList: true });
  return () => observer.disconnect();
};
const atom = get => ({ get, subscribe });
export const host = { state: {
  profile: atom(() => profile || 'local'),
  connectionId: atom(() => 'dashboard'),
  gateway: atom(() => isCurrent() ? 'open' : 'closed')
} };
export const gatewayActivationEpoch = () => 0;
export const { Input, Badge } = SDK.components;
export const Button = ({ variant, ...props }) => SDK.React.createElement(SDK.components.Button, {
  ...props, ...(variant === 'outline' ? { outlined: true } : variant === 'ghost' ? { ghost: true } : variant === 'destructive' ? { destructive: true } : {})
});
export { useQuery, useQueryClient } from '@tanstack/react-query';
export const ROUTES_AREA = 'routes', SIDEBAR_NAV_AREA = 'sidebar', PALETTE_AREA = 'palette';
export const context = {
  rest(path, options = {}) {
    if (!isCurrent()) return Promise.reject(new Error('scope-changed'));
    if (!['/connections', '/services', '/connect', '/disconnect'].includes(path)) {
      return Promise.reject(new Error('Unsupported Composio endpoint'));
    }
    const { body, ...init } = options;
    const headers = new Headers(init.headers);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    return SDK.fetchJSON(`/api/plugins/composio-connections${path}?profile=${encodeURIComponent(profile)}`, {
      ...init, headers, credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  },
  os: {
    openExternal(value) {
      if (!isCurrent()) return false;
      try {
        const url = new URL(value);
        // Match the backend's Composio OAuth contract, not arbitrary provider
        // links or javascript/data URLs. Opening remains a direct user gesture.
        if (url.protocol !== 'https:' || url.hostname !== 'connect.composio.dev' ||
            url.port || url.username || url.password || !/^\/link\/[A-Za-z0-9_-]+$/.test(url.pathname)) return false;
        window.open(url.href, '_blank', 'noopener,noreferrer');
        // With noopener browsers intentionally return null even on success.
        return true;
      } catch { return false; }
    }
  }
};

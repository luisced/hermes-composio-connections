#!/usr/bin/env node
// Uses existing development dependencies; never installs into the Hermes host.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'tests/ui/package.json'));
const { build } = require('esbuild');
const shim = path.join(root, 'dashboard/web-sdk.js');
await build({
  absWorkingDir: root, entryPoints: ['dashboard/web.js'], outfile: 'dashboard/dist/index.js',
  bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], minify: true,
  nodePaths: [path.join(root, 'tests/ui/node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
  plugins: [{
    name: 'dashboard-sdk',
    setup(build) {
      build.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: shim }));
      build.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: args.path, namespace: 'host-react' }));
      build.onLoad({ filter: /.*/, namespace: 'host-react' }, args => ({
        contents: args.path === 'react' ? `
          const React = window.__HERMES_PLUGIN_SDK__.React;
          export default React;
          export const { createContext, useContext, useState, useEffect, useRef, useSyncExternalStore,
            useCallback, useMemo, useReducer, useLayoutEffect, createElement, Fragment } = React;
        ` : `
          const React = window.__HERMES_PLUGIN_SDK__.React;
          export const Fragment = React.Fragment;
          export function jsx(type, props, key) { return React.createElement(type, key === undefined ? props : { ...props, key }); }
          export const jsxs = jsx;
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /desktop\/plugin\.js$/ }, async args => {
        const source = await readFile(args.path, 'utf8');
        if (!source.includes('function SourcePage({ ctx })')) throw new Error('Desktop SourcePage contract changed');
        // Export at build time only. Desktop stays untouched, including its filters.
        return { contents: source + '\nexport { SourcePage };\n', loader: 'js', resolveDir: path.dirname(args.path) };
      });
    }
  }],
  logLevel: 'info'
});

import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
const bundle = fileURLToPath(new URL('../../dashboard/dist/index.js', import.meta.url));
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'], alias: { '@hermes/plugin-sdk': fileURLToPath(new URL('./sdk.js', import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  plugins: [{
    name: 'fixture-dashboard-bundle',
    configureServer(server) {
      server.middlewares.use('/fixture-dashboard.js', (_req, res) => {
        res.setHeader('content-type', 'text/javascript');
        createReadStream(bundle).pipe(res);
      });
    },
  }],
});

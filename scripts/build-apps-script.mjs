import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/apps-script-rsa.cjs'],
  outfile: 'apps-script-build/EperjadinRsa.gs',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'EperjadinRsa',
  // Forge assumes a browser or Node; Apps Script V8 has neither navigator nor self.
  define: { self: 'globalThis', 'navigator.appName': '"Netscape"' },
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
});

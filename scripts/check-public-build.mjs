import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const forbidden = [
  /getDashboardV4|listAllSPD|getAllComponents|uploadDocumentV4|deletePerjadinV4/i,
  /(?:localStorage|sessionStorage|indexedDB)\s*(?:\.|\[)/,
  /script\.google\.com\/macros\/s\/[\w-]{15,}\/exec|docs\.google\.com\/spreadsheets\/d\//i,
  /\b\d{18}\b|pegawai sintetis|alamat sintetis|EPERJADIN_SPREADSHEET_ID|EperjadinRsa|oauth2\/v3\/certs/i,
];
function check(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) check(path);
    else {
      assert.match(path, /\.(?:html|js|css|svg|png|ico)$/i);
      const contents = readFileSync(path, 'utf8');
      for (const pattern of forbidden) assert.doesNotMatch(contents, pattern, `Private or retired artifact in ${path}`);
    }
  }
}
check('dist');
assert.match(readFileSync('dist/index.html', 'utf8'), /Content-Security-Policy/i);
console.log('Public build contains no Master routes, datasets, storage writers, or server artifacts.');

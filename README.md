# ePerjadin | Pengiriman SPD

Frontend GitHub Pages adalah formulir kirim: parsing teks detail satu SPD atau impor JSON Collector, pratinjau sementara, dan pengiriman setelah Google Sign-In. Data hasil input tidak disimpan di penyimpanan browser. Tidak ada dashboard, pembacaan Master, edit status, unggah dokumen, atau ekspor Master.

Koneksi diisi per sesi dengan URL deployment V5 dan OAuth Client ID yang diberikan admin melalui kanal resmi. Jangan memasukkan endpoint yang diterima dari sumber lain: domain Google sendiri tidak membuktikan bahwa sebuah deployment dimiliki kantor. URL dan client ID bukan kredensial; izin tulis diperiksa pada setiap POST.

## Pengembangan

```sh
npm ci
npm test
npx eslint src/v3 src/main.tsx
npm run build
node scripts/check-public-build.mjs
npm run preview -- --host 127.0.0.1 --port 4177
```

Untuk uji browser sintetis di terminal lain: `npx playwright install chromium`, lalu `npm run test:browser`. Gunakan `CHROME_PATH` untuk Chrome yang sudah terpasang, atau `SCREENSHOT_DIR` untuk merekam tangkapan layar sintetis. Test browser mencegat Google Sign-In dan Apps Script; test unit menggunakan tanda tangan RSA lokal dan meniru Sheets.

- [Prosedur staging dan cutover V5](docs/security-v5.md)
- [Kolektor lokal](collector-extension-v2/README.md)
- [Tangkapan layar pratinjau sintetis](docs/pratinjau-sintetis.png) dan [konfirmasi sintetis](docs/konfirmasi-sintetis.png)

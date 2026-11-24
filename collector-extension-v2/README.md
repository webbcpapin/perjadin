# ePerjadin Collector V2.2.1

Ekstensi tetap lokal dan hanya membaca tampilan Satu Kemenkeu dari sesi pengguna yang sudah login. Tidak mengirim data ke Master, tidak menangani login, dan tidak menyetujui atau mengubah transaksi. Peningkatan otomatisasi massal tidak termasuk refaktor ini.

- Data run disimpan di `chrome.storage.session`: bertahan saat popup ditutup, tetapi hilang ketika browser ditutup, ekstensi dimatikan, diperbarui, atau dimuat ulang.
- Pada pembaruan, versi ini membersihkan cache persisten V2 lama. Bila perlu, tuntaskan batch lama sebelum memasang versi baru. Hapus pula data/ekstensi V1 bila masih terpasang.
- Ekspor batch JSON dilakukan secara manual, maksimal 20 SPD per file dan 750 KB. Hanya isi detail yang bisa diimpor; indeks kegiatan tidak ikut diekspor.
- Gunakan tombol **Hapus data lokal** setelah backend mengonfirmasi kiriman. Hapus juga file unduhan yang tidak diperlukan dan jangan membagikannya di kanal publik.

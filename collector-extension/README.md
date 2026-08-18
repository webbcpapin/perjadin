# Kolektor EPERJADIN SATU Kemenkeu

Ekstensi ini hanya membaca tabel yang sedang tampil pada `satu.kemenkeu.go.id/perjadin`. Ekstensi tidak memanggil aksi persetujuan, pembatalan, penghapusan, atau perubahan transaksi.

## Instalasi lokal

1. Buka `chrome://extensions`.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked** dan pilih folder `collector-extension`.
4. Login ke SATU Kemenkeu dan buka salah satu daftar Perjadin.
5. Buka ikon ekstensi, pilih **Rekam semua halaman**, lalu **Salin JSON**.
6. Buka ePerjadin Manager, klik **Tempel dari Kolektor**, periksa jumlah data, lalu sinkronkan ke Google Sheet.

Untuk memperkaya indeks dengan nilai, peserta, akun, dan data pertanggungjawaban, buka tampilan detail transaksi lalu pilih **Rekam detail yang sedang terbuka**. Ulangi pada detail berikutnya; kolektor mengakumulasikan detail sampai tombol **Hapus data tersimpan** ditekan. Impor JSON detail dengan cara yang sama; nilai kosong dari daftar tidak akan menghapus rincian yang sudah tersimpan.

Jalankan kolektor terpisah pada setiap tab/status yang ingin diarsipkan. Tab `SINKRONISASI` di Google Sheet mencatat jumlah pusat, jumlah diterima, data baru, data diperbarui, data dilewati, dan persentase cakupan setiap batch.

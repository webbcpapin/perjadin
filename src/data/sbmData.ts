export const sbmUangHarian: Record<string, { luarKota: number; dalamKota: number }> = {
  'ACEH': { luarKota: 360000, dalamKota: 140000 },
  'SUMATERA UTARA': { luarKota: 370000, dalamKota: 150000 },
  'RIAU': { luarKota: 370000, dalamKota: 150000 },
  'KEPULAUAN RIAU': { luarKota: 370000, dalamKota: 150000 },
  'JAMBI': { luarKota: 370000, dalamKota: 150000 },
  'SUMATERA BARAT': { luarKota: 380000, dalamKota: 150000 },
  'SUMATERA SELATAN': { luarKota: 380000, dalamKota: 150000 },
  'LAMPUNG': { luarKota: 380000, dalamKota: 150000 },
  'BENGKULU': { luarKota: 380000, dalamKota: 150000 },
  'BANGKA BELITUNG': { luarKota: 410000, dalamKota: 160000 },
  'BANTEN': { luarKota: 370000, dalamKota: 150000 },
  'JAWA BARAT': { luarKota: 430000, dalamKota: 170000 },
  'DKI JAKARTA': { luarKota: 530000, dalamKota: 210000 },
  'JAWA TENGAH': { luarKota: 370000, dalamKota: 150000 },
  'DI YOGYAKARTA': { luarKota: 420000, dalamKota: 170000 },
  'JAWA TIMUR': { luarKota: 410000, dalamKota: 160000 },
  'BALI': { luarKota: 480000, dalamKota: 190000 },
  'NUSA TENGGARA BARAT': { luarKota: 440000, dalamKota: 180000 },
  'NUSA TENGGARA TIMUR': { luarKota: 430000, dalamKota: 170000 },
  'KALIMANTAN BARAT': { luarKota: 380000, dalamKota: 150000 },
  'KALIMANTAN TENGAH': { luarKota: 360000, dalamKota: 140000 },
  'KALIMANTAN SELATAN': { luarKota: 380000, dalamKota: 150000 },
  'KALIMANTAN TIMUR': { luarKota: 430000, dalamKota: 170000 },
  'KALIMANTAN UTARA': { luarKota: 430000, dalamKota: 170000 },
  'SULAWESI UTARA': { luarKota: 370000, dalamKota: 150000 },
  'GORONTALO': { luarKota: 370000, dalamKota: 150000 },
  'SULAWESI BARAT': { luarKota: 410000, dalamKota: 160000 },
  'SULAWESI SELATAN': { luarKota: 430000, dalamKota: 170000 },
  'SULAWESI TENGAH': { luarKota: 370000, dalamKota: 150000 },
  'SULAWESI TENGGARA': { luarKota: 380000, dalamKota: 150000 },
  'MALUKU': { luarKota: 380000, dalamKota: 150000 },
  'MALUKU UTARA': { luarKota: 430000, dalamKota: 170000 },
  'PAPUA': { luarKota: 580000, dalamKota: 230000 },
  'PAPUA BARAT': { luarKota: 480000, dalamKota: 190000 },
  'PAPUA BARAT DAYA': { luarKota: 480000, dalamKota: 190000 },
  'PAPUA TENGAH': { luarKota: 580000, dalamKota: 230000 },
  'PAPUA SELATAN': { luarKota: 580000, dalamKota: 230000 },
  'PAPUA PEGUNUNGAN': { luarKota: 580000, dalamKota: 230000 },
};

export const pulauBangkaKabupaten = [
  'BANGKA', 'BANGKA BARAT', 'BANGKA TENGAH', 'BANGKA SELATAN', 'BELITUNG', 'BELITUNG TIMUR'
];

export function getUangHarian(tujuan: string): {
  kategori: 'dalam_kota' | 'pulau_bangka' | 'luar_pulau_bangka';
  uangHarian: number;
  sbmLuarKota: number;
  sbm60Persen: number;
  provinsi: string;
  keterangan: string;
} {
  const tujuanUpper = tujuan.toUpperCase().trim();

  // 1. Dalam Kota Pangkalpinang
  if (tujuanUpper.includes('PANGKALPINANG') || tujuanUpper.includes('PANGKAL PINANG')) {
    return {
      kategori: 'dalam_kota',
      uangHarian: 100000,
      sbmLuarKota: sbmUangHarian['BANGKA BELITUNG'].luarKota,
      sbm60Persen: sbmUangHarian['BANGKA BELITUNG'].luarKota * 0.6,
      provinsi: 'BANGKA BELITUNG',
      keterangan: 'Dalam Kota Pangkalpinang: Rp 100.000/hari (min. 8 jam)'
    };
  }

  // 2. Luar Kota di Pulau Bangka
  for (const kab of pulauBangkaKabupaten) {
    if (tujuanUpper.includes(kab)) {
      return {
        kategori: 'pulau_bangka',
        uangHarian: 200000,
        sbmLuarKota: sbmUangHarian['BANGKA BELITUNG'].luarKota,
        sbm60Persen: sbmUangHarian['BANGKA BELITUNG'].luarKota * 0.6,
        provinsi: 'BANGKA BELITUNG',
        keterangan: `Luar Kota di Pulau Bangka (${kab}): Rp 200.000/hari`
      };
    }
  }

  // 3. Luar Pulau Bangka - match by provinsi
  for (const [prov, uh] of Object.entries(sbmUangHarian)) {
    if (tujuanUpper.includes(prov)) {
      const uh60 = Math.round(uh.luarKota * 0.6);
      return {
        kategori: 'luar_pulau_bangka',
        uangHarian: uh60,
        sbmLuarKota: uh.luarKota,
        sbm60Persen: uh60,
        provinsi: prov,
        keterangan: `Luar Pulau Bangka (${prov}): 60% x Rp ${uh.luarKota.toLocaleString()} = Rp ${uh60.toLocaleString()}/hari`
      };
    }
  }

  // Default
  return {
    kategori: 'luar_pulau_bangka',
    uangHarian: 0,
    sbmLuarKota: 0,
    sbm60Persen: 0,
    provinsi: '',
    keterangan: 'Provinsi tidak dikenali. Masukkan nama provinsi yang valid.'
  };
}

export function parseTanggalRange(tanggalStr: string): { berangkat: string; pulang: string; lamaHari: number } {
  // Format: "03-03-2026 s/d 03-03-2026" atau "03-03-2026 s/d 05-03-2026"
  const clean = tanggalStr.replace(/\s+/g, ' ').trim();
  const parts = clean.split('s/d');
  
  if (parts.length === 2) {
    const berangkat = parts[0].trim();
    const pulang = parts[1].trim();
    
    try {
      const d1 = new Date(berangkat.split('-').reverse().join('-'));
      const d2 = new Date(pulang.split('-').reverse().join('-'));
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return { berangkat, pulang, lamaHari: diffDays };
    } catch {
      return { berangkat, pulang, lamaHari: 1 };
    }
  }
  
  return { berangkat: clean, pulang: clean, lamaHari: 1 };
}

import type { GeotagIssue } from '@/types';

export interface GeotagStatementData {
  namaPegawai: string;
  jabatan?: string;
  nomorST: string;
  nomorSPD?: string;
  tanggalKegiatan: string;
  namaKegiatan: string;
  tujuan: string;
  start: string;
  clockIn: string;
  clockOut: string;
  end: string;
  issues: GeotagIssue[];
}

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function escapeXml(value: string | number | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text: string, options: { bold?: boolean; center?: boolean } = {}) {
  return `<w:p><w:pPr>${options.center ? '<w:jc w:val="center"/>' : ''}</w:pPr><w:r><w:rPr>${options.bold ? '<w:b/>' : ''}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function tableRow(label: string, value: string) {
  return `<w:tr><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${paragraph(label)}</w:tc><w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>${paragraph(value)}</w:tc></w:tr>`;
}

function buildDocumentXml(data: GeotagStatementData) {
  const issueText = data.issues.length
    ? data.issues.map((item) => `${item.label}: ${item.message} Seharusnya ${item.expectedLocation} pada ${item.expectedDate}.`).join(' ')
    : 'Geotag telah sesuai.';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph('KEMENTERIAN KEUANGAN REPUBLIK INDONESIA', { bold: true, center: true })}
    ${paragraph('DIREKTORAT JENDERAL BEA DAN CUKAI', { bold: true, center: true })}
    ${paragraph('KPPBC TIPE MADYA PABEAN C PANGKALPINANG', { bold: true, center: true })}
    ${paragraph('SURAT PERNYATAAN GEOTAG', { bold: true, center: true })}
    ${paragraph('Yang bertandatangan di bawah ini:')}
    <w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>
      ${tableRow('Nama', data.namaPegawai || '(Nama Pelaksana SPD)')}
      ${tableRow('Jabatan', data.jabatan || '(Jabatan Pelaksana SPD)')}
      ${tableRow('Nomor ST', data.nomorST || '-')}
      ${tableRow('Nomor SPD', data.nomorSPD || '-')}
      ${tableRow('Kegiatan', data.namaKegiatan || '-')}
      ${tableRow('Tujuan', data.tujuan || '-')}
      ${tableRow('Tanggal Kegiatan', data.tanggalKegiatan || '-')}
    </w:tbl>
    ${paragraph('Dengan ini menyatakan bahwa saya telah melaksanakan perjalanan dinas sesuai dengan waktu dan tujuan yang telah ditentukan. Dalam pelaksanaan perjalanan dinas tersebut terdapat kendala/ketidaksesuaian geotag pada aplikasi Satu Kemenkeu.')}
    ${paragraph(issueText)}
    ${paragraph('Berikut disampaikan waktu dan tempat yang seharusnya menjadi presensi perjalanan dinas:')}
    <w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>
      ${tableRow('START', data.start)}
      ${tableRow('CLOCK IN', data.clockIn)}
      ${tableRow('CLOCK OUT', data.clockOut)}
      ${tableRow('END', data.end)}
    </w:tbl>
    ${paragraph('Saya bersedia memberikan penjelasan lebih lanjut jika diperlukan serta bertanggung jawab atas kebenaran informasi yang disampaikan dalam surat pernyataan ini.')}
    ${paragraph('Demikian surat pernyataan ini dibuat dengan sebenar-benarnya, atas perhatiannya diucapkan terima kasih.')}
    ${paragraph('Pangkalpinang, ____________________')}
    ${paragraph('Pelaksana SPD,')}
    ${paragraph('')}
    ${paragraph('')}
    ${paragraph(data.namaPegawai || '(Nama Pelaksana SPD)')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

function buildZip(files: Array<{ name: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(contentBytes.length),
      ...uint32(contentBytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
    ]);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(contentBytes.length),
      ...uint32(contentBytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralSize),
    ...uint32(offset),
    ...uint16(0),
  ]);

  const allParts = [...localParts, ...centralParts, end];
  const totalLength = allParts.reduce((sum, part) => sum + part.length, 0);
  const zipBytes = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of allParts) {
    zipBytes.set(part, cursor);
    cursor += part.length;
  }

  return new Blob([zipBytes.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function createGeotagStatementDocx(data: GeotagStatementData) {
  return buildZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: 'word/document.xml',
      content: buildDocumentXml(data),
    },
  ]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

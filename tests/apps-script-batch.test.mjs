import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

class Range {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  getValues() {
    return Array.from({ length: this.rows }, (_, rowOffset) =>
      Array.from({ length: this.columns }, (_, columnOffset) =>
        this.sheet.values[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? '',
      ),
    );
  }

  setValues(values) {
    values.forEach((rowValues, rowOffset) => {
      const targetRow = this.row - 1 + rowOffset;
      this.sheet.values[targetRow] ||= [];
      rowValues.forEach((value, columnOffset) => {
        this.sheet.values[targetRow][this.column - 1 + columnOffset] = value;
      });
    });
    return this;
  }

  clearContent() {
    for (let rowOffset = 0; rowOffset < this.rows; rowOffset++) {
      for (let columnOffset = 0; columnOffset < this.columns; columnOffset++) {
        const row = this.sheet.values[this.row - 1 + rowOffset];
        if (row) row[this.column - 1 + columnOffset] = '';
      }
    }
    return this;
  }

  setFontWeight() { return this; }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.values = [];
  }

  getName() { return this.name; }
  getLastRow() { return this.values.reduce((last, row, index) => row.some((value) => value !== '') ? index + 1 : last, 0); }
  getLastColumn() { return this.values.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, rows = 1, columns = 1) { return new Range(this, row, column, rows, columns); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(values) { this.values.push([...values]); }
  deleteRow(row) { this.values.splice(row - 1, 1); }
}

class Spreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new Sheet(name); this.sheets.set(name, sheet); return sheet; }
  getSheets() { return [...this.sheets.values()]; }
}

function createRuntime() {
  const spreadsheet = new Spreadsheet();
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Error,
    SpreadsheetApp: { openById: () => spreadsheet },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: (() => { let value = 0; return () => `batch-${++value}`; })(),
      Charset: { UTF_8: 'UTF_8' },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: () => [],
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), context);
  return { context, spreadsheet };
}

test('collector batch inserts once and updates without duplication', () => {
  const { context, spreadsheet } = createRuntime();
  const payload = {
    source: 'satu-kemenkeu',
    section: 'Kegiatan Utama',
    totalSourceRows: 2,
    capturedAt: '2026-08-18T03:00:00.000Z',
    pageUrl: 'https://satu.kemenkeu.go.id/perjadin/monitoring',
    records: [
      { stage: 'Kegiatan', idKegiatan: 'abc123', namaKegiatan: 'Kegiatan A', nomorST: 'ST-1/2026', status: 'Disetujui', sourceRecordKey: 'kegiatan|abc123|st-1|kegiatan' },
      { stage: 'Kegiatan', idKegiatan: 'def456', namaKegiatan: 'Kegiatan B', nomorST: 'ST-2/2026', status: 'Usulan', sourceRecordKey: 'kegiatan|def456|st-2|kegiatan' },
    ],
  };

  const first = JSON.parse(context.batchUpsertCollector_(payload).text);
  const second = JSON.parse(context.batchUpsertCollector_({ ...payload, records: payload.records.map((record) => ({ ...record, status: 'Kegiatan Disetujui' })) }).text);

  assert.equal(first.inserted, 2);
  assert.equal(first.updated, 0);
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 2);
  assert.equal(spreadsheet.getSheetByName('DATA_PERJADIN').getLastRow(), 3);
  assert.equal(spreadsheet.getSheetByName('SINKRONISASI').getLastRow(), 3);
});

let exceljs: Promise<typeof import('exceljs').default> | undefined;
let mssql: Promise<typeof import('mssql')> | undefined;
let jimp: Promise<typeof import('jimp')> | undefined;

export function loadExcelJS() {
  exceljs ??= import('exceljs').then((mod) => mod.default);
  return exceljs;
}

export function loadMssql() {
  mssql ??= import('mssql');
  return mssql;
}

export function loadJimp() {
  jimp ??= import('jimp');
  return jimp;
}

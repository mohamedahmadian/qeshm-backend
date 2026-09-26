import ExcelJS from 'exceljs';
import { getRequestLocale, isLtrLocale } from './request-locale';

const HEADER_FILL = '2EBDB6';
const FONT_SIZE = 12;
const ROW_HEIGHT = 30;

export type StyledExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

function rowIndexHeader() {
  const locale = getRequestLocale();
  if (locale === 'en') return 'No.';
  if (locale === 'hi') return 'क्रम';
  return 'ردیف';
}

export async function buildStyledExcelExport(options: {
  sheetName: string;
  columns: StyledExcelColumn[];
  rows: Record<string, unknown>[];
  fileName?: string;
}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(options.sheetName.slice(0, 31), {
    views: [{ rightToLeft: !isLtrLocale(getRequestLocale()) }],
  });
  const columns = [
    { header: rowIndexHeader(), key: 'rowNo', width: 8 },
    ...options.columns,
  ];
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 18,
  }));

  const header = sheet.getRow(1);
  header.height = ROW_HEIGHT;
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${HEADER_FILL}` },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: FONT_SIZE };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  for (const [index, row] of options.rows.entries()) {
    const added = sheet.addRow({ rowNo: index + 1, ...row });
    added.height = ROW_HEIGHT;
    added.eachCell((cell) => {
      cell.font = { size: FONT_SIZE };
      cell.alignment = { vertical: 'middle' };
    });
  }

  const total = sheet.addRow({ rowNo: options.rows.length });
  total.height = ROW_HEIGHT;
  for (let index = 1; index <= columns.length; index += 1) {
    const cell = total.getCell(index);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${HEADER_FILL}` },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: FONT_SIZE };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    if (index > 1) {
      cell.value = null;
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: options.fileName ?? `${options.sheetName}.xlsx`,
  };
}

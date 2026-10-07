import { existsSync } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { Religion, type PrismaClient } from '../generated/prisma/client';

/** Type column in داده های پایه.xlsx (CitizenCard base data). */
export const QESHMONDI_LOOKUP_TYPE = {
  group: 1,
  nationality: 6,
  education: 7,
  religion: 11,
  protector: 13,
} as const;

export type QeshmondiLookupHit = {
  sourceId: number;
  type: number;
  title: string | null;
};

type LookupDb = Pick<PrismaClient, 'qeshmondiLookup'>;

function cellText(value: ExcelJS.CellValue) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return '';
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function cellInt(value: ExcelJS.CellValue) {
  const text = cellText(value);
  if (!text || text.toUpperCase() === 'NULL') return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

function emptyTitle(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'NULL') return null;
  return trimmed;
}

export function qeshmondiLookupFilePath() {
  const candidates = [
    path.resolve(process.cwd(), 'داده های پایه.xlsx'),
    path.resolve(process.cwd(), 'backend', 'داده های پایه.xlsx'),
    path.resolve(__dirname, '../../داده های پایه.xlsx'),
    path.resolve(__dirname, '../../../داده های پایه.xlsx'),
  ];
  return candidates.find((item) => existsSync(item)) ?? null;
}

export async function importQeshmondiLookupFile(prisma: LookupDb) {
  const filePath = qeshmondiLookupFilePath();
  if (!filePath) return 0;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return 0;

  const data: {
    sourceId: number;
    code: string | null;
    title: string | null;
    type: number;
    parentSourceId: number | null;
  }[] = [];
  const seen = new Set<number>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sourceId = cellInt(row.getCell(1).value);
    const type = cellInt(row.getCell(4).value);
    if (sourceId == null || type == null || seen.has(sourceId)) return;
    seen.add(sourceId);
    data.push({
      sourceId,
      code: emptyTitle(cellText(row.getCell(2).value)),
      title: emptyTitle(cellText(row.getCell(3).value)),
      type,
      parentSourceId: cellInt(row.getCell(5).value),
    });
  });
  if (!data.length) return 0;

  const chunkSize = 500;
  for (let index = 0; index < data.length; index += chunkSize) {
    await prisma.qeshmondiLookup.createMany({
      data: data.slice(index, index + chunkSize),
      skipDuplicates: true,
    });
  }
  return data.length;
}

export async function ensureQeshmondiLookups(prisma: LookupDb) {
  const count = await prisma.qeshmondiLookup.count();
  if (!count) await importQeshmondiLookupFile(prisma);
  const rows = await prisma.qeshmondiLookup.findMany({
    select: { sourceId: true, type: true, title: true },
  });
  return new Map<number, QeshmondiLookupHit>(rows.map((row) => [row.sourceId, row]));
}

export function lookupSourceId(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

export function lookupTitle(
  lookups: Map<number, QeshmondiLookupHit>,
  value: unknown,
  type: number,
) {
  const sourceId = lookupSourceId(value);
  if (sourceId == null) return null;
  const hit = lookups.get(sourceId);
  if (!hit || hit.type !== type) return null;
  const title = hit.title?.trim();
  return title ? title : null;
}

export function resolveQeshmondiReligion(title: string | null) {
  const text = title?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return { religion: null as Religion | null, religionOther: null as string | null };
  if (text.includes('شیعه') || text.includes('اهل سنت') || text.includes('اسلام')) {
    return { religion: Religion.ISLAM, religionOther: text };
  }
  if (text.includes('کلیم') || text.includes('كليم') || text.includes('یهود')) {
    return { religion: Religion.JUDAISM, religionOther: null };
  }
  if (text.includes('مسیح')) {
    return { religion: Religion.CHRISTIANITY, religionOther: null };
  }
  if (text.includes('زرتشت')) {
    return { religion: Religion.ZOROASTRIANISM, religionOther: null };
  }
  return { religion: Religion.OTHER, religionOther: text };
}

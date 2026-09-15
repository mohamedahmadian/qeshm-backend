import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

type GeoJsonBoundary =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

type KmzProject = {
  systemName: string;
  latitude: number;
  longitude: number;
  boundary: GeoJsonBoundary;
};

function normalizeName(value: string) {
  return value.replace(/[\/\s]+/g, ' ').trim();
}

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codeFromName(name: string, used: Set<string>) {
  const base =
    normalizeName(name).split(' ').slice(0, 2).join(' ').slice(0, 36) ||
    name.slice(0, 20);
  let next = base;
  let index = 2;
  while (used.has(next.toLowerCase())) {
    next = `${base}-${index}`;
    index += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

function readZipEntries(buf: Buffer) {
  const entries: { name: string; data: Buffer }[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const signature = buf.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    if (flags & 0x0008) {
      throw new Error('KMZ با data descriptor پشتیبانی نمی‌شود');
    }
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);
    const data =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed)
          : (() => {
              throw new Error(`روش فشرده‌سازی KMZ پشتیبانی نمی‌شود: ${method}`);
            })();
    entries.push({ name, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}

function loadKmlText() {
  const path = join(__dirname, 'Qeshm_Project.kmz');
  const entries = readZipEntries(readFileSync(path));
  const kml = entries.find((entry) =>
    entry.name.toLowerCase().endsWith('.kml'),
  );
  if (!kml) {
    throw new Error('داخل KMZ فایل KML پیدا نشد');
  }
  return kml.data.toString('utf8');
}

function parseCoordinates(block: string) {
  const points: { lat: number; lng: number }[] = [];
  for (const token of block.trim().split(/\s+/)) {
    const parts = token.split(',');
    if (parts.length < 2) continue;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    points.push({ lat, lng });
  }
  return points;
}

function closeLngLatRing(points: { lat: number; lng: number }[]) {
  const ring = points.map((point) => [point.lng, point.lat]);
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring;
}

function ringCentroid(points: { lat: number; lng: number }[]) {
  const ring =
    points.length > 1 &&
    points[0].lat === points[points.length - 1].lat &&
    points[0].lng === points[points.length - 1].lng
      ? points.slice(0, -1)
      : points;
  if (!ring.length) return null;
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
  return { latitude: lat, longitude: lng };
}

function parsePolygonRings(body: string) {
  return [...body.matchAll(/<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/g)]
    .map((match) => {
      const coords = match[1]?.match(/<coordinates>\s*([^<]+)<\/coordinates>/);
      return parseCoordinates(coords?.[1] ?? '');
    })
    .filter((points) => points.length >= 3);
}

function toBoundary(rings: { lat: number; lng: number }[][]): GeoJsonBoundary | null {
  const closed = rings
    .map((points) => closeLngLatRing(points))
    .filter((ring) => ring.length >= 4);
  if (!closed.length) return null;
  if (closed.length === 1) {
    return { type: 'Polygon', coordinates: [closed[0]] };
  }
  return { type: 'MultiPolygon', coordinates: closed.map((ring) => [ring]) };
}

function parseKmzProjects(): KmzProject[] {
  const kml = loadKmlText();
  const placemarks = [...kml.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g)];
  const items: KmzProject[] = [];
  const seen = new Set<string>();

  for (const match of placemarks) {
    const body = match[1] ?? '';
    const nameMatch = body.match(/<name>([\s\S]*?)<\/name>/);
    const systemName = decodeXmlText(nameMatch?.[1] ?? '');
    if (!systemName) continue;

    const rings = parsePolygonRings(body);
    const points = rings.flat();
    const boundary = toBoundary(rings);
    const center = ringCentroid(points);
    if (!center || !boundary) {
      console.warn(`مختصات برای «${systemName}» پیدا نشد؛ رد شد`);
      continue;
    }

    const key = normalizeName(systemName).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ systemName, boundary, ...center });
  }

  if (!items.length) {
    throw new Error('در KMZ هیچ پروژه‌ای پیدا نشد');
  }
  return items;
}

export async function importKmzProjects(prisma: PrismaClient) {
  const items = parseKmzProjects();
  const existing = await prisma.project.findMany({
    select: { id: true, systemName: true, code: true, latitude: true, longitude: true },
  });
  const usedCodes = new Set(existing.map((item) => item.code.toLowerCase()));
  const byName = new Map(
    existing.map((item) => [normalizeName(item.systemName).toLowerCase(), item]),
  );

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const key = normalizeName(item.systemName).toLowerCase();
    const current = byName.get(key);
    const latitude = new Prisma.Decimal(item.latitude.toFixed(7));
    const longitude = new Prisma.Decimal(item.longitude.toFixed(7));
    const boundary = item.boundary as Prisma.InputJsonValue;

    if (current) {
      await prisma.project.update({
        where: { id: current.id },
        data: {
          boundary,
          ...(current.latitude == null || current.longitude == null
            ? { latitude, longitude }
            : {}),
        },
      });
      updated += 1;
      continue;
    }

    await prisma.project.create({
      data: {
        systemName: item.systemName,
        code: codeFromName(item.systemName, usedCodes),
        latitude,
        longitude,
        boundary,
      },
    });
    created += 1;
  }

  return { total: items.length, created, updated };
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await importKmzProjects(prisma);
  console.log(
    `KMZ: ${result.total} مورد، ${result.created} ایجاد، ${result.updated} به‌روز`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

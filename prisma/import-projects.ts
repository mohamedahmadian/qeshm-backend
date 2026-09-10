import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient, ProjectImportance } from '../src/generated/prisma/client';

type SeedProject = {
  vicePresidency: string;
  management: string;
  unit: string;
  systemName: string;
  isActive: boolean;
  companyName: string | null;
  systemUrl: string | null;
  launchYear: number | null;
  isSupportActive: boolean;
  replacementName: string | null;
  description: string | null;
  importance: ProjectImportance;
};

function normalizeName(value: string) {
  return value.replace(/[\/\s]+/g, ' ').trim();
}

function codeFromName(name: string, used: Set<string>) {
  const base =
    normalizeName(name).split(' ').slice(0, 2).join(' ').slice(0, 36) || name.slice(0, 20);
  let next = base;
  let index = 2;
  while (used.has(next.toLowerCase())) {
    next = `${base}-${index}`;
    index += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

function loadSeed(): SeedProject[] {
  const path = join(__dirname, 'project-seed.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SeedProject[];
}

function findReplacementId(
  name: string,
  created: { id: string; systemName: string }[],
) {
  const needle = normalizeName(name);
  const exact = created.find(
    (item) => normalizeName(item.systemName) === needle,
  );
  if (exact) {
    return exact.id;
  }
  const partial = created
    .filter((item) => {
      const hay = normalizeName(item.systemName);
      return hay.includes(needle) || needle.includes(hay);
    })
    .sort((a, b) => a.systemName.length - b.systemName.length);
  return partial[0]?.id ?? null;
}

export async function importProjects(
  prisma: PrismaClient,
  options?: { replace?: boolean },
) {
  const items = loadSeed();
  const existing = await prisma.project.count();
  if (existing > 0 && !options?.replace) {
    return { imported: 0, skipped: existing };
  }
  if (existing > 0 && options?.replace) {
    await prisma.project.deleteMany();
  }

  const created: { id: string; systemName: string }[] = [];
  const usedCodes = new Set<string>();
  for (const item of items) {
    const project = await prisma.project.create({
      data: {
        vicePresidency: item.vicePresidency,
        management: item.management,
        unit: item.unit,
        systemName: item.systemName,
        code: codeFromName(item.systemName, usedCodes),
        isActive: item.isActive,
        companyName: item.companyName,
        systemUrl: item.systemUrl,
        launchYear: item.launchYear,
        isSupportActive: item.isSupportActive,
        description: item.description,
        importance: item.importance,
      } satisfies Prisma.ProjectUncheckedCreateInput,
      select: { id: true, systemName: true },
    });
    created.push(project);
  }

  let linked = 0;
  for (const [index, item] of items.entries()) {
    if (!item.replacementName) {
      continue;
    }
    const replacementId = findReplacementId(item.replacementName, created);
    if (!replacementId || replacementId === created[index].id) {
      continue;
    }
    await prisma.project.update({
      where: { id: created[index].id },
      data: { replacementProjectId: replacementId },
    });
    linked += 1;
  }

  return { imported: created.length, linked, skipped: 0 };
}

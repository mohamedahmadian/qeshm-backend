import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type FeedDb = PrismaService | Prisma.TransactionClient;

function source(payload: string) {
  return Prisma.sql`
    jsonb_to_recordset(CAST(${payload} AS jsonb)) AS v(
      national_id text,
      first_name text,
      last_name text,
      end_date text
    )
  `;
}

/** File import overwrites the expiry. A row is a change when name or expiry differs. */
export async function insertQeshmondiFeedFileUpdates(db: FeedDb, payload: string) {
  await db.$executeRaw`
    INSERT INTO "qeshmondi_feed_events" (
      "userId", "nationalId", "firstName", "lastName", "qeshmondiEndDate"
    )
    SELECT
      u.id,
      u."nationalId",
      v.first_name,
      v.last_name,
      CAST(v.end_date AS date)
    FROM "users" AS u
    INNER JOIN ${source(payload)} ON u."nationalId" = v.national_id
    WHERE btrim(u."firstName") IS DISTINCT FROM btrim(v.first_name)
       OR btrim(u."lastName") IS DISTINCT FROM btrim(v.last_name)
       OR u."qeshmondiEndDate" IS DISTINCT FROM CAST(v.end_date AS date)
  `;
}

/**
 * SQL sync keeps the current expiry when the source date is empty.
 * Only a non-empty different date counts as an expiry change.
 */
export async function insertQeshmondiFeedSqlUpdates(db: FeedDb, payload: string) {
  await db.$executeRaw`
    INSERT INTO "qeshmondi_feed_events" (
      "userId", "nationalId", "firstName", "lastName", "qeshmondiEndDate"
    )
    SELECT
      u.id,
      u."nationalId",
      v.first_name,
      v.last_name,
      COALESCE(CAST(NULLIF(v.end_date, '') AS date), u."qeshmondiEndDate")
    FROM "users" AS u
    INNER JOIN ${source(payload)} ON u."nationalId" = v.national_id
    WHERE btrim(u."firstName") IS DISTINCT FROM btrim(v.first_name)
       OR btrim(u."lastName") IS DISTINCT FROM btrim(v.last_name)
       OR (
         NULLIF(v.end_date, '') IS NOT NULL
         AND u."qeshmondiEndDate" IS DISTINCT FROM CAST(v.end_date AS date)
       )
  `;
}

export async function insertQeshmondiFeedCreates(db: FeedDb, nationalIds: string[]) {
  if (!nationalIds.length) return;
  await db.$executeRaw`
    INSERT INTO "qeshmondi_feed_events" (
      "userId", "nationalId", "firstName", "lastName", "qeshmondiEndDate"
    )
    SELECT u.id, u."nationalId", u."firstName", u."lastName", u."qeshmondiEndDate"
    FROM "users" AS u
    WHERE u."nationalId" IN (${Prisma.join(nationalIds)})
  `;
}

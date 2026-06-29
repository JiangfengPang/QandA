import { Prisma } from '@prisma/client';
import { addDays, dayKey, dayLabel } from './date.js';

export type DateBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

export function buildDateBuckets(start: Date, days: number) {
  return Array.from({ length: days }, (_, index): DateBucket => {
    const day = addDays(start, index);
    return {
      key: dayKey(day),
      label: dayLabel(day),
      start: day,
      end: addDays(day, 1)
    };
  });
}

export function dateBucketCaseSql(column: Prisma.Sql, buckets: DateBucket[]) {
  const clauses = buckets.map((bucket) => (
    Prisma.sql`WHEN ${column} >= ${bucket.start} AND ${column} < ${bucket.end} THEN ${bucket.key}`
  ));
  return Prisma.sql`CASE ${Prisma.join(clauses, ' ')} END`;
}

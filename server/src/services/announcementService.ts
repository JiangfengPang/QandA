import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { HttpError, pageMeta, toInt } from '../utils/http.js';

const statusToneValues = ['primary', 'success', 'info', 'warning', 'danger'] as const;

const announcementInputSchema = z.object({
  title: z.string().trim().min(1, '请输入公告标题').max(160, '公告标题不能超过 160 个字符'),
  summary: z.string().trim().min(1, '请输入公告摘要').max(300, '公告摘要不能超过 300 个字符'),
  content: z.union([
    z.string(),
    z.array(z.string())
  ]),
  categoryLabel: z.string().trim().min(1, '请输入分类标签').max(40, '分类标签不能超过 40 个字符'),
  statusLabel: z.string().trim().min(1, '请输入状态标签').max(40, '状态标签不能超过 40 个字符').optional(),
  statusTone: z.enum(statusToneValues).optional(),
  publisher: z.string().trim().max(80, '发布者不能超过 80 个字符').optional(),
  isPublished: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  publishedAt: z.string().trim().optional().nullable()
});

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

function toLocalDateTimeLabel(value?: Date | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTime(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new HttpError('发布时间格式不正确', 400);
  return date;
}

function normalizeContent(value: string | string[]) {
  const raw = Array.isArray(value)
    ? value.map((item) => String(item)).join('\n')
    : String(value || '');
  const content = raw.replace(/\r\n?/g, '\n').trim();
  if (!content) throw new HttpError('请输入公告内容', 400);
  return [content];
}

function normalizeInput(input: unknown) {
  const parsed = announcementInputSchema.parse(input);
  const isPublished = parsed.isPublished ?? true;
  const publishedAt = parseDateTime(parsed.publishedAt) || (isPublished ? new Date() : null);
  return {
    title: parsed.title,
    summary: parsed.summary,
    contentJson: normalizeContent(parsed.content),
    categoryLabel: parsed.categoryLabel,
    statusLabel: parsed.statusLabel || '已发布',
    statusTone: parsed.statusTone || 'success',
    publisher: parsed.publisher || 'QandA 管理员',
    isPublished,
    isPinned: Boolean(isPublished && parsed.isPinned),
    publishedAt
  };
}

function contentFromJson(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') return [value];
  return [];
}

function toAnnouncementDto(item: any, read = false) {
  const readCount = Number(item._count?.reads || item.readCount || 0);
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    content: contentFromJson(item.contentJson),
    category: item.categoryLabel,
    categoryLabel: item.categoryLabel,
    statusLabel: item.statusLabel,
    statusTone: item.statusTone,
    publisher: item.publisher,
    readCount,
    read,
    pinned: item.isPinned,
    isPinned: item.isPinned,
    isPublished: item.isPublished,
    publishedAt: toLocalDateTimeLabel(item.publishedAt),
    createdAt: toLocalDateTimeLabel(item.createdAt),
    updatedAt: toLocalDateTimeLabel(item.updatedAt)
  };
}

export async function listPublishedAnnouncements(userId: string) {
  const rows = await prisma.announcement.findMany({
    where: { isPublished: true },
    include: { _count: { select: { reads: true } } },
    orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }]
  });
  const readRows = rows.length
    ? await prisma.announcementRead.findMany({
      where: { userId, announcementId: { in: rows.map((item) => item.id) } },
      select: { announcementId: true }
    })
    : [];
  const readIds = new Set(readRows.map((item) => item.announcementId));
  return rows.map((item) => toAnnouncementDto(item, readIds.has(item.id)));
}

export async function markAnnouncementRead(userId: string, announcementId: string) {
  const announcement = await prisma.announcement.findFirst({
    where: { id: announcementId, isPublished: true },
    select: { id: true }
  });
  if (!announcement) throw new HttpError('公告不存在或尚未发布', 404);
  await prisma.announcementRead.upsert({
    where: { userId_announcementId: { userId, announcementId } },
    create: { userId, announcementId },
    update: { readAt: new Date() }
  });
  const readCount = await prisma.announcementRead.count({ where: { announcementId } });
  return { read: true, readCount };
}

export async function markAllPublishedAnnouncementsRead(userId: string) {
  const rows = await prisma.announcement.findMany({
    where: { isPublished: true },
    select: { id: true }
  });
  if (!rows.length) return { count: 0 };
  await prisma.announcementRead.createMany({
    data: rows.map((item) => ({ userId, announcementId: item.id })),
    skipDuplicates: true
  });
  const readCounts = await prisma.announcementRead.groupBy({
    by: ['announcementId'],
    where: { announcementId: { in: rows.map((item) => item.id) } },
    _count: { announcementId: true }
  });
  return {
    count: rows.length,
    readCounts: Object.fromEntries(readCounts.map((item) => [item.announcementId, item._count.announcementId]))
  };
}

export async function listAdminAnnouncements(query: Record<string, unknown>) {
  const page = toInt(query.page, 1);
  const pageSize = Math.min(toInt(query.pageSize, 100), 200);
  const keyword = String(query.keyword || '').trim();
  const statusLabel = String(query.statusLabel || '').trim();
  const isPublishedRaw = String(query.isPublished || '').trim();
  const where = {
    ...(keyword ? {
      OR: [
        { title: { contains: keyword } },
        { summary: { contains: keyword } },
        { categoryLabel: { contains: keyword } },
        { statusLabel: { contains: keyword } },
        { publisher: { contains: keyword } }
      ]
    } : {}),
    ...(statusLabel ? { statusLabel } : {}),
    ...(isPublishedRaw === 'true' ? { isPublished: true } : {}),
    ...(isPublishedRaw === 'false' ? { isPublished: false } : {})
  };

  const [total, rows, categories, statuses] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      include: { _count: { select: { reads: true } } },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.announcement.findMany({ distinct: ['categoryLabel'], select: { categoryLabel: true }, orderBy: { categoryLabel: 'asc' } }),
    prisma.announcement.findMany({ distinct: ['statusLabel'], select: { statusLabel: true, statusTone: true }, orderBy: { statusLabel: 'asc' } })
  ]);

  return {
    rows: rows.map((item) => toAnnouncementDto(item)),
    categoryOptions: categories.map((item) => item.categoryLabel).filter(Boolean),
    statusOptions: statuses.map((item) => ({ label: item.statusLabel, tone: item.statusTone })).filter((item) => item.label),
    meta: pageMeta(page, pageSize, total)
  };
}

export async function createAnnouncement(input: unknown) {
  const data = normalizeInput(input);
  return prisma.$transaction(async (tx) => {
    const row = await tx.announcement.create({ data });
    if (row.isPinned) {
      await tx.announcement.updateMany({
        where: { id: { not: row.id } },
        data: { isPinned: false }
      });
    }
    return toAnnouncementDto(row);
  });
}

export async function updateAnnouncement(id: string, input: unknown) {
  const data = normalizeInput(input);
  const existed = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existed) throw new HttpError('公告不存在', 404);
  return prisma.$transaction(async (tx) => {
    const row = await tx.announcement.update({ where: { id }, data });
    if (row.isPinned) {
      await tx.announcement.updateMany({
        where: { id: { not: row.id } },
        data: { isPinned: false }
      });
    }
    return toAnnouncementDto(row);
  });
}

export async function deleteAnnouncement(id: string) {
  await prisma.announcement.delete({ where: { id } });
  return true;
}

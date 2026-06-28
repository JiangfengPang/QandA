import type { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

type AuditDescriptor = {
  action: string;
  summary: string;
  targetType?: string;
  targetId?: string;
};

type RecordAdminOperationInput = AuditDescriptor & {
  adminId: string;
  method: string;
  path: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  statusCode: number;
  durationMs: number;
  details?: Prisma.InputJsonObject;
};

const actionLabels: Record<string, string> = {
  LOGIN: '登录后台',
  LOGOUT: '退出后台',
  UPDATE_STUDENT: '修改答题用户',
  UPDATE_ADMIN: '修改管理员',
  CHANGE_PASSWORD: '修改密码',
  CREATE_SUBJECT: '新增科目',
  UPDATE_SUBJECT: '修改科目',
  DELETE_SUBJECT: '删除科目',
  CREATE_BANK: '新增题库',
  UPDATE_BANK: '修改题库',
  DELETE_BANK: '删除题库',
  CREATE_QUESTION: '新增题目',
  UPDATE_QUESTION: '修改题目',
  DELETE_QUESTION: '删除题目',
  IMPORT_QUESTIONS: '导入题库',
  ADMIN_WRITE: '后台写操作'
};

function pathTarget(path: string, pattern: RegExp) {
  const value = path.match(pattern)?.[1];
  return value ? decodeURIComponent(value) : undefined;
}

function namedSummary(base: string, body: unknown) {
  if (!body || typeof body !== 'object') return base;
  const name = String((body as Record<string, unknown>).name || '').trim();
  return name ? `${base}：${name.slice(0, 80)}` : base;
}

function describeAdminOperation(method: string, path: string, body: unknown): AuditDescriptor {
  const normalizedMethod = method.toUpperCase();
  let targetId: string | undefined;

  if (normalizedMethod === 'PATCH' && (targetId = pathTarget(path, /\/admin\/users\/([^/]+)$/))) {
    if (targetId === 'batch') {
      const payload = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
      const ids = Array.isArray(payload.ids) ? payload.ids : [];
      const action = String(payload.action || '');
      const count = ids.length;
      const label = action === 'enable'
        ? '批量启用答题用户'
        : action === 'disable'
          ? '批量停用答题用户'
          : action === 'resetNickname'
            ? '批量重置答题用户昵称'
            : '批量修改答题用户';
      return {
        action: 'UPDATE_STUDENT',
        summary: count ? `${label}：${count} 人` : label,
        targetType: 'student-batch'
      };
    }
    const enabled = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).isActive : undefined;
    return {
      action: 'UPDATE_STUDENT',
      summary: typeof enabled === 'boolean' ? `${enabled ? '启用' : '停用'}答题用户` : '修改答题用户',
      targetType: 'student',
      targetId
    };
  }
  if (normalizedMethod === 'PATCH' && (targetId = pathTarget(path, /\/admin\/admins\/([^/]+)$/))) {
    const enabled = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).isActive : undefined;
    return {
      action: 'UPDATE_ADMIN',
      summary: typeof enabled === 'boolean' ? `${enabled ? '启用' : '停用'}管理员账号` : '修改管理员账号',
      targetType: 'admin',
      targetId
    };
  }
  if (normalizedMethod === 'PUT' && /\/admin\/password$/.test(path)) {
    return { action: 'CHANGE_PASSWORD', summary: '修改当前管理员密码', targetType: 'admin' };
  }

  const resourceRules = [
    { segment: 'subjects', targetType: 'subject', create: 'CREATE_SUBJECT', update: 'UPDATE_SUBJECT', remove: 'DELETE_SUBJECT', label: '科目' },
    { segment: 'banks', targetType: 'bank', create: 'CREATE_BANK', update: 'UPDATE_BANK', remove: 'DELETE_BANK', label: '题库' },
    { segment: 'questions', targetType: 'question', create: 'CREATE_QUESTION', update: 'UPDATE_QUESTION', remove: 'DELETE_QUESTION', label: '题目' }
  ];

  for (const rule of resourceRules) {
    if (normalizedMethod === 'POST' && new RegExp(`/admin/${rule.segment}$`).test(path)) {
      return {
        action: rule.create,
        summary: namedSummary(`新增${rule.label}`, body),
        targetType: rule.targetType
      };
    }
    targetId = pathTarget(path, new RegExp(`/admin/${rule.segment}/([^/]+)$`));
    if (targetId && normalizedMethod === 'PUT') {
      return {
        action: rule.update,
        summary: namedSummary(`修改${rule.label}`, body),
        targetType: rule.targetType,
        targetId
      };
    }
    if (targetId && normalizedMethod === 'DELETE') {
      return {
        action: rule.remove,
        summary: `删除${rule.label}`,
        targetType: rule.targetType,
        targetId
      };
    }
  }

  if (normalizedMethod === 'POST' && /\/admin\/import\/json$/.test(path)) {
    return { action: 'IMPORT_QUESTIONS', summary: '导入题库数据', targetType: 'question-bank' };
  }

  return {
    action: 'ADMIN_WRITE',
    summary: `${normalizedMethod} ${path}`
  };
}

function changedFields(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const hidden = /(password|code|answer|stem|explanation|payload|options|raw)/i;
  return Object.keys(body as Record<string, unknown>).filter((key) => !hidden.test(key)).slice(0, 20);
}

export async function recordAdminOperation(input: RecordAdminOperationInput) {
  await prisma.adminOperationLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      summary: input.summary,
      method: input.method.toUpperCase(),
      path: input.path,
      targetType: input.targetType,
      targetId: input.targetId,
      ipAddress: input.ipAddress?.slice(0, 80) || null,
      userAgent: input.userAgent?.slice(0, 500) || null,
      statusCode: input.statusCode,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      detailsJson: input.details || undefined
    }
  });
}

export function adminAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();

  const startedAt = Date.now();
  res.once('finish', () => {
    if (!req.auth?.userId) return;
    const path = req.originalUrl.split('?')[0] || req.path;
    const descriptor = describeAdminOperation(req.method, path, req.body);
    void recordAdminOperation({
      ...descriptor,
      adminId: req.auth.userId,
      method: req.method,
      path,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      details: { changedFields: changedFields(req.body) }
    }).catch((error) => {
      if (process.env.NODE_ENV !== 'production') console.error('管理员操作日志写入失败', error);
    });
  });

  return next();
}

export function getAdminActionOptions() {
  return Object.entries(actionLabels).map(([value, label]) => ({ value, label }));
}

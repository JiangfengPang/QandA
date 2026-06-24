import bcrypt from 'bcryptjs';
import { UserRole, type UserRole as UserRoleType } from '../utils/roles.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';

async function main() {
  const username = env.adminUsername;
  const passwordIssue = validatePasswordStrength(env.adminPassword);
  if (passwordIssue) {
    throw new Error(`管理员密码不符合生产安全要求：${passwordIssue}`);
  }

  let adminEmail = env.adminEmail && /^[1-9]\d{4,11}@qq\.com$/i.test(env.adminEmail) ? env.adminEmail.toLowerCase() : null;
  if (adminEmail) {
    const emailOwner = await prisma.user.findUnique({ where: { email: adminEmail }, select: { username: true } });
    if (emailOwner && emailOwner.username !== username) {
      console.warn(`管理员 QQ 邮箱 ${adminEmail} 已被其他账号占用，本次不会绑定到管理员账号`);
      adminEmail = null;
    }
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    const passwordChanged = !(await bcrypt.compare(env.adminPassword, existing.passwordHash));
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(passwordChanged ? {
          passwordHash: await bcrypt.hash(env.adminPassword, 12),
          sessionVersion: { increment: 1 }
        } : {}),
        role: UserRole.ADMIN,
        isActive: true,
        ...(adminEmail ? { email: adminEmail } : {})
      }
    });
  } else {
    await prisma.user.create({ data: {
      username,
      nickname: '管理员',
      email: adminEmail,
      passwordHash: await bcrypt.hash(env.adminPassword, 12),
      role: UserRole.ADMIN,
      isActive: true
    } });
  }
  console.log(`管理员账号已同步：${username}${adminEmail ? ` / ${adminEmail}` : ''}（密码以 server/.env 的 ADMIN_PASSWORD 为准）`);
}

main().finally(async () => prisma.$disconnect());

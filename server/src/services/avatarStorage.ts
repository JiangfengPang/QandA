import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const SUPPORTED_TYPES: Record<string, { ext: string; mime: string }> = {
  'image/jpeg': { ext: 'jpg', mime: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', mime: 'image/jpeg' },
  'image/png': { ext: 'png', mime: 'image/png' },
  'image/webp': { ext: 'webp', mime: 'image/webp' }
};

const MAX_AVATAR_BYTES = 512 * 1024;

function uploadRoot() {
  return path.resolve(process.cwd(), env.uploadDir);
}

function avatarRoot() {
  return path.join(uploadRoot(), 'avatars');
}

function permissionMessage(action: string) {
  return `头像${action}失败：服务器没有写入上传目录的权限。当前上传目录：${uploadRoot()}。本地运行请使用 npm run dev 或设置 UPLOAD_DIR=uploads；服务器部署请执行 sudo mkdir -p /var/www/qanda/uploads && sudo chown -R ubuntu:ubuntu /var/www/qanda/uploads。`;
}

function isPermissionError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && ['EACCES', 'EPERM'].includes(String((error as { code?: unknown }).code)));
}

function publicAvatarPath(filename: string) {
  return `/uploads/avatars/${filename}`;
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new HttpError('头像格式仅支持 JPG、PNG、WEBP', 400);

  const mime = match[1].toLowerCase();
  const meta = SUPPORTED_TYPES[mime];
  if (!meta) throw new HttpError('头像格式仅支持 JPG、PNG、WEBP', 400);

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new HttpError('头像文件为空', 400);
  if (buffer.length > MAX_AVATAR_BYTES) throw new HttpError('头像不能超过 512KB', 400);
  if (!isSupportedImageBuffer(buffer, meta.ext)) throw new HttpError('头像文件内容与图片格式不匹配', 400);

  return { buffer, ext: meta.ext };
}

export function isSupportedImageBuffer(buffer: Buffer, ext: string) {
  if (ext === 'jpg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === 'png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);
  }
  if (ext === 'webp') {
    return buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

export async function saveAvatarFromDataUrl(userId: string, dataUrl: string) {
  const { buffer, ext } = parseDataUrl(dataUrl);
  try {
    await fs.mkdir(avatarRoot(), { recursive: true });
  } catch (error) {
    if (isPermissionError(error)) throw new HttpError(permissionMessage('保存'), 500);
    throw error;
  }

  const filename = `${userId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const targetPath = path.join(avatarRoot(), filename);
  try {
    await fs.writeFile(targetPath, buffer, { flag: 'wx' });
  } catch (error) {
    if (isPermissionError(error)) throw new HttpError(permissionMessage('保存'), 500);
    throw error;
  }
  return publicAvatarPath(filename);
}

export async function removeLocalAvatarIfOwned(userId: string, avatarUrl?: string | null) {
  if (!avatarUrl) return;
  const prefix = `/uploads/avatars/${userId}-`;
  if (!avatarUrl.startsWith(prefix)) return;

  const filename = path.basename(avatarUrl);
  const targetPath = path.join(avatarRoot(), filename);

  try {
    await fs.unlink(targetPath);
  } catch {
    // 文件不存在不影响业务
  }
}

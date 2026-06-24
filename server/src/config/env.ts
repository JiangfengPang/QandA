import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const bootstrapNodeEnv = process.env.NODE_ENV || 'development';

function loadEnvFile(fileName: string, override = false) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

/*
 * 环境配置分流规则：
 * - development：只读取 server/.env.development 和 server/.env.local，不读取 server/.env，避免本地测试被生产域名、上传目录、Cookie 策略污染。
 * - production：优先读取 server/.env.production，然后读取 server/.env；公网部署仍兼容现有 server/.env。
 */
if (bootstrapNodeEnv === 'production') {
  loadEnvFile('.env.production', false);
  loadEnvFile('.env', false);
} else if (bootstrapNodeEnv === 'test') {
  loadEnvFile('.env.test', false);
  loadEnvFile('.env.local', true);
} else {
  loadEnvFile('.env.development', false);
  loadEnvFile('.env.local', true);
}

const isProduction = process.env.NODE_ENV === 'production';

function parseBool(value: string | undefined, fallback: boolean) {
  if (typeof value === 'undefined' || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const ipHttpMode = parseBool(process.env.IP_HTTP_MODE, false);
const cookieSecure = ipHttpMode ? false : parseBool(process.env.COOKIE_SECURE, isProduction);
const cookieSameSiteRaw = String(process.env.COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
const cookieSameSite = (['lax', 'strict', 'none'].includes(cookieSameSiteRaw) ? cookieSameSiteRaw : 'lax') as 'lax' | 'strict' | 'none';

if (cookieSameSite === 'none' && !cookieSecure) {
  console.warn('COOKIE_SAME_SITE=none 必须配合 COOKIE_SECURE=true；当前已自动回退为 lax，避免浏览器拒收登录 Cookie。');
}

function required(name: string, fallback = '') {
  const value = process.env[name] || fallback;
  const looksLikePlaceholder = /请填写|你的|your_|change[_-]?me/i.test(value);
  if (isProduction && (!value || looksLikePlaceholder)) {
    throw new Error(`生产环境缺少必要环境变量：${name}`);
  }
  return value;
}

function parseOrigins(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const jwtSecret = required('JWT_SECRET', isProduction ? '' : 'qanda_dev_secret_change_me');
if (isProduction && Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('生产环境 JWT_SECRET 至少需要 32 字节');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  jwtSecret,
  corsOrigin: parseOrigins(required(
    'CORS_ORIGIN',
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:5175,http://localhost:5175'
  )),
  databaseUrl: required('DATABASE_URL', isProduction ? '' : 'mysql://root:root@127.0.0.1:3306/qanda'),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSecure,
  cookieSameSite: cookieSameSite === 'none' && !cookieSecure ? 'lax' : cookieSameSite,
  trustProxy: String(process.env.TRUST_PROXY || (isProduction ? 'true' : 'false')).toLowerCase() === 'true',
  ipHttpMode,
  adminUsername: required('ADMIN_USERNAME', isProduction ? '' : 'tim_admin'),
  adminPassword: required('ADMIN_PASSWORD', isProduction ? '' : 'Dev_Admin_2026!ChangeMe'),
  adminEmail: process.env.ADMIN_EMAIL || '',
  smtpHost: process.env.SMTP_HOST || 'smtp.qq.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
  smtpUser: required('SMTP_USER', ''),
  smtpPass: required('SMTP_PASS', ''),
  smtpFrom: required('SMTP_FROM', process.env.SMTP_USER || ''),
  appName: process.env.APP_NAME || 'QandA 刷题系统',
  uploadDir: process.env.UPLOAD_DIR || 'uploads'
};

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

function parseIntRange(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
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
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  practiceAnswerQueueEnabled: parseBool(process.env.PRACTICE_ANSWER_QUEUE_ENABLED, true),
  practiceAnswerQueueBatchSize: parseIntRange(process.env.PRACTICE_ANSWER_QUEUE_BATCH_SIZE, 25, 1, 100),
  practiceAnswerQueueConcurrency: parseIntRange(process.env.PRACTICE_ANSWER_QUEUE_CONCURRENCY, 1, 1, 10),
  practiceAnswerQueuePollMs: parseIntRange(process.env.PRACTICE_ANSWER_QUEUE_POLL_MS, 1000, 200, 30000),
  practiceAnswerQueueMaxAttempts: parseIntRange(process.env.PRACTICE_ANSWER_QUEUE_MAX_ATTEMPTS, 8, 1, 50),
  practiceReviewSummaryCacheSeconds: parseIntRange(process.env.PRACTICE_REVIEW_SUMMARY_CACHE_SECONDS, 10, 0, 60),
  presenceHeartbeatIntervalMs: parseIntRange(process.env.PRESENCE_HEARTBEAT_INTERVAL_MS, 120000, 30000, 600000),
  presenceOnlineWindowSeconds: parseIntRange(process.env.PRESENCE_ONLINE_WINDOW_SECONDS, 300, 60, 1800),
  presenceMinWriteIntervalSeconds: parseIntRange(process.env.PRESENCE_MIN_WRITE_INTERVAL_SECONDS, 60, 0, 600),
  presenceCountCacheSeconds: parseIntRange(process.env.PRESENCE_COUNT_CACHE_SECONDS, 15, 0, 120)
};

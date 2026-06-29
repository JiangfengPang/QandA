import express from 'express';
import path from 'node:path';
import cors from 'cors';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import publicRouter from './routes/public.js';
import practiceRouter from './routes/practice.js';
import presenceRouter from './routes/presence.js';
import adminRouter from './routes/admin.js';
import { errorHandler, notFound } from './middleware/error.js';

function isIpv4Host(hostname: string) {
  const parts = hostname.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isAllowedCorsOrigin(origin: string, requestHostname: string) {
  if (env.corsOrigin.includes(origin)) return true;

  if (env.ipHttpMode) {
    try {
      const url = new URL(origin);
      const allowedPort = ['', '80', '8080', '5173', '5174', '5175'].includes(url.port);
      const allowedHost = url.hostname === requestHostname
        && (isIpv4Host(url.hostname) || url.hostname === 'localhost');
      return url.protocol === 'http:' && allowedHost && allowedPort;
    } catch {
      return false;
    }
  }

  return false;
}

export function createApp() {
  const app = express();

  if (env.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  app.use((req, res, next) => {
    const origin = String(req.headers.origin || '');
    if (origin && !isAllowedCorsOrigin(origin, req.hostname)) {
      return res.status(403).json({ code: 403, message: 'CORS origin not allowed', data: null });
    }
    return next();
  });
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '5mb' }));

  app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir), {
    fallthrough: false,
    maxAge: env.isProduction ? '7d' : 0,
    immutable: env.isProduction
  }));

  app.use('/api/auth', authRouter);
  app.use('/api/presence', presenceRouter);
  app.use('/api', publicRouter);
  app.use('/api/practice', practiceRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;

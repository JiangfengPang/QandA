import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

type MailSendResult = {
  sent: boolean;
  devCode?: string;
};

type SmtpErrorLike = {
  code?: unknown;
  command?: unknown;
  response?: unknown;
  responseCode?: unknown;
  message?: unknown;
};

function smtpReady() {
  const pass = String(env.smtpPass || '').trim();
  return Boolean(
    env.smtpHost &&
    env.smtpUser &&
    env.smtpFrom &&
    pass &&
    !pass.includes('请在本地填写') &&
    !pass.includes('authorization_code') &&
    !pass.includes('your_smtp')
  );
}

function truncate(value: string, max = 300) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function redactSecrets(value: string) {
  const secrets = [
    String(env.smtpPass || ''),
    Buffer.from(String(env.smtpPass || '')).toString('base64')
  ].filter((item) => item.length >= 4);

  return secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value);
}

function formatSmtpError(error: unknown) {
  const smtpError = error as SmtpErrorLike;
  const parts = [
    smtpError.responseCode ? `responseCode=${smtpError.responseCode}` : '',
    smtpError.code ? `code=${smtpError.code}` : '',
    smtpError.command ? `command=${smtpError.command}` : '',
    smtpError.response ? `response=${smtpError.response}` : '',
    smtpError.message ? `message=${smtpError.message}` : ''
  ].filter(Boolean);

  return truncate(redactSecrets(parts.join('; ') || String(error)));
}

function createTransporter() {
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    requireTLS: !env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      servername: env.smtpHost
    }
  });
}

async function sendViaSmtp(input: SendMailInput) {
  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from: { name: env.appName, address: env.smtpFrom },
      to: input.to,
      subject: input.subject,
      text: input.text,
      envelope: {
        from: env.smtpFrom,
        to: [input.to]
      }
    });
  } catch (error) {
    console.error(`[${env.appName}] 邮件发送失败：${formatSmtpError(error)}`);
    throw new HttpError('邮件服务暂时不可用，请稍后再试', 502, 'SMTP_SEND_FAILED');
  } finally {
    transporter.close();
  }
}

export async function sendPasswordResetCode(to: string, code: string): Promise<MailSendResult> {
  const subject = `${env.appName} 找回密码验证码`;
  const text = [
    `你的 ${env.appName} 找回密码验证码是：${code}`,
    '',
    '验证码 10 分钟内有效。',
    '当前系统仅支持 QQ 邮箱接收找回密码验证码。',
    '如果不是你本人操作，请忽略这封邮件。'
  ].join('\n');

  if (!smtpReady()) {
    if (env.isProduction) throw new HttpError('邮件服务未正确配置', 503);
    console.info(`[${env.appName}] 找回密码验证码：${code}，收件邮箱：${to}`);
    return { sent: false, devCode: code };
  }

  await sendViaSmtp({ to, subject, text });
  return { sent: true, devCode: undefined };
}

export async function sendEmailVerificationCode(to: string, code: string, scene = '邮箱验证'): Promise<MailSendResult> {
  const subject = `${env.appName} ${scene}验证码`;
  const text = [
    `你的 ${env.appName} ${scene}验证码是：${code}`,
    '',
    '验证码 10 分钟内有效。',
    '当前系统仅支持 QQ 邮箱接收验证码。',
    '如果不是你本人操作，请忽略这封邮件。'
  ].join('\n');

  if (!smtpReady()) {
    if (env.isProduction) throw new HttpError('邮件服务未正确配置', 503);
    console.info(`[${env.appName}] ${scene}验证码：${code}，收件邮箱：${to}`);
    return { sent: false, devCode: code };
  }

  await sendViaSmtp({ to, subject, text });
  return { sent: true, devCode: undefined };
}

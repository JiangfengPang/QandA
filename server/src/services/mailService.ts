import net from 'node:net';
import tls from 'node:tls';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
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

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function escapeAddress(value: string) {
  return value.replace(/[\r\n<>]/g, '').trim();
}

function createClient() {
  return env.smtpSecure
    ? tls.connect({ host: env.smtpHost, port: env.smtpPort, servername: env.smtpHost })
    : net.connect({ host: env.smtpHost, port: env.smtpPort });
}

function readResponse(socket: net.Socket | tls.TLSSocket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP 响应超时'));
    }, 10000);

    function cleanup() {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onData(chunk: Buffer) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(buffer);
      }
    }

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function sendCommand(socket: net.Socket | tls.TLSSocket, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(`SMTP 命令失败：${command}; ${response.trim()}`);
  }
  return response;
}

async function sendViaSmtp(input: SendMailInput) {
  let socket = createClient();
  await readResponse(socket);

  await sendCommand(socket, `EHLO ${env.smtpHost}`, [250]);

  if (!env.smtpSecure) {
    await sendCommand(socket, 'STARTTLS', [220]);
    socket = tls.connect({ socket, servername: env.smtpHost });
    await sendCommand(socket, `EHLO ${env.smtpHost}`, [250]);
  }

  await sendCommand(socket, 'AUTH LOGIN', [334]);
  await sendCommand(socket, Buffer.from(env.smtpUser).toString('base64'), [334]);
  await sendCommand(socket, Buffer.from(env.smtpPass).toString('base64'), [235]);
  await sendCommand(socket, `MAIL FROM:<${escapeAddress(env.smtpFrom)}>`, [250]);
  await sendCommand(socket, `RCPT TO:<${escapeAddress(input.to)}>`, [250, 251]);
  await sendCommand(socket, 'DATA', [354]);

  const from = `${encodeHeader(env.appName)} <${escapeAddress(env.smtpFrom)}>`;
  const message = [
    `From: ${from}`,
    `To: <${escapeAddress(input.to)}>`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    '.',
    ''
  ].join('\r\n');

  socket.write(message);
  await readResponse(socket);
  await sendCommand(socket, 'QUIT', [221]);
  socket.end();
}

export async function sendPasswordResetCode(to: string, code: string) {
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


export async function sendEmailVerificationCode(to: string, code: string, scene = '邮箱验证') {
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

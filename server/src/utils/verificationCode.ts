import crypto from 'node:crypto';

export function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

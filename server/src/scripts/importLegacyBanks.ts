import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db/prisma.js';
import { importLegacyDirectory } from '../services/importService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyDir = path.resolve(__dirname, '../../..', 'question-banks');

async function main() {
  const result = await importLegacyDirectory(legacyDir);
  console.log('旧题库导入完成：', result);
}

main().finally(async () => prisma.$disconnect());

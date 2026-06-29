export const NICKNAME_MIN_CHARS = 2;
export const NICKNAME_MAX_CHARS = 16;

const forbiddenNicknameTerms = [
  '傻逼',
  '傻屄',
  '傻比',
  '傻币',
  '傻b',
  '沙逼',
  '沙比',
  '沙b',
  '煞笔',
  '煞逼',
  '煞b',
  '尼玛',
  '你妈',
  '你麻痹',
  '你麻痺',
  '草泥马',
  '草尼马',
  '妈的',
  '妈逼',
  '妈比',
  '妈卖批',
  '妈卖比',
  '去死',
  '死全家',
  '贱人',
  '贱货',
  '狗屎',
  '狗娘养',
  '杂种',
  '脑残',
  '弱智',
  '智障',
  '废物',
  '垃圾',
  'nmsl',
  'c你m',
  'c你妈',
  'caonima',
  'nimabi',
  'shabi',
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'asshole',
  'motherfucker',
  'bastard'
];

const reservedNicknameTerms = [
  'admin',
  'administrator',
  'root',
  'system',
  'qanda',
  '官方',
  '系统',
  '系統',
  '管理员',
  '管理員',
  '客服'
];

const forbiddenNicknamePatterns = [
  /[操草艹肏干叼屌](你|妳|他|她|它)?(妈|娘|爹|爸|祖宗|全家)/u,
  /(你|妳)(妈|娘|爹|爸)(逼|屄|批|币|比|b|死)/u,
  /(妈|娘)(逼|屄|批|币|比|b)/u,
  /死(全家|妈|娘|爹|爸)/u,
  /狗(日|杂种|娘养)/u
];

const shortAbusePatterns = [
  /(^|[^a-z0-9])s[\s._-]*b([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])c[\s._-]*n[\s._-]*m([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])c[\s._-]*(你|n)[\s._-]*(妈|m)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])t[\s._-]*m[\s._-]*d([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])w[\s._-]*d[\s._-]*n[\s._-]*m[\s._-]*d([^a-z0-9]|$)/i
];

const nicknamePrefixes = ['学习者', '答题者', '同学', '练习生', '探索者'];

export function normalizeNickname(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeForModeration(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[艸艹]/g, '草')
    .replace(/肏/g, '操')
    .replace(/妳/g, '你')
    .replace(/[@]/g, 'a')
    .replace(/\$/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
}

function compactForModeration(value: string) {
  return normalizeForModeration(value).replace(/[^\p{L}\p{N}]/gu, '');
}

function countCharacters(value: string) {
  return Array.from(value).length;
}

function effectiveCharacters(value: string) {
  return value.match(/[\p{L}\p{N}]/gu) || [];
}

function isRepeatedNickname(value: string) {
  const compact = compactForModeration(value);
  if (compact.length < 4) return false;
  return new Set(Array.from(compact)).size === 1;
}

function hasReservedNickname(value: string) {
  const compact = compactForModeration(value);
  return reservedNicknameTerms.some((term) => compact.includes(term));
}

function hasAbusiveNickname(value: string) {
  const normalized = normalizeForModeration(value);
  if (shortAbusePatterns.some((pattern) => pattern.test(normalized))) return true;

  const compact = compactForModeration(value);
  return (
    forbiddenNicknameTerms.some((term) => compact.includes(term)) ||
    forbiddenNicknamePatterns.some((pattern) => pattern.test(compact))
  );
}

export function nicknamePolicyMessage(value: unknown, emptyMessage = '请输入昵称') {
  const nickname = normalizeNickname(value);
  if (!nickname) return emptyMessage;
  if (countCharacters(nickname) > NICKNAME_MAX_CHARS) return `昵称不能超过 ${NICKNAME_MAX_CHARS} 个字符`;

  const effective = effectiveCharacters(nickname);
  if (!effective.length) return '昵称不能只包含标点、空格或表情';
  if (effective.length < NICKNAME_MIN_CHARS) return `昵称至少需要 ${NICKNAME_MIN_CHARS} 个有效字符`;
  if (isRepeatedNickname(nickname)) return '昵称不能使用连续重复字符';
  if (hasReservedNickname(nickname)) return '昵称包含保留词，请换一个昵称';
  if (hasAbusiveNickname(nickname)) return '昵称包含不文明用语，请换一个昵称';
  return '';
}

export function createRandomNickname() {
  const prefix = nicknamePrefixes[Math.floor(Math.random() * nicknamePrefixes.length)] || '学习者';
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${suffix}`;
}

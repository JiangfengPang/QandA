import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeCode(value: string) {
  try {
    return btoa(unescape(encodeURIComponent(value || '')));
  } catch {
    return '';
  }
}

export function decodeMarkdownCode(value: string) {
  try {
    return decodeURIComponent(escape(atob(value || '')));
  } catch {
    return '';
  }
}

function normalizeLang(info: string) {
  return String(info || '').trim().split(/\s+/)[0].toLowerCase() || 'text';
}

function highlightCode(code: string, lang: string) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

function addLineNumbers(highlightedHtml: string) {
  const text = String(highlightedHtml || '').replace(/\n$/g, '');
  const lines = text ? text.split('\n') : [''];
  return `<span class="qx-code-lines">${lines
    .map((line) => `<span class="qx-code-line"><span class="qx-code-line-no"></span><span class="qx-code-line-content">${line || '&nbsp;'}</span></span>`)
    .join('')}</span>`;
}

function renderFence(code: string, info: string) {
  const lang = normalizeLang(info);
  const safeLang = escapeHtml(lang || 'text');
  const highlighted = highlightCode(code, lang);
  const encodedCode = encodeCode(code);
  return `
<div class="qx-code-card qx-md-code-card">
  <div class="qx-code-toolbar">
    <span class="qx-code-lang">${safeLang}</span>
    <button class="qx-code-copy-btn" type="button" data-md-copy="code" data-code="${encodedCode}">复制代码</button>
  </div>
  <pre class="qx-code-pre"><code class="hljs language-${safeLang}">${addLineNumbers(highlighted)}</code></pre>
</div>`;
}

function renderMath(content: string, displayMode: boolean) {
  const source = String(content || '').trim();
  if (!source) return '';
  try {
    return katex.renderToString(source, {
      throwOnError: false,
      displayMode,
      output: 'html',
      strict: false,
      trust: false
    });
  } catch {
    return `<code class="qx-math-error">${escapeHtml(source)}</code>`;
  }
}

function isEscaped(src: string, pos: number) {
  let count = 0;
  for (let i = pos - 1; i >= 0 && src[i] === '\\'; i -= 1) count += 1;
  return count % 2 === 1;
}

function mathInline(state: any, silent: boolean) {
  const start = state.pos;
  const marker = state.src[start];

  if (marker === '$') {
    if (state.src[start + 1] === '$') return false;
    if (isEscaped(state.src, start)) return false;

    let end = start + 1;
    while ((end = state.src.indexOf('$', end)) !== -1) {
      if (!isEscaped(state.src, end)) break;
      end += 1;
    }
    if (end === -1) return false;

    const content = state.src.slice(start + 1, end);
    if (!content.trim()) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = content;
      token.markup = '$';
    }
    state.pos = end + 1;
    return true;
  }

  if (marker === '\\' && state.src[start + 1] === '(') {
    const end = state.src.indexOf('\\)', start + 2);
    if (end < 0) return false;
    const content = state.src.slice(start + 2, end);
    if (!content.trim()) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = content;
      token.markup = '\\(\\)';
    }
    state.pos = end + 2;
    return true;
  }

  return false;
}

function mathBlockDollar(state: any, startLine: number, endLine: number, silent: boolean) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  const src = state.src;

  if (src.slice(pos, pos + 2) !== '$$') return false;
  if (silent) return true;

  let content = src.slice(pos + 2, max);
  let nextLine = startLine;
  const firstTrimmed = content.trim();

  if (firstTrimmed.endsWith('$$') && firstTrimmed.length > 2) {
    content = firstTrimmed.slice(0, -2);
  } else {
    const lines: string[] = [];
    if (content) lines.push(content);
    let found = false;
    for (nextLine = startLine + 1; nextLine < endLine; nextLine += 1) {
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      const line = src.slice(pos, max);
      const closeIndex = line.indexOf('$$');
      if (closeIndex >= 0) {
        lines.push(line.slice(0, closeIndex));
        found = true;
        break;
      }
      lines.push(line);
    }
    if (!found) return false;
    content = lines.join('\n');
  }

  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, nextLine + 1];
  token.markup = '$$';
  state.line = nextLine + 1;
  return true;
}

function mathBlockBracket(state: any, startLine: number, endLine: number, silent: boolean) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  const src = state.src;

  if (src.slice(pos, pos + 2) !== '\\[') return false;
  if (silent) return true;

  let content = src.slice(pos + 2, max);
  let nextLine = startLine;
  const firstClose = content.indexOf('\\]');

  if (firstClose >= 0) {
    content = content.slice(0, firstClose);
  } else {
    const lines: string[] = [];
    if (content) lines.push(content);
    let found = false;
    for (nextLine = startLine + 1; nextLine < endLine; nextLine += 1) {
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      const line = src.slice(pos, max);
      const closeIndex = line.indexOf('\\]');
      if (closeIndex >= 0) {
        lines.push(line.slice(0, closeIndex));
        found = true;
        break;
      }
      lines.push(line);
    }
    if (!found) return false;
    content = lines.join('\n');
  }

  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, nextLine + 1];
  token.markup = '\\[\\]';
  state.line = nextLine + 1;
  return true;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false
});

md.inline.ruler.before('escape', 'math_inline', mathInline);
md.block.ruler.before('fence', 'math_block_dollar', mathBlockDollar, {
  alt: ['paragraph', 'reference', 'blockquote', 'list']
});
md.block.ruler.before('fence', 'math_block_bracket', mathBlockBracket, {
  alt: ['paragraph', 'reference', 'blockquote', 'list']
});

md.renderer.rules.math_inline = (tokens: any, idx: number) => renderMath(tokens[idx].content, false);
md.renderer.rules.math_block = (tokens: any, idx: number) => `<div class="qx-math-block">${renderMath(tokens[idx].content, true)}</div>`;

const defaultLinkOpen = md.renderer.rules.link_open || ((tokens: any, idx: number, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens: any, idx: number, options: any, env: any, self: any) => {
  const token = tokens[idx];
  const targetIndex = token.attrIndex('target');
  if (targetIndex < 0) token.attrPush(['target', '_blank']);
  else token.attrs![targetIndex][1] = '_blank';
  const relIndex = token.attrIndex('rel');
  if (relIndex < 0) token.attrPush(['rel', 'noopener noreferrer']);
  else token.attrs![relIndex][1] = 'noopener noreferrer';
  return defaultLinkOpen(tokens, idx, options, env, self);
};

md.renderer.rules.fence = (tokens: any, idx: number) => {
  const token = tokens[idx];
  return renderFence(token.content, token.info);
};

md.renderer.rules.code_block = (tokens: any, idx: number) => {
  const token = tokens[idx];
  return renderFence(token.content, 'text');
};

export function renderMarkdown(markdown: string) {
  const raw = String(markdown || '');
  if (!raw.trim()) return '';
  const html = md.render(raw);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['button'],
    ADD_ATTR: ['target', 'rel', 'data-md-copy', 'data-code', 'class', 'type', 'style', 'aria-hidden'],
    ALLOW_DATA_ATTR: true
  });
}

export async function copyTextToClipboard(text: string) {
  const value = String(text || '');
  if (!value) return false;

  if (copyWithTextarea(value)) return true;
  if (copyWithEditableNode(value)) return true;

  if (canUseAsyncClipboard()) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Mobile browsers can expose the API but reject it in WebView or HTTP contexts.
    }
  }

  return false;
}

function canUseAsyncClipboard() {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.clipboard)
    && typeof navigator.clipboard.writeText === 'function'
    && (typeof window === 'undefined' || window.isSecureContext);
}

function copyWithTextarea(text: string) {
  if (!canUseExecCommand()) return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  applyCopyNodeStyle(textarea);

  return runExecCopy(text, textarea, () => {
    focusWithoutScroll(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  });
}

function copyWithEditableNode(text: string) {
  if (!canUseExecCommand()) return false;

  const node = document.createElement('pre');
  node.textContent = text;
  node.contentEditable = 'true';
  node.setAttribute('aria-hidden', 'true');
  applyCopyNodeStyle(node);
  node.style.whiteSpace = 'pre-wrap';
  node.style.userSelect = 'text';
  node.style.webkitUserSelect = 'text';

  return runExecCopy(text, node, (selection) => {
    if (!selection) return;
    focusWithoutScroll(node);
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function canUseExecCommand() {
  return typeof document !== 'undefined'
    && Boolean(document.body)
    && typeof document.execCommand === 'function';
}

function applyCopyNodeStyle(element: HTMLElement) {
  Object.assign(element.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '2px',
    height: '2px',
    margin: '0',
    padding: '0',
    border: '0',
    opacity: '0.01',
    color: 'transparent',
    background: 'transparent',
    zIndex: '2147483647',
    overflow: 'hidden',
    fontSize: '16px'
  });
}

function runExecCopy(text: string, element: HTMLElement, selectElement: (selection: Selection | null) => void) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  const ranges = snapshotSelection(selection);
  let copied = false;

  const handleCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    copied = true;
  };

  try {
    document.body.appendChild(element);
    document.addEventListener('copy', handleCopy);
    selectElement(selection);
    copied = document.execCommand('copy') || copied;
  } catch {
    copied = false;
  } finally {
    document.removeEventListener('copy', handleCopy);
    element.remove();
    restoreSelection(selection, ranges);
    if (activeElement) focusWithoutScroll(activeElement);
  }

  return copied;
}

function snapshotSelection(selection: Selection | null) {
  const ranges: Range[] = [];
  if (!selection) return ranges;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    ranges.push(selection.getRangeAt(index).cloneRange());
  }
  return ranges;
}

function restoreSelection(selection: Selection | null, ranges: Range[]) {
  if (!selection) return;
  selection.removeAllRanges();
  ranges.forEach((range) => selection.addRange(range));
}

function focusWithoutScroll(element: HTMLElement) {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

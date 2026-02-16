(function (globalScope) {
  'use strict';

  if (typeof document === 'undefined' || typeof customElements === 'undefined') {
    return;
  }

  const SCRIPT_OPTIONS_DEFAULT = [
    { src: 'qhtml.js', checked: true, readOnly: true },
    { src: 'q-components.qhtml', checked: true, readOnly: false, kind: 'q-import' },
    { src: 'w3-tags.js', checked: true, readOnly: false },
    { src: 'bs-tags.js', checked: true, readOnly: false },
    { src: 'tools/qhtml-tools.js', checked: true, readOnly: false },
    { src: 'q-editor.js', checked: true, readOnly: false },
    { src: 'tech-tags.js', checked: false, readOnly: false },
    { src: 'lcars-tags.js', checked: false, readOnly: true }
  ];

  const SCRIPT_DEPENDENCIES = Object.freeze({
    'w3-tags.js': Object.freeze({ styles: ['w3.css'], scripts: [] }),
    'bs-tags.js': Object.freeze({ styles: ['bs.css'], scripts: ['bs.js'] })
  });

  const HTML_VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const HTML_PRESERVE_TEXT_TAGS = new Set(['pre', 'textarea', 'script', 'style']);

  const QHTML_VENDOR_PREFIXES = ['w3-', 'bs-', 'uk-', 'mdc-'];
  const QHTML_KEYWORDS = new Set(['html', 'component', 'q-component', 'slot', 'into', 'q-import', 'bsl']);

  function formatHTMLFallback(html) {
    if (!html) return '';
    const normalized = String(html).replace(/>\s+</g, '><').trim();
    const lines = normalized.replace(/></g, '>\n<').split('\n');
    let indent = 0;
    const pad = (n) => '  '.repeat(n);
    const out = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const isClosing = /^<\/[A-Za-z]/.test(line);
      const isOpening = /^<[A-Za-z]/.test(line);
      const isSelfClosing = /\/>$/.test(line);
      const tagNameMatch = isOpening ? line.match(/^<([A-Za-z0-9:_-]+)/) : null;
      const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';

      if (isClosing) indent = Math.max(0, indent - 1);
      out.push(pad(indent) + line);
      if (isOpening && !isClosing && !isSelfClosing && tagName && !HTML_VOID_TAGS.has(tagName)) {
        indent += 1;
      }
    }
    return out.join('\n');
  }

  function stripQhtmlQuotedSections(line) {
    let result = '';
    let quote = '';
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === '\'' || ch === '`') {
        quote = ch;
        continue;
      }
      result += ch;
    }
    return result;
  }

  function countLeadingIndentChars(line) {
    let i = 0;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
    return i;
  }

  function lineOffsets(lines) {
    const starts = [];
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      starts.push(pos);
      pos += lines[i].length;
      if (i < lines.length - 1) pos += 1;
    }
    return starts;
  }

  function lineIndexAtOffset(starts, lines, offset) {
    let idx = 0;
    const totalLength = lines.join('\n').length;
    const clamped = Math.max(0, Math.min(offset, totalLength));
    while (idx + 1 < starts.length && starts[idx + 1] <= clamped) idx += 1;
    return idx;
  }

  function formatQhtmlForEditing(source, cursorStart, cursorEnd, protectRadius) {
    const raw = String(source || '').replace(/\r\n/g, '\n');
    if (!raw) {
      return {
        text: '',
        cursorStart: 0,
        cursorEnd: 0
      };
    }

    const lines = raw.split('\n');
    const oldStarts = lineOffsets(lines);
    const protect = new Set();

    const safeStart = typeof cursorStart === 'number' ? cursorStart : null;
    const safeEnd = typeof cursorEnd === 'number' ? cursorEnd : safeStart;
    const radius = typeof protectRadius === 'number' ? Math.max(0, protectRadius) : 0;

    if (safeStart !== null && safeEnd !== null && lines.length) {
      const startLine = lineIndexAtOffset(oldStarts, lines, safeStart);
      const endLine = lineIndexAtOffset(oldStarts, lines, safeEnd);
      const lo = Math.max(0, Math.min(startLine, endLine) - radius);
      const hi = Math.min(lines.length - 1, Math.max(startLine, endLine) + radius);
      for (let i = lo; i <= hi; i++) protect.add(i);
    }

    const newLines = [];
    const oldLeading = [];
    const newLeading = [];
    let depth = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      const originalLine = lines[idx];
      const trimmed = originalLine.trim();
      const oldLead = countLeadingIndentChars(originalLine);
      oldLeading[idx] = oldLead;

      if (!trimmed) {
        newLines.push('');
        newLeading[idx] = 0;
        continue;
      }

      let leadingClosers = 0;
      while (leadingClosers < trimmed.length && trimmed[leadingClosers] === '}') {
        leadingClosers += 1;
      }
      const targetDepth = Math.max(0, depth - leadingClosers);
      const desiredIndent = '  '.repeat(targetDepth);

      const content = originalLine.slice(oldLead);
      const keepAsTyped = protect.has(idx);
      const formattedLine = keepAsTyped ? originalLine : (desiredIndent + content);

      newLines.push(formattedLine);
      newLeading[idx] = keepAsTyped ? oldLead : desiredIndent.length;

      const analysisLine = stripQhtmlQuotedSections(trimmed).replace(/\/\/.*$/, '');
      const opens = (analysisLine.match(/\{/g) || []).length;
      const closes = (analysisLine.match(/\}/g) || []).length;
      depth = Math.max(0, depth + opens - closes);
    }

    const text = newLines.join('\n');
    const newStarts = lineOffsets(newLines);

    const mapOffset = (offset) => {
      if (typeof offset !== 'number') return 0;
      const oldTotal = raw.length;
      const clamped = Math.max(0, Math.min(offset, oldTotal));
      const lineIdx = lineIndexAtOffset(oldStarts, lines, clamped);
      const oldLineStart = oldStarts[lineIdx];
      const newLineStart = newStarts[lineIdx];
      const oldLine = lines[lineIdx] || '';
      const newLine = newLines[lineIdx] || '';
      const oldIndent = oldLeading[lineIdx] || 0;
      const newIndent = newLeading[lineIdx] || 0;
      const oldColumn = clamped - oldLineStart;

      let newColumn;
      if (oldColumn <= oldIndent) {
        const deltaFromCodeStart = oldColumn - oldIndent;
        newColumn = Math.max(0, newIndent + deltaFromCodeStart);
      } else {
        newColumn = oldColumn + (newIndent - oldIndent);
      }

      newColumn = Math.max(0, Math.min(newColumn, newLine.length));
      return Math.max(0, Math.min(newLineStart + newColumn, text.length));
    };

    return {
      text,
      cursorStart: mapOffset(safeStart),
      cursorEnd: mapOffset(safeEnd)
    };
  }

  function formatQhtml(source) {
    return formatQhtmlForEditing(source, null, null, 0).text.trim();
  }

  function formatHTML(html) {
    const source = String(html || '').trim();
    if (!source) return '';

    try {
      const template = document.createElement('template');
      template.innerHTML = source;

      const lines = [];
      const pad = (n) => '  '.repeat(Math.max(0, n));
      const pushLine = (depth, text) => {
        if (!text) return;
        lines.push(pad(depth) + text);
      };

      const formatAttributes = (element) => {
        const attrs = Array.from(element.attributes || []);
        if (!attrs.length) return '';
        return ' ' + attrs.map((attr) => {
          const safeValue = String(attr.value || '').replace(/"/g, '&quot;');
          return attr.name + '="' + safeValue + '"';
        }).join(' ');
      };

      const walk = (node, depth, parentTag) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName.toLowerCase();
          const attrs = formatAttributes(node);

          if (HTML_VOID_TAGS.has(tag)) {
            pushLine(depth, '<' + tag + attrs + '>');
            return;
          }

          const allChildren = Array.from(node.childNodes || []);
          const children = allChildren.filter((child) => {
            if (child.nodeType !== Node.TEXT_NODE) return true;
            return !!String(child.nodeValue || '').replace(/\s+/g, ' ').trim();
          });

          if (!children.length) {
            pushLine(depth, '<' + tag + attrs + '></' + tag + '>');
            return;
          }

          const inlineTextOnly = children.length === 1
            && children[0].nodeType === Node.TEXT_NODE
            && !HTML_PRESERVE_TEXT_TAGS.has(tag);

          if (inlineTextOnly) {
            const text = String(children[0].nodeValue || '').replace(/\s+/g, ' ').trim();
            pushLine(depth, '<' + tag + attrs + '>' + text + '</' + tag + '>');
            return;
          }

          pushLine(depth, '<' + tag + attrs + '>');
          children.forEach((child) => walk(child, depth + 1, tag));
          pushLine(depth, '</' + tag + '>');
          return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const rawText = String(node.nodeValue || '');
          if (HTML_PRESERVE_TEXT_TAGS.has(parentTag || '')) {
            rawText.replace(/\r\n/g, '\n').split('\n').forEach((textLine) => {
              if (textLine.length) pushLine(depth, textLine);
            });
          } else {
            const collapsed = rawText.replace(/\s+/g, ' ').trim();
            if (collapsed) pushLine(depth, collapsed);
          }
          return;
        }

        if (node.nodeType === Node.COMMENT_NODE) {
          const comment = String(node.nodeValue || '').trim();
          if (comment) pushLine(depth, '<!-- ' + comment + ' -->');
        }
      };

      Array.from(template.content.childNodes || []).forEach((node) => walk(node, 0, ''));
      return lines.join('\n').trim();
    } catch (err) {
      return formatHTMLFallback(source);
    }
  }

  function escapeHighlightHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderHighlightTokens(tokens) {
    let out = '';
    for (const token of tokens) {
      const className = token.type ? 'tok-' + token.type : 'tok-text';
      if (token.raw === true) {
        out += '<span class="' + className + '">' + token.value + '</span>';
      } else {
        out += '<span class="' + className + '">' + escapeHighlightHtml(token.value) + '</span>';
      }
    }
    return out;
  }

  function tokenizeHtmlForHighlight(input) {
    const source = String(input || '');
    const tokens = [];
    let index = 0;
    const len = source.length;

    const push = (type, value) => {
      if (value) tokens.push({ type, value });
    };

    while (index < len) {
      if (source.startsWith('<!--', index)) {
        const end = source.indexOf('-->', index + 4);
        const stop = end === -1 ? len : end + 3;
        push('comment', source.slice(index, stop));
        index = stop;
        continue;
      }

      if (source[index] === '<') {
        if (source.startsWith('<!', index) && !source.startsWith('<!--', index)) {
          const end = source.indexOf('>', index + 2);
          const stop = end === -1 ? len : end + 1;
          push('doctype', source.slice(index, stop));
          index = stop;
          continue;
        }

        const isClosing = source.startsWith('</', index);
        push('angle', isClosing ? '</' : '<');
        index += isClosing ? 2 : 1;

        const nameMatch = /^[A-Za-z][A-Za-z0-9:_-]*/.exec(source.slice(index));
        if (!nameMatch) {
          push('text', source[index] || '');
          index += 1;
          continue;
        }
        push('tag', nameMatch[0]);
        index += nameMatch[0].length;

        while (index < len) {
          if (source.startsWith('/>', index)) {
            push('angle', '/>');
            index += 2;
            break;
          }
          if (source[index] === '>') {
            push('angle', '>');
            index += 1;
            break;
          }

          const wsMatch = /^[\s]+/.exec(source.slice(index));
          if (wsMatch) {
            push('text', wsMatch[0]);
            index += wsMatch[0].length;
            continue;
          }

          const attrMatch = /^[^\s/>=]+/.exec(source.slice(index));
          if (!attrMatch) {
            push('text', source[index]);
            index += 1;
            continue;
          }
          push('attr', attrMatch[0]);
          index += attrMatch[0].length;

          const postNameWs = /^[\s]+/.exec(source.slice(index));
          if (postNameWs) {
            push('text', postNameWs[0]);
            index += postNameWs[0].length;
          }

          if (source[index] === '=') {
            push('eq', '=');
            index += 1;

            const postEqWs = /^[\s]+/.exec(source.slice(index));
            if (postEqWs) {
              push('text', postEqWs[0]);
              index += postEqWs[0].length;
            }

            if (source[index] === '"' || source[index] === '\'') {
              const quote = source[index];
              let end = index + 1;
              while (end < len && source[end] !== quote) {
                if (source[end] === '\\' && end + 1 < len) end += 2;
                else end += 1;
              }
              end = end < len ? end + 1 : len;
              push('string', source.slice(index, end));
              index = end;
            } else {
              const unquoted = /^[^\s>]+/.exec(source.slice(index));
              if (unquoted) {
                push('string', unquoted[0]);
                index += unquoted[0].length;
              }
            }
          }
        }
        continue;
      }

      if (source[index] === '&') {
        const semi = source.indexOf(';', index + 1);
        if (semi !== -1) {
          push('entity', source.slice(index, semi + 1));
          index = semi + 1;
          continue;
        }
      }

      const nextTag = source.indexOf('<', index);
      const nextEntity = source.indexOf('&', index);
      let stop = len;
      if (nextTag !== -1) stop = Math.min(stop, nextTag);
      if (nextEntity !== -1) stop = Math.min(stop, nextEntity);
      if (stop === index) stop += 1;
      push('text', source.slice(index, stop));
      index = stop;
    }

    return tokens;
  }

  function highlightHtmlCode(input) {
    return renderHighlightTokens(tokenizeHtmlForHighlight(input));
  }

  function tokenizeQhtmlForHighlight(input) {
    const source = String(input || '');
    const tokens = [];
    let index = 0;
    let depth = 0;

    const push = (type, value, raw) => {
      if (!value) return;
      tokens.push({ type, value, raw: raw === true });
    };

    const readQuoted = (quote) => {
      const start = index;
      index += 1;
      while (index < source.length) {
        const ch = source[index];
        index += 1;
        if (ch === '\\' && index < source.length) {
          index += 1;
          continue;
        }
        if (ch === quote) break;
      }
      return source.slice(start, index);
    };

    while (index < source.length) {
      const ch = source[index];

      if (source.startsWith('//', index)) {
        const end = source.indexOf('\n', index + 2);
        const stop = end === -1 ? source.length : end;
        push('q-comment', source.slice(index, stop));
        index = stop;
        continue;
      }

      if (source.startsWith('/*', index)) {
        const end = source.indexOf('*/', index + 2);
        const stop = end === -1 ? source.length : end + 2;
        push('q-comment', source.slice(index, stop));
        index = stop;
        continue;
      }

      if (ch === '"' || ch === '\'' || ch === '`') {
        push('q-string', readQuoted(ch));
        continue;
      }

      if (/[0-9]/.test(ch)) {
        const match = /^[0-9][0-9._]*/.exec(source.slice(index));
        if (match) {
          push('q-number', match[0]);
          index += match[0].length;
          continue;
        }
      }

      if (ch === '{' || ch === '}') {
        depth += ch === '{' ? 1 : -1;
        depth = Math.max(depth, 0);
        push('q-brace', ch);
        index += 1;
        continue;
      }
      if (ch === ':') { push('q-colon', ch); index += 1; continue; }
      if (ch === ';') { push('q-semi', ch); index += 1; continue; }
      if (ch === ',') { push('q-comma', ch); index += 1; continue; }

      const wsMatch = /^[\s]+/.exec(source.slice(index));
      if (wsMatch) {
        push('q-value', wsMatch[0]);
        index += wsMatch[0].length;
        continue;
      }

      const identMatch = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(source.slice(index));
      if (identMatch) {
        const ident = identMatch[0];
        index += ident.length;

        let lookahead = index;
        while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;
        const next = source[lookahead] || '';

        if (ident === 'html' && next === '{') {
          push('q-kw', ident);
          if (lookahead > index) {
            push('q-value', source.slice(index, lookahead));
          }
          push('q-brace', '{');
          depth += 1;
          index = lookahead + 1;

          const innerStart = index;
          let innerDepth = 1;
          while (index < source.length && innerDepth > 0) {
            if (source[index] === '{') innerDepth += 1;
            else if (source[index] === '}') innerDepth -= 1;
            index += 1;
          }
          const innerEnd = innerDepth === 0 ? index - 1 : index;
          const innerHtml = source.slice(innerStart, innerEnd);
          if (innerHtml) {
            push('q-embedded', highlightHtmlCode(innerHtml), true);
          }
          if (innerDepth === 0) {
            push('q-brace', '}');
            depth = Math.max(0, depth - 1);
          }
          continue;
        }

        if (QHTML_KEYWORDS.has(ident)) {
          push('q-kw', ident);
        } else if (QHTML_VENDOR_PREFIXES.some((prefix) => ident.startsWith(prefix))) {
          push('q-class', ident);
        } else if (next === ':') {
          push('q-prop', ident);
        } else if (next === '{' || next === ',') {
          push('q-selector', ident);
        } else {
          push(depth > 0 ? 'q-value' : 'q-selector', ident);
        }
        continue;
      }

      push('q-value', ch);
      index += 1;
    }

    return tokens;
  }

  function highlightQhtmlCode(input) {
    return renderHighlightTokens(tokenizeQhtmlForHighlight(input));
  }

  function getQhtmlToolsApi() {
    if (globalScope.qhtmlTools && typeof globalScope.qhtmlTools.toHTML === 'function') return globalScope.qhtmlTools;
    if (globalScope['qhtml-tools'] && typeof globalScope['qhtml-tools'].toHTML === 'function') return globalScope['qhtml-tools'];
    if (globalScope.qhtml && typeof globalScope.qhtml.toHTML === 'function') return globalScope.qhtml;
    return null;
  }

  function removeNewBodyQHtmlNodes(beforeSet) {
    const nodes = document.querySelectorAll('body > q-html');
    nodes.forEach((node) => {
      if (!beforeSet.has(node)) node.remove();
    });
  }

  async function renderHtmlFromQhtml(source, scratch) {
    if (!source) return '';
    const qhtmlSource = String(source).trim().replace(/^"|"$/g, '');
    const toolsApi = getQhtmlToolsApi();
    if (toolsApi && typeof toolsApi.toHTML === 'function') {
      const before = new Set(Array.from(document.querySelectorAll('body > q-html')));
      try {
        const html = await Promise.resolve(toolsApi.toHTML(qhtmlSource));
        return html || '';
      } finally {
        removeNewBodyQHtmlNodes(before);
      }
    }

    const scratchEl = scratch || document.createElement('q-html');
    if (typeof scratchEl.preprocess !== 'function' || typeof scratchEl.parseQHtml !== 'function') {
      return source;
    }
    const pre = await Promise.resolve(scratchEl.preprocess(qhtmlSource));
    const html = scratchEl.parseQHtml(pre);
    const regex = /"{1}([^\"]*)"{1}/mg;
    return html.replace(regex, (match, p1) => '"' + decodeURIComponent(p1) + '"');
  }

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function basenamePath(value) {
    const source = String(value || '');
    const slash = source.lastIndexOf('/');
    return slash >= 0 ? source.slice(slash + 1) : source;
  }

  function resolveSiblingPath(basePath, siblingName) {
    const source = String(basePath || '');
    const slash = source.lastIndexOf('/');
    if (slash < 0) return siblingName;
    return source.slice(0, slash + 1) + siblingName;
  }

  class QEditor extends HTMLElement {
    constructor() {
      super();
      this._activeTab = 'qhtml';
      this._qhtmlSource = '';
      this._htmlRaw = '';
      this._htmlOutput = '';
      this._renderVersion = 0;
      this._scratchQhtml = document.createElement('q-html');
      this._previewHost = null;
      this._qhtmlFormatTimer = null;
      this._isAutoFormattingQhtml = false;
      this._scripts = SCRIPT_OPTIONS_DEFAULT.map((item) => Object.assign({}, item));
      this._mounted = false;
    }

    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;

      const initialFromAttr = this.getAttribute('initial-qhtml');
      const initialFromBody = this.textContent || '';
      const initialSource = initialFromAttr != null ? String(initialFromAttr) : initialFromBody;

      this.textContent = '';
      this._renderShell();
      this._cacheDomNodes();
      this._renderScriptsList();
      this._bindEvents();
      this._setActiveTab('qhtml');
      this.setQhtmlSource(initialSource);
    }

    disconnectedCallback() {
      this._mounted = false;
      if (this._qhtmlFormatTimer) {
        clearTimeout(this._qhtmlFormatTimer);
        this._qhtmlFormatTimer = null;
      }
    }

    setQhtmlSource(text) {
      this._qhtmlSource = formatQhtml(text);
      if (this._qhtmlInput) this._qhtmlInput.value = this._qhtmlSource;
      this._updateQhtmlHighlight();
      this._updateOutputs();
    }

    getQhtmlSource() {
      return this._qhtmlSource;
    }

    _renderShell() {
      this.innerHTML =
        '<style>' +
          'q-editor{display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
          'q-editor .qe{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;position:relative}' +
          'q-editor .qe-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#f8fafc;padding:8px}' +
          'q-editor .qe-tab{appearance:none;border:0;background:transparent;padding:.5rem .75rem;border-radius:8px;cursor:pointer;font-weight:500;color:#475569}' +
          'q-editor .qe-tab[aria-selected="true"]{background:#fff;box-shadow:0 1px 0 #e5e7eb inset,0 -1px 0 #fff inset;color:#111827}' +
          'q-editor .qe-actions{margin-left:auto;display:flex;align-items:center;gap:.4rem}' +
          'q-editor .qe-btn{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:.45rem .7rem;border-radius:8px;cursor:pointer;font-size:.8rem}' +
          'q-editor .qe-body{background:var(--hl-bg,#0f1220);color:var(--hl-fg,#e6e6e6)}' +
          'q-editor .qe-panel{position:relative;display:none}' +
          'q-editor .qe-panel[data-active="true"]{display:block}' +
          'q-editor .qe-copy{position:absolute;top:.6rem;right:.6rem;font-size:.675rem;background:#111827;color:#fff;border:0;border-radius:8px;padding:.35rem .6rem;cursor:pointer;z-index:2}' +
          'q-editor .qe-editor-wrap{position:relative;min-height:12rem}' +
          'q-editor .qe-qhtml-highlight,q-editor .qe-qhtml-input,q-editor .qe-html-output{box-sizing:border-box;width:100%;min-height:12rem;margin:0;padding:1rem;border:0;font:inherit;font-size:13px;line-height:1.5;font-variant-ligatures:none;tab-size:4;overflow:auto;white-space:pre}' +
          'q-editor .qe-qhtml-highlight{background:var(--hl-bg,#0f1220);color:var(--hl-fg,#e6e6e6);pointer-events:none}' +
          'q-editor .qe-qhtml-input{position:absolute;inset:0;background:transparent;color:transparent;caret-color:var(--hl-fg,#e6e6e6);resize:vertical;outline:none}' +
          'q-editor .qe-qhtml-input::selection{background:rgba(255,255,255,0.25)}' +
          'q-editor .qe-html-output{background:var(--hl-bg,#0f1220);color:var(--hl-fg,#e6e6e6);white-space:pre}' +
          'q-editor .qe-preview{min-height:12rem;background:#fff;color:#0f172a;padding:1rem;overflow:auto}' +
          'q-editor .qe-scripts{display:none;position:absolute;top:50px;right:8px;z-index:20;background:#fff;border:1px solid #dbe2ea;border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,0.15);padding:.65rem;width:280px}' +
          'q-editor .qe-scripts[data-open="true"]{display:block}' +
          'q-editor .qe-scripts-title{font-size:.8rem;font-weight:700;color:#334155;margin:0 0 .5rem 0}' +
          'q-editor .qe-script-row{display:flex;align-items:center;gap:.45rem;font-size:.8rem;color:#0f172a;padding:.2rem 0}' +
          'q-editor .qe-script-row input{accent-color:#2563eb}' +
          'q-editor .qe-script-row .qe-script-readonly{color:#64748b;font-size:.72rem}' +
          'q-editor .qe-modal{position:fixed;inset:0;background:rgba(15,23,42,0.52);display:none;align-items:center;justify-content:center;padding:1rem;z-index:9999}' +
          'q-editor .qe-modal[data-open="true"]{display:flex}' +
          'q-editor .qe-dialog{width:min(900px,95vw);max-height:90vh;background:#fff;border-radius:12px;border:1px solid #dbe2ea;display:flex;flex-direction:column;overflow:hidden}' +
          'q-editor .qe-dialog-head{display:flex;align-items:center;justify-content:space-between;padding:.75rem .9rem;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a}' +
          'q-editor .qe-dialog-body{padding:.8rem;display:flex;flex-direction:column;gap:.6rem;min-height:0}' +
          'q-editor .qe-export-toggle{display:flex;align-items:center;gap:.45rem;font-size:.82rem;color:#1e293b}' +
          'q-editor .qe-export-toggle input{accent-color:#2563eb}' +
          'q-editor .qe-export-text{width:100%;min-height:18rem;flex:1 1 auto;box-sizing:border-box;font:inherit;font-size:13px;line-height:1.4;padding:.75rem;border:1px solid #cbd5e1;border-radius:8px;background:#0f1220;color:#e6e6e6;white-space:pre;resize:vertical}' +
          'q-editor .qe-dialog-actions{display:flex;justify-content:flex-end;gap:.5rem}' +
          'q-editor .tok-q-selector{color:var(--q-selector,#82aaff)} q-editor .tok-q-class{color:var(--q-class,var(--hl-string,#f78c6c))} q-editor .tok-q-brace{color:var(--q-brace,#89ddff)} q-editor .tok-q-colon{color:var(--q-colon,#b0bec5)} q-editor .tok-q-semi{color:var(--q-semi,#b0bec5)} q-editor .tok-q-prop{color:var(--q-prop,#c3e88d)} q-editor .tok-q-value{color:var(--q-value,#f8f8f2)} q-editor .tok-q-string{color:var(--hl-string,#f78c6c)} q-editor .tok-q-number{color:var(--q-number,#f2ae49)} q-editor .tok-q-kw{color:var(--q-kw,#c792ea)} q-editor .tok-q-comma{color:var(--q-comma,#b0bec5)} q-editor .tok-q-comment{color:var(--q-comment,#5c6773);font-style:italic} q-editor .tok-q-embedded{color:var(--q-embedded,#a0a0ff)}' +
          'q-editor .tok-angle{color:var(--hl-angle,#89ddff)} q-editor .tok-tag{color:var(--hl-tag,#7aa2f7)} q-editor .tok-attr{color:var(--hl-attr,#c3e88d)} q-editor .tok-eq{color:var(--hl-eq,#b0bec5)} q-editor .tok-string{color:var(--hl-string,#f78c6c)} q-editor .tok-comment{color:var(--hl-comment,#5c6773);font-style:italic} q-editor .tok-doctype{color:var(--hl-doctype,#ffcb6b)} q-editor .tok-entity{color:var(--hl-entity,#c792ea)} q-editor .tok-text{color:var(--hl-text,#e6e6e6)}' +
        '</style>' +
        '<div class="qe-root">' +
        '<div class="qe">' +
          '<div class="qe-top" role="tablist" aria-label="Q Editor tabs">' +
            '<button class="qe-tab" type="button" data-tab="qhtml" aria-selected="true">QHTML</button>' +
            '<button class="qe-tab" type="button" data-tab="html" aria-selected="false">HTML</button>' +
            '<button class="qe-tab" type="button" data-tab="preview" aria-selected="false">Preview</button>' +
            '<div class="qe-actions">' +
              '<button class="qe-btn qe-scripts-btn" type="button">Scripts</button>' +
              '<button class="qe-btn qe-export-btn" type="button">Export</button>' +
            '</div>' +
          '</div>' +
          '<div class="qe-scripts" data-open="false">' +
            '<p class="qe-scripts-title">Available Scripts</p>' +
            '<div class="qe-scripts-list"></div>' +
          '</div>' +
          '<div class="qe-body">' +
            '<section class="qe-panel" data-tab="qhtml" data-active="true" aria-hidden="false">' +
              '<button class="qe-copy" type="button" data-copy="qhtml">Copy</button>' +
              '<div class="qe-editor-wrap">' +
                '<pre class="qe-qhtml-highlight" aria-hidden="true"></pre>' +
                '<textarea class="qe-qhtml-input" spellcheck="false"></textarea>' +
              '</div>' +
            '</section>' +
            '<section class="qe-panel" data-tab="html" data-active="false" aria-hidden="true">' +
              '<button class="qe-copy" type="button" data-copy="html">Copy</button>' +
              '<pre class="qe-html-output"></pre>' +
            '</section>' +
            '<section class="qe-panel" data-tab="preview" data-active="false" aria-hidden="true">' +
              '<div class="qe-preview"></div>' +
            '</section>' +
          '</div>' +
        '</div>' +
        '<div class="qe-modal" data-open="false">' +
          '<div class="qe-dialog" role="dialog" aria-modal="true" aria-label="Export QHTML">' +
            '<div class="qe-dialog-head">' +
              '<span>Export</span>' +
              '<button class="qe-btn qe-modal-close" type="button">Close</button>' +
            '</div>' +
            '<div class="qe-dialog-body">' +
              '<label class="qe-export-toggle">' +
                '<input class="qe-export-include-scripts" type="checkbox">' +
                '<span>Include Scripts</span>' +
              '</label>' +
              '<textarea class="qe-export-text" spellcheck="false"></textarea>' +
              '<div class="qe-dialog-actions">' +
                '<button class="qe-btn qe-export-copy" type="button">Copy</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '</div>';
    }

    _cacheDomNodes() {
      const root = this.querySelector('.qe-root');
      if (!root) return;
      this._tabButtons = Array.from(root.querySelectorAll('.qe-tab'));
      this._panels = Array.from(root.querySelectorAll('.qe-panel'));
      this._scriptsBtn = root.querySelector('.qe-scripts-btn');
      this._scriptsPanel = root.querySelector('.qe-scripts');
      this._scriptsList = root.querySelector('.qe-scripts-list');
      this._exportBtn = root.querySelector('.qe-export-btn');
      this._qhtmlInput = root.querySelector('.qe-qhtml-input');
      this._qhtmlHighlight = root.querySelector('.qe-qhtml-highlight');
      this._htmlOutputNode = root.querySelector('.qe-html-output');
      this._previewNode = root.querySelector('.qe-preview');
      this._copyButtons = Array.from(root.querySelectorAll('.qe-copy'));
      this._modal = root.querySelector('.qe-modal');
      this._modalClose = root.querySelector('.qe-modal-close');
      this._modalIncludeScripts = root.querySelector('.qe-export-include-scripts');
      this._modalText = root.querySelector('.qe-export-text');
      this._modalCopy = root.querySelector('.qe-export-copy');
    }

    _bindEvents() {
      this._tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          this._setActiveTab(button.getAttribute('data-tab') || 'qhtml');
        });
      });

      if (this._qhtmlInput) {
        this._qhtmlInput.addEventListener('input', () => {
          if (this._isAutoFormattingQhtml) return;
          this._qhtmlSource = this._qhtmlInput.value || '';
          this._updateQhtmlHighlight();
          this._updateOutputs();
          this._scheduleQhtmlAutoFormat();
        });
        this._qhtmlInput.addEventListener('scroll', () => this._syncQhtmlScroll());
        this._qhtmlInput.addEventListener('blur', () => this._applyQhtmlAutoFormat());
      }

      this._copyButtons.forEach((button) => {
        button.addEventListener('click', async () => {
          const kind = button.getAttribute('data-copy');
          let text = '';
          if (kind === 'qhtml') text = this._qhtmlSource;
          if (kind === 'html') text = this._htmlOutput;
          try {
            await navigator.clipboard.writeText(text || '');
            button.textContent = 'Copied';
          } catch (err) {
            button.textContent = 'Copy failed';
          }
          setTimeout(() => {
            button.textContent = 'Copy';
          }, 1200);
        });
      });

      if (this._scriptsBtn) {
        this._scriptsBtn.addEventListener('click', () => {
          const open = this._scriptsPanel.getAttribute('data-open') === 'true';
          this._scriptsPanel.setAttribute('data-open', open ? 'false' : 'true');
        });
      }

      if (this._scriptsList) {
        this._scriptsList.addEventListener('change', (event) => {
          const target = event.target;
          if (!target || target.tagName !== 'INPUT') return;
          const idx = Number.parseInt(target.getAttribute('data-script-idx') || '-1', 10);
          if (idx < 0 || idx >= this._scripts.length) return;
          if (this._scripts[idx].readOnly) {
            target.checked = !!this._scripts[idx].checked;
            return;
          }
          this._scripts[idx].checked = !!target.checked;
          this._updateOutputs();
        });
      }

      if (this._exportBtn) {
        this._exportBtn.addEventListener('click', () => this._openExportModal());
      }

      if (this._modalClose) {
        this._modalClose.addEventListener('click', () => this._closeExportModal());
      }

      if (this._modal) {
        this._modal.addEventListener('click', (event) => {
          if (event.target === this._modal) {
            this._closeExportModal();
          }
        });
      }

      if (this._modalIncludeScripts) {
        this._modalIncludeScripts.addEventListener('change', () => this._refreshExportText());
      }

      if (this._modalCopy) {
        this._modalCopy.addEventListener('click', async () => {
          const text = this._modalText ? this._modalText.value : '';
          try {
            await navigator.clipboard.writeText(text || '');
            this._modalCopy.textContent = 'Copied';
          } catch (err) {
            this._modalCopy.textContent = 'Copy failed';
          }
          setTimeout(() => {
            this._modalCopy.textContent = 'Copy';
          }, 1200);
        });
      }
    }

    _renderScriptsList() {
      if (!this._scriptsList) return;
      this._scriptsList.innerHTML = this._scripts.map((item, idx) => {
        const checked = item.checked ? ' checked' : '';
        const disabled = item.readOnly ? ' disabled' : '';
        const ro = item.readOnly ? '<span class="qe-script-readonly">(read-only)</span>' : '';
        return (
          '<label class="qe-script-row">' +
            '<input type="checkbox" data-script-idx="' + idx + '"' + checked + disabled + '>' +
            '<span>' + escapeHighlightHtml(item.src) + '</span>' +
            ro +
          '</label>'
        );
      }).join('');
    }

    _setActiveTab(name) {
      this._activeTab = name;
      this._tabButtons.forEach((button) => {
        const active = button.getAttribute('data-tab') === name;
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this._panels.forEach((panel) => {
        const active = panel.getAttribute('data-tab') === name;
        panel.setAttribute('data-active', active ? 'true' : 'false');
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    }

    _scheduleQhtmlAutoFormat() {
      if (this._qhtmlFormatTimer) clearTimeout(this._qhtmlFormatTimer);
      this._qhtmlFormatTimer = setTimeout(() => this._applyQhtmlAutoFormat(), 350);
    }

    _applyQhtmlAutoFormat() {
      if (!this._qhtmlInput) return;
      const current = this._qhtmlInput.value || '';
      const start = this._qhtmlInput.selectionStart;
      const end = this._qhtmlInput.selectionEnd;
      const result = formatQhtmlForEditing(current, start, end, 1);
      const formatted = result.text;
      if (!formatted || formatted === current) return;

      this._isAutoFormattingQhtml = true;
      this._qhtmlSource = formatted;
      this._qhtmlInput.value = formatted;
      this._updateQhtmlHighlight();
      this._updateOutputs();
      this._qhtmlInput.selectionStart = Math.min(result.cursorStart, formatted.length);
      this._qhtmlInput.selectionEnd = Math.min(result.cursorEnd, formatted.length);
      this._isAutoFormattingQhtml = false;
    }

    _syncQhtmlScroll() {
      if (!this._qhtmlInput || !this._qhtmlHighlight) return;
      this._qhtmlHighlight.scrollTop = this._qhtmlInput.scrollTop;
      this._qhtmlHighlight.scrollLeft = this._qhtmlInput.scrollLeft;
    }

    _updateQhtmlHighlight() {
      if (!this._qhtmlHighlight) return;
      this._qhtmlHighlight.innerHTML = highlightQhtmlCode(this._qhtmlSource || '');
      this._syncQhtmlScroll();
    }

    _composeQhtmlSourceWithImports(source) {
      const raw = String(source || '');
      const existingImports = new Set();

      raw.split('\n').forEach((line) => {
        const match = String(line || '').trim().match(/^q-import\s*\{\s*([^}]+?)\s*\}$/);
        if (match && match[1]) {
          existingImports.add(String(match[1]).trim());
        }
      });

      const importLines = [];
      const emitted = new Set();
      this._scripts
        .filter((item) => !!item.checked)
        .forEach((item) => {
          const kind = String(item.kind || 'script');
          if (kind !== 'q-import') return;
          const sourcePath = String(item.src || '').trim();
          if (!sourcePath || existingImports.has(sourcePath) || emitted.has(sourcePath)) return;
          emitted.add(sourcePath);
          importLines.push('q-import { ' + sourcePath + ' }');
        });

      if (!importLines.length) return raw;
      if (!raw) return importLines.join('\n');
      return importLines.join('\n') + '\n' + raw;
    }

    async _updateOutputs() {
      const source = this._qhtmlSource || '';
      const effectiveSource = this._composeQhtmlSourceWithImports(source);
      const renderVersion = ++this._renderVersion;
      let htmlRaw = '';
      try {
        htmlRaw = await renderHtmlFromQhtml(effectiveSource, this._scratchQhtml);
      } catch (err) {
        console.warn('q-editor render failed:', err);
      }

      if (renderVersion !== this._renderVersion) return;

      this._htmlRaw = htmlRaw || '';
      this._htmlOutput = formatHTML(this._htmlRaw);
      this._updateHtmlTab();
      this._updatePreview(source);
      if (this._modal && this._modal.getAttribute('data-open') === 'true') {
        this._refreshExportText();
      }
    }

    _updateHtmlTab() {
      if (!this._htmlOutputNode) return;
      this._htmlOutputNode.innerHTML = highlightHtmlCode(this._htmlOutput || '');
    }

    _updatePreview(source) {
      if (!this._previewNode) return;
      if (!this._previewHost || !this._previewNode.contains(this._previewHost)) {
        this._previewNode.innerHTML = '';
        this._previewHost = document.createElement('q-html');
        this._previewNode.appendChild(this._previewHost);
      }
      this._syncPreviewDependencies();
      this._previewHost.innerHTML = this._composeQhtmlSourceWithImports(source);
      if (typeof this._previewHost.render === 'function') {
        this._previewHost.render();
      }
    }

    _openExportModal() {
      if (!this._modal) return;
      if (this._modalIncludeScripts) this._modalIncludeScripts.checked = false;
      this._refreshExportText();
      this._modal.setAttribute('data-open', 'true');
    }

    _closeExportModal() {
      if (!this._modal) return;
      this._modal.setAttribute('data-open', 'false');
    }

    _refreshExportText() {
      if (!this._modalText) return;
      const includeScripts = !!(this._modalIncludeScripts && this._modalIncludeScripts.checked);
      this._modalText.value = this._buildExportText(includeScripts);
    }

    _resolveEnabledDependencyAssets() {
      const styles = [];
      const scripts = [];
      const styleSet = new Set();
      const scriptSet = new Set();

      this._scripts
        .filter((item) => !!item.checked)
        .forEach((item) => {
          const kind = String(item.kind || 'script');
          if (kind !== 'script') return;
          const src = String(item.src || '');
          const deps = SCRIPT_DEPENDENCIES[basenamePath(src)];
          if (!deps) return;

          (deps.styles || []).forEach((name) => {
            const href = resolveSiblingPath(src, name);
            if (styleSet.has(href)) return;
            styleSet.add(href);
            styles.push(href);
          });

          (deps.scripts || []).forEach((name) => {
            const depSrc = resolveSiblingPath(src, name);
            if (scriptSet.has(depSrc)) return;
            scriptSet.add(depSrc);
            scripts.push(depSrc);
          });
        });

      return { styles, scripts };
    }

    _ensurePreviewScript(src) {
      const source = String(src || '');
      if (!source || typeof document === 'undefined') return;
      const existing = Array.from(document.querySelectorAll('script[src]')).some((node) => {
        return node.getAttribute('src') === source;
      });
      if (existing) return;

      const script = document.createElement('script');
      script.src = source;
      script.defer = true;
      script.setAttribute('data-qe-preview-dependency', 'true');
      (document.head || document.body || document.documentElement).appendChild(script);
    }

    _syncPreviewDependencies() {
    /*  if (!this._previewNode) return;
      const deps = this._resolveEnabledDependencyAssets();

     Array.from(this._previewNode.querySelectorAll('link[data-qe-preview-dependency="true"]')).forEach((node) => node.remove());
      deps.styles.forEach((href) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute('data-qe-preview-dependency', 'true');
        if (this._previewHost && this._previewNode.contains(this._previewHost)) {
          this._previewNode.insertBefore(link, this._previewHost);
          return;
        }
        this._previewNode.appendChild(link);
      });

      deps.scripts.forEach((src) => this._ensurePreviewScript(src));
      */
    } 

    _buildExportText(includeScripts) {
      const lines = [];
      if (includeScripts) {
        const deps = this._resolveEnabledDependencyAssets();
        const emittedScripts = new Set();
        const scriptLines = [];
        const styleLines = [];

        deps.styles.forEach((href) => {
          styleLines.push('<link rel="stylesheet" href="' + escapeAttr(href) + '">');
        });

        deps.scripts.forEach((src) => {
          const source = String(src || '');
          if (!source || emittedScripts.has(source)) return;
          emittedScripts.add(source);
          scriptLines.push('<script src="' + escapeAttr(source) + '"></script>');
        });

        this._scripts
          .filter((item) => !!item.checked)
          .forEach((item) => {
            const kind = String(item.kind || 'script');
            if (kind !== 'script') return;
            const source = String(item.src || '');
            if (!source || emittedScripts.has(source)) return;
            emittedScripts.add(source);
            scriptLines.push('<script src="' + escapeAttr(source) + '"></script>');
          });

        lines.push(...styleLines, ...scriptLines);
        if (styleLines.length || scriptLines.length) lines.push('');
      }

      lines.push('<q-html>');
      const exportSource = this._composeQhtmlSourceWithImports(this._qhtmlSource || '');
      if (exportSource) {
        exportSource.split('\n').forEach((line) => lines.push(line));
      }
      lines.push('</q-html>');

      return lines.join('\n');
    }
  }

  if (!customElements.get('q-editor')) {
    customElements.define('q-editor', QEditor);
  }
})(typeof window !== 'undefined' ? window : globalThis);

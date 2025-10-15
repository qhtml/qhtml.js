const DEFAULT_INDENT = '    ';

const TAG_COLOR_CLASS = 'token-tag';
const ATTRIBUTE_COLOR_CLASS = 'token-attribute';
const QCOMPONENT_COLOR_CLASS = 'token-qcomponent';
const STRING_COLOR_CLASS = 'token-string';
const PUNCTUATION_COLOR_CLASS = 'token-punctuation';
const INLINE_HTML_CLASS = 'token-inline-html';
const INLINE_TEXT_CLASS = 'token-inline-text';
const COMMENT_COLOR_CLASS = 'token-comment';
const KEYWORD_COLOR_CLASS = 'token-keyword';

const HTML_TAG_PATTERN = /^(a|abbr|address|article|aside|audio|b|blockquote|body|br|button|canvas|caption|cite|code|div|dl|dt|dd|em|footer|form|h[1-6]|head|header|hr|html|i|iframe|img|input|label|li|link|main|meta|nav|ol|option|p|pre|script|section|select|small|span|strong|style|sub|sup|svg|table|tbody|td|textarea|tfoot|th|thead|title|tr|u|ul|video)$/i;

function escapeAndFormat(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '&') {
            result += '&amp;';
        } else if (ch === '<') {
            result += '&lt;';
        } else if (ch === '>') {
            result += '&gt;';
        } else if (ch === '"') {
            result += '&quot;';
        } else if (ch === "'") {
            result += '&#39;';
        } else if (ch === ' ') {
            result += '&nbsp;';
        } else if (ch === '\t') {
            result += '&nbsp;&nbsp;&nbsp;&nbsp;';
        } else if (ch === '\n') {
            result += '<br>';
        } else {
            result += ch;
        }
    }
    return result;
}

function isHtmlTag(token) {
    return HTML_TAG_PATTERN.test(token) || token.startsWith('w3-') || token.startsWith('bs-');
}

function isQComponentToken(token) {
    return token.includes('-') && !token.startsWith('w3-') && !token.startsWith('bs-') && !HTML_TAG_PATTERN.test(token);
}

function peekNextNonWhitespace(source, fromIndex) {
    for (let i = fromIndex; i < source.length; i++) {
        const ch = source[i];
        if (!/\s/.test(ch)) {
            return { char: ch, index: i };
        }
    }
    return { char: '', index: source.length };
}

class IndentationManager {
    constructor(indentUnit = DEFAULT_INDENT) {
        this.indentUnit = indentUnit;
    }

    handleKeydown(event, textarea) {
        if (event.key !== 'Enter' || event.isComposing) {
            return false;
        }

        const { selectionStart, selectionEnd, value } = textarea;
        if (selectionStart !== selectionEnd) {
            return false;
        }

        const before = value.slice(0, selectionStart);
        const after = value.slice(selectionEnd);
        const prevLineBreak = before.lastIndexOf('
');
        const prevLine = prevLineBreak === -1 ? before : before.slice(prevLineBreak + 1);
        const prevIndentMatch = prevLine.match(/^[\s	]*/);
        const prevIndent = prevIndentMatch ? prevIndentMatch[0] : '';
        const trimmedPrev = prevLine.trim();

        let indent = prevIndent;
        if (trimmedPrev.endsWith('{')) {
            indent = prevIndent + this.indentUnit;
        } else if (trimmedPrev.startsWith('}')) {
            indent = this.reduceIndent(prevIndent);
        }

        const nextTrimmed = after.trimStart();
        if (nextTrimmed.startsWith('}')) {
            indent = this.reduceIndent(indent);
        }

        const insertion = `
${indent}`;
        textarea.setRangeText(insertion, selectionStart, selectionEnd, 'end');
        event.preventDefault();
        return true;
    }

    reduceIndent(value) {
        if (!value) {
            return '';
        }
        if (value.endsWith(this.indentUnit)) {
            return value.slice(0, -this.indentUnit.length);
        }
        return value.replace(/[	 ]+$/, '');
    }
}

class SyntaxHighlighter {
    constructor() {
        this.awaitingContext = null;
    }

    highlight(source) {
        this.awaitingContext = null;
        const tokens = this.tokenize(source);
        return tokens.map(token => this.tokenToHtml(token)).join('');
    }

    tokenize(source) {
        const tokens = [];
        const stack = [];
        let i = 0;

        const pushToken = (type, value) => {
            if (!value) {
                return;
            }
            tokens.push({ type, value });
        };

        while (i < source.length) {
            const context = stack.length ? stack[stack.length - 1] : 'default';
            const ch = source[i];

            if (ch === '
') {
                pushToken('newline', '
');
                i += 1;
                continue;
            }

            if (ch === ' ' || ch === '	') {
                let j = i + 1;
                while (j < source.length && (source[j] === ' ' || source[j] === '	')) {
                    j += 1;
                }
                pushToken('whitespace', source.slice(i, j));
                i = j;
                continue;
            }

            if (context === 'html' || context === 'text') {
                const closingIndex = source.indexOf('}', i);
                const endIndex = closingIndex === -1 ? source.length : closingIndex;
                const segment = source.slice(i, endIndex);
                pushToken(context === 'html' ? 'inline-html' : 'inline-text', segment);
                i = endIndex;
                this.awaitingContext = null;
                continue;
            }

            if (ch === '{') {
                stack.push(this.awaitingContext || 'default');
                pushToken('punctuation', ch);
                this.awaitingContext = null;
                i += 1;
                continue;
            }

            if (ch === '}') {
                if (stack.length) {
                    stack.pop();
                }
                pushToken('punctuation', ch);
                i += 1;
                continue;
            }

            if (ch === '/' && source[i + 1] === '/') {
                const lineEnd = source.indexOf('
', i);
                const commentEnd = lineEnd === -1 ? source.length : lineEnd;
                pushToken('comment', source.slice(i, commentEnd));
                i = commentEnd;
                continue;
            }

            if (ch === '/' && source[i + 1] === '*') {
                const commentEnd = source.indexOf('*/', i + 2);
                const endIndex = commentEnd === -1 ? source.length : commentEnd + 2;
                pushToken('comment', source.slice(i, endIndex));
                i = endIndex;
                continue;
            }

            if (ch === '"' || ch === "'") {
                const { value: stringLiteral, endIndex } = this.consumeString(source, i, ch);
                pushToken('string', stringLiteral);
                i = endIndex;
                continue;
            }

            if (/[A-Za-z0-9_-]/.test(ch)) {
                const { token, endIndex } = this.consumeWord(source, i);
                const peek = peekNextNonWhitespace(source, endIndex);
                const nextChar = peek.char;

                if ((token === 'html' || token === 'text') && nextChar === '{') {
                    this.awaitingContext = token;
                    pushToken('keyword', token);
                    i = endIndex;
                    continue;
                }

                if (nextChar === ':') {
                    pushToken('attribute', token);
                    i = endIndex;
                    continue;
                }

                if (token === 'q-component') {
                    pushToken('qcomponent', token);
                    i = endIndex;
                    continue;
                }

                if (isQComponentToken(token)) {
                    pushToken('qcomponent', token);
                    i = endIndex;
                    continue;
                }

                if (isHtmlTag(token)) {
                    pushToken('tag', token);
                    i = endIndex;
                    continue;
                }

                pushToken('tag', token);
                i = endIndex;
                continue;
            }

            pushToken('punctuation', ch);
            i += 1;
        }

        return tokens;
    }

    consumeString(source, startIndex, quoteChar) {
        let escaped = false;
        let index = startIndex + 1;
        while (index < source.length) {
            const ch = source[index];
            if (escaped) {
                escaped = false;
            } else if (ch === '\') {
                escaped = true;
            } else if (ch === quoteChar) {
                index += 1;
                break;
            }
            index += 1;
        }
        const value = source.slice(startIndex, index);
        return { value, endIndex: index };
    }

    consumeWord(source, startIndex) {
        let index = startIndex;
        while (index < source.length && /[A-Za-z0-9_-]/.test(source[index])) {
            index += 1;
        }
        return { token: source.slice(startIndex, index), endIndex: index };
    }

    tokenToHtml(token) {
        switch (token.type) {
            case 'whitespace':
                return escapeAndFormat(token.value);
            case 'newline':
                return '<br>';
            case 'string':
                return `<span class="${STRING_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'comment':
                return `<span class="${COMMENT_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'attribute':
                return `<span class="${ATTRIBUTE_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'punctuation':
                return `<span class="${PUNCTUATION_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'qcomponent':
                return `<span class="${QCOMPONENT_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'keyword':
                return `<span class="${KEYWORD_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'tag':
                return `<span class="${TAG_COLOR_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'inline-html':
                return `<span class="${INLINE_HTML_CLASS}">${escapeAndFormat(token.value)}</span>`;
            case 'inline-text':
                return `<span class="${INLINE_TEXT_CLASS}">${escapeAndFormat(token.value)}</span>`;
            default:
                return escapeAndFormat(token.value);
        }
    }
}

class PreviewRenderer {
    constructor() {
        this.lastSuccessfulNode = null;
    }

    render(container, code) {
        if (!container) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'preview-render-wrapper';

        try {
            const element = document.createElement('q-html');
            element.innerHTML = code;
            wrapper.appendChild(element);
            container.innerHTML = '';
            container.appendChild(wrapper);
            this.lastSuccessfulNode = element.cloneNode(true);
        } catch (error) {
            this.renderWithFallback(container, error, code);
        }
    }

    renderWithFallback(container, error, code) {
        container.innerHTML = '';
        if (this.lastSuccessfulNode) {
            container.appendChild(this.lastSuccessfulNode.cloneNode(true));
        }

        const errorBanner = document.createElement('div');
        errorBanner.className = 'preview-error-banner';
        errorBanner.textContent = `Preview error: ${error.message}`;
        container.appendChild(errorBanner);

        const fallback = document.createElement('pre');
        fallback.className = 'preview-fallback';
        fallback.textContent = code;
        container.appendChild(fallback);
    }
}

class EditorOrchestrator {
    constructor(host) {
        this.host = host;
        this.highlighter = new SyntaxHighlighter();
        this.indentation = new IndentationManager();
        this.preview = new PreviewRenderer();
        this.pendingFrame = null;
    }

    bind(textarea, highlightLayer, previewContainer) {
        this.textarea = textarea;
        this.highlightLayer = highlightLayer;
        this.previewContainer = previewContainer;

        this.handleInput = () => this.scheduleUpdate();
        this.handleScroll = () => this.syncScroll();
        this.handleKeydown = (event) => {
            if (this.indentation.handleKeydown(event, this.textarea)) {
                this.scheduleUpdate();
            }
        };

        this.textarea.addEventListener('input', this.handleInput);
        this.textarea.addEventListener('scroll', this.handleScroll);
        this.textarea.addEventListener('keydown', this.handleKeydown);
    }

    setValue(value) {
        if (typeof value !== 'string') {
            return;
        }
        this.textarea.value = value;
        this.forceUpdate();
    }

    getValue() {
        return this.textarea.value;
    }

    scheduleUpdate() {
        if (this.pendingFrame) {
            return;
        }
        this.pendingFrame = requestAnimationFrame(() => {
            this.pendingFrame = null;
            this.forceUpdate();
        });
    }

    forceUpdate() {
        const value = this.getValue();
        this.highlightLayer.innerHTML = this.highlighter.highlight(value);
        this.syncScroll();
        try {
            this.preview.render(this.previewContainer, value);
        } catch (error) {
            console.warn('Preview rendering failed', error);
        }
    }

    syncScroll() {
        const top = this.textarea.scrollTop;
        const left = this.textarea.scrollLeft;
        this.highlightLayer.style.transform = `translate(${-left}px, ${-top}px)`;
    }

    dispose() {
        if (this.pendingFrame) {
            cancelAnimationFrame(this.pendingFrame);
            this.pendingFrame = null;
        }
        if (this.textarea) {
            this.textarea.removeEventListener('input', this.handleInput);
            this.textarea.removeEventListener('scroll', this.handleScroll);
            this.textarea.removeEventListener('keydown', this.handleKeydown);
        }
    }
}

class QhtmlEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.orchestrator = new EditorOrchestrator(this);
        this.shadowRoot.appendChild(this.createTemplate());
        this.codeInput = this.shadowRoot.querySelector('textarea');
        this.highlightLayer = this.shadowRoot.querySelector('.highlight-layer');
        this.previewContainer = this.shadowRoot.querySelector('.preview-area');
        this.orchestrator.bind(this.codeInput, this.highlightLayer, this.previewContainer);
    }

    static get observedAttributes() {
        return ['value'];
    }

    attributeChangedCallback(name, _oldValue, newValue) {
        if (name === 'value' && newValue !== this.orchestrator.getValue()) {
            this.orchestrator.setValue(newValue);
        }
    }

    connectedCallback() {
        const initial = this.getAttribute('value') ?? this.textContent.trim();
        this.orchestrator.setValue(initial);
        this.textContent = '';
    }

    set value(newValue) {
        this.orchestrator.setValue(newValue);
    }

    get value() {
        return this.orchestrator.getValue();
    }

    disconnectedCallback() {
        this.orchestrator.dispose();
    }

    createTemplate() {
        const template = document.createElement('template');
        template.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: 'Fira Code', 'Source Code Pro', Menlo, Monaco, Consolas, 'Courier New', monospace;
                    color: #f5f5f5;
                    --editor-background: #1e1e1e;
                    --editor-border: #3c3c3c;
                    --editor-text: #f8f8f2;
                    --tag-color: #4ec9b0;
                    --attribute-color: #9cdcfe;
                    --qcomponent-color: #c586c0;
                    --string-color: #ce9178;
                    --punctuation-color: #d4d4d4;
                    --keyword-color: #dcdcaa;
                    --comment-color: #6a9955;
                    --inline-html-color: #ffcb6b;
                    --inline-text-color: #d7ba7d;
                    --preview-background: #111;
                    --preview-border: #444;
                    --error-background: rgba(255, 45, 85, 0.15);
                    --error-color: #ff5f87;
                }

                .editor-shell {
                    border: 1px solid var(--editor-border);
                    border-radius: 8px;
                    overflow: hidden;
                    background: var(--editor-background);
                    display: grid;
                    grid-template-rows: 1fr auto;
                    min-height: 400px;
                }

                .code-region {
                    position: relative;
                    overflow: hidden;
                }

                .highlight-layer {
                    position: absolute;
                    inset: 0;
                    padding: 16px;
                    pointer-events: none;
                    white-space: pre;
                    font-size: 14px;
                    line-height: 1.6;
                    color: var(--editor-text);
                    overflow: hidden;
                    min-height: 100%;
                    box-sizing: border-box;
                    transform: translate(0, 0);
                    will-change: transform;
                }

                textarea {
                    position: absolute;
                    inset: 0;
                    padding: 16px;
                    border: none;
                    resize: none;
                    background: transparent;
                    color: transparent;
                    caret-color: var(--editor-text);
                    font-size: 14px;
                    line-height: 1.6;
                    font-family: inherit;
                    white-space: pre;
                    overflow: auto;
                    box-sizing: border-box;
                }

                textarea:focus {
                    outline: none;
                }

                .preview-region {
                    background: var(--preview-background);
                    border-top: 1px solid var(--preview-border);
                    padding: 16px;
                    display: grid;
                    grid-template-rows: auto 1fr;
                    gap: 12px;
                }

                .preview-label {
                    font-size: 12px;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--attribute-color);
                }

                .preview-area {
                    background: #1a1a1a;
                    border: 1px solid var(--preview-border);
                    border-radius: 6px;
                    padding: 12px;
                    min-height: 160px;
                    overflow: auto;
                }

                .preview-error-banner {
                    background: var(--error-background);
                    border: 1px solid var(--error-color);
                    color: var(--error-color);
                    padding: 8px 12px;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    font-size: 13px;
                }

                .preview-fallback {
                    margin: 0;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.4);
                    border-radius: 4px;
                    color: var(--attribute-color);
                    white-space: pre-wrap;
                }

                .token-tag { color: var(--tag-color); }
                .token-attribute { color: var(--attribute-color); }
                .token-qcomponent { color: var(--qcomponent-color); }
                .token-string { color: var(--string-color); }
                .token-punctuation { color: var(--punctuation-color); }
                .token-inline-html { color: var(--inline-html-color); }
                .token-inline-text { color: var(--inline-text-color); }
                .token-comment { color: var(--comment-color); }
                .token-keyword { color: var(--keyword-color); }
            </style>
            <div class="editor-shell">
                <div class="code-region">
                    <div class="highlight-layer" aria-hidden="true"></div>
                    <textarea spellcheck="false"></textarea>
                </div>
                <div class="preview-region">
                    <div class="preview-label">Preview</div>
                    <div class="preview-area"></div>
                </div>
            </div>
        `;
        return template.content.cloneNode(true);
    }
}

if (!customElements.get('qhtml-editor')) {
    customElements.define('qhtml-editor', QhtmlEditor);
}

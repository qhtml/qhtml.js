/* created by mike nickaloff
 * https://www.github.com/qhtml/qhtml.js
 * v5.0.3
 *
 * 5.0.3 quick summary:
 * - Runtime q-script and inline event handlers now expose consistent contextual
 *   aliases on `this`: `this.parent`, `this.slot`, and `this.component`.
 * - `this` remains the executing DOM element while slot/component lookup walks
 *   live DOM ancestry (with runtime-template fallback when present).
 * - Alias injection/cleanup is fail-safe so context detection errors do not
 *   break handler or q-script execution.
 * - q-component now supports q-signal declarations, onSignal handlers, and
 *   signal.connect(...) chaining between component instances.
 */
// -----------------------------------------------------------------------------
// Top-level helper functions
//
// The following functions implement the core parsing and transformation logic
// needed by QHtmlElement.  They are defined outside of the class so that
// individual pieces can be understood and tested in isolation.  Where
// possible, each function performs a single task and returns a value.

/**
 * Emit a formatted log message that is aware of the current component
 * context.  Centralising logging makes it easier to expand diagnostics in
 * the future (e.g. to surface warnings in a UI console instead of
 * `console.*`).
 *
 * @param {'warn'|'error'|'info'} level The log severity
 * @param {string} componentId The component identifier, if any
 * @param {string} message The message to emit
 */
function logComponentIssue(level, componentId, message) {
    const prefix = componentId ? `[${componentId}] ` : '';
    const text = `qhtml: ${prefix}${message}`;
    const logger = console[level] || console.info;
    logger.call(console, text);
}

const componentLogger = {
    warn(componentId, message) {
        logComponentIssue('warn', componentId, message);
    },
    error(componentId, message) {
        logComponentIssue('error', componentId, message);
    },
    info(componentId, message) {
        logComponentIssue('info', componentId, message);
    }
};

function parseTagWithClasses(tag) {
    const trimmed = (tag || '').trim();
    if (!trimmed) return { base: '', classes: [] };
    const parts = trimmed.split('.').filter(Boolean);
    const base = parts.shift() || '';
    return { base, classes: parts };
}

function isLikelyValidElementTagName(tagName) {
    const token = String(tagName || '').trim();
    if (!token) return false;
    return /^[A-Za-z][A-Za-z0-9._-]*$/.test(token);
}

function mergeClassNames(existing, incoming) {
    const existingList = (existing || '').split(/\s+/).filter(Boolean);
    const incomingList = (incoming || '').split(/\s+/).filter(Boolean);
    const merged = new Set();
    existingList.forEach((cls) => merged.add(cls));
    incomingList.forEach((cls) => merged.add(cls));
    return Array.from(merged).join(' ');
}

function mergeClassAttribute(element, classValue) {
    if (!element || !classValue) return;
    const merged = mergeClassNames(element.getAttribute('class'), classValue);
    if (merged) element.setAttribute('class', merged);
}

const qhtmlGeneratedComponentActionCache = new Map();
const qhtmlGeneratedComponentTemplateCache = new Map();
const qhtmlGeneratedComponentSlotCache = new Map();
const qhtmlGeneratedComponentSignalCache = new Map();
const qhtmlGeneratedComponentSignalHandlerCache = new Map();
const qhtmlInlineEventHandlerCache = new Map();
let qhtmlRuntimeTemplateCounter = 0;

function setGeneratedComponentDefinition(componentId, definition = {}) {
    const key = String(componentId || '').trim().toLowerCase();
    if (!key) {
        return;
    }
    const template = String(definition.template || '').trim();
    const slotNames = Array.isArray(definition.slotNames)
        ? definition.slotNames.map((name) => String(name || '').trim()).filter(Boolean)
        : [];
    const signals = Array.isArray(definition.signals)
        ? definition.signals.map((signal) => ({
            name: String(signal && signal.name ? signal.name : '').trim(),
            params: Array.isArray(signal && signal.params)
                ? signal.params.map((param) => String(param || '').trim()).filter(Boolean)
                : []
        })).filter((signal) => signal.name)
        : [];
    const signalHandlers = Array.isArray(definition.signalHandlers)
        ? definition.signalHandlers.map((handler) => ({
            signalName: String(handler && handler.signalName ? handler.signalName : '').trim(),
            params: String(handler && handler.params ? handler.params : '').trim(),
            body: String(handler && handler.body ? handler.body : '').trim()
        })).filter((handler) => handler.signalName)
        : [];
    qhtmlGeneratedComponentTemplateCache.set(key, template);
    qhtmlGeneratedComponentSlotCache.set(key, slotNames);
    qhtmlGeneratedComponentSignalCache.set(key, signals);
    qhtmlGeneratedComponentSignalHandlerCache.set(key, signalHandlers);
}

function getGeneratedComponentSlotNames(componentId) {
    const key = String(componentId || '').trim().toLowerCase();
    if (!key) {
        return [];
    }
    return qhtmlGeneratedComponentSlotCache.get(key) || [];
}

function getGeneratedComponentSignals(componentId) {
    const key = String(componentId || '').trim().toLowerCase();
    if (!key) {
        return [];
    }
    return qhtmlGeneratedComponentSignalCache.get(key) || [];
}

function getGeneratedComponentSignalHandlers(componentId) {
    const key = String(componentId || '').trim().toLowerCase();
    if (!key) {
        return [];
    }
    return qhtmlGeneratedComponentSignalHandlerCache.get(key) || [];
}

function ensureQHtmlRuntimeRegistry() {
    if (typeof window === 'undefined') {
        return null;
    }
    if (!window.__qhtmlRuntimeRegistry) {
        window.__qhtmlRuntimeRegistry = {
            byTemplateId: Object.create(null),
            byInstanceId: Object.create(null)
        };
    }
    if (!window.qhtmlRuntimeRegistry) {
        window.qhtmlRuntimeRegistry = window.__qhtmlRuntimeRegistry;
    }
    return window.__qhtmlRuntimeRegistry;
}

function isElementNode(value) {
    return !!value && typeof value === 'object' && value.nodeType === 1;
}

function resolveQHtmlComponentContextElement(node) {
    if (!isElementNode(node)) {
        return null;
    }
    try {
        if (typeof node.getAttribute === 'function' && node.getAttribute('q-component')) {
            return node.qhtml || node;
        }
    } catch (err) {
        // ignore resolution errors and continue with fallbacks
    }
    try {
        if (typeof node.closest === 'function') {
            const owner = node.closest('[q-component]');
            if (owner) {
                return owner.qhtml || owner;
            }
            const runtimeRoot = node.closest('[qhtml-runtime-template-id]');
            if (runtimeRoot && runtimeRoot.qhtml) {
                return runtimeRoot.qhtml;
            }
        }
    } catch (err) {
        // ignore resolution errors and continue with fallback
    }
    try {
        return node.qhtml || null;
    } catch (err) {
        return null;
    }
}

function resolveQHtmlSlotContextElement(node) {
    if (!isElementNode(node)) {
        return null;
    }
    try {
        if (typeof node.matches === 'function' && node.matches('q-into[slot], into[slot]')) {
            return node;
        }
    } catch (err) {
        // ignore invalid selector/matches errors
    }
    try {
        if (typeof node.closest === 'function') {
            return node.closest('q-into[slot], into[slot]') || null;
        }
    } catch (err) {
        // ignore invalid selector/closest errors
    }
    return null;
}

function injectTemporaryThisAlias(target, key, value, cleanupStack) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
        return;
    }
    let hadOwn = false;
    let previousDescriptor = null;
    try {
        hadOwn = Object.prototype.hasOwnProperty.call(target, key);
        if (hadOwn) {
            previousDescriptor = Object.getOwnPropertyDescriptor(target, key);
        }
    } catch (err) {
        hadOwn = false;
        previousDescriptor = null;
    }
    try {
        Object.defineProperty(target, key, {
            value,
            writable: true,
            configurable: true
        });
        cleanupStack.push({ key, hadOwn, previousDescriptor });
    } catch (err) {
        // ignore alias injection failures (frozen/native objects, non-configurable properties, etc.)
    }
}

function restoreTemporaryThisAliases(target, cleanupStack) {
    if (!target || !Array.isArray(cleanupStack) || !cleanupStack.length) {
        return;
    }
    for (let i = cleanupStack.length - 1; i >= 0; i--) {
        const entry = cleanupStack[i];
        if (!entry) {
            continue;
        }
        try {
            if (entry.hadOwn && entry.previousDescriptor) {
                Object.defineProperty(target, entry.key, entry.previousDescriptor);
            } else {
                delete target[entry.key];
            }
        } catch (err) {
            // ignore cleanup failures
        }
    }
}

function applyQHtmlRuntimeThisContext(thisArg) {
    if (!thisArg || (typeof thisArg !== 'object' && typeof thisArg !== 'function')) {
        return function noopRestore() {};
    }
    const cleanupStack = [];
    let parentLike = null;
    try {
        parentLike = thisArg.parentElement || thisArg.parentNode || null;
    } catch (err) {
        parentLike = null;
    }
    let slotElement = null;
    let componentElement = null;
    try {
        slotElement = resolveQHtmlSlotContextElement(thisArg);
    } catch (err) {
        slotElement = null;
    }
    try {
        componentElement = resolveQHtmlComponentContextElement(thisArg);
    } catch (err) {
        componentElement = null;
    }
    injectTemporaryThisAlias(thisArg, 'parent', parentLike, cleanupStack);
    injectTemporaryThisAlias(thisArg, 'slot', slotElement || null, cleanupStack);
    injectTemporaryThisAlias(thisArg, 'component', componentElement || null, cleanupStack);
    return function restoreThisContext() {
        restoreTemporaryThisAliases(thisArg, cleanupStack);
    };
}

function executeQHtmlInlineEventHandler(scriptBody, thisArg, eventObj, propName = '') {
    const body = String(scriptBody || '');
    if (!body.trim()) {
        return undefined;
    }
    let fn = qhtmlInlineEventHandlerCache.get(body);
    if (!fn) {
        try {
            fn = new Function('event', body);
            qhtmlInlineEventHandlerCache.set(body, fn);
        } catch (err) {
            console.error('Failed to compile inline event handler', propName, err);
            return undefined;
        }
    }
    const restoreThisContext = applyQHtmlRuntimeThisContext(thisArg);
    try {
        return fn.call(thisArg, eventObj);
    } catch (err) {
        console.error('Error executing inline event handler for', propName, err);
        return undefined;
    } finally {
        if (typeof restoreThisContext === 'function') {
            restoreThisContext();
        }
    }
}

function isIdentifierTokenChar(ch) {
    return !!ch && /[A-Za-z0-9_-]/.test(ch);
}

function findStandaloneKeyword(str, keyword, fromIndex = 0) {
    const source = String(str || '');
    const token = String(keyword || '');
    if (!token) {
        return -1;
    }
    let pos = Math.max(0, Number(fromIndex) || 0);
    while (pos < source.length) {
        const idx = source.indexOf(token, pos);
        if (idx === -1) {
            return -1;
        }
        const before = idx > 0 ? source[idx - 1] : '';
        const after = source[idx + token.length] || '';
        if (isIdentifierTokenChar(before) || isIdentifierTokenChar(after)) {
            pos = idx + token.length;
            continue;
        }
        return idx;
    }
    return -1;
}

function extractTokenBeforeIndex(source, index) {
    const input = String(source || '');
    let end = Math.min(input.length, Math.max(0, Number(index) || 0)) - 1;
    while (end >= 0 && /\s/.test(input[end])) {
        end--;
    }
    if (end < 0 || !/[A-Za-z0-9_.-]/.test(input[end])) {
        return '';
    }
    let start = end;
    while (start >= 0 && /[A-Za-z0-9_.-]/.test(input[start])) {
        start--;
    }
    return input.slice(start + 1, end + 1).trim();
}

function findNearestOpenBraceBeforeIndex(source, index) {
    const input = String(source || '');
    const end = Math.min(input.length, Math.max(0, Number(index) || 0));
    let depth = 0;
    for (let i = end - 1; i >= 0; i--) {
        const ch = input[i];
        if (ch === '}') {
            depth++;
            continue;
        }
        if (ch === '{') {
            if (depth === 0) {
                return i;
            }
            depth--;
        }
    }
    return -1;
}

function findMatchingBraceWithLiterals(str, openIdx) {
    const input = String(str || '');
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openIdx; i < input.length; i++) {
        const ch = input[i];
        const next = input[i + 1];

        if (inLineComment) {
            if (ch === '\n' || ch === '\r') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inSingle) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '\'') {
                inSingle = false;
            }
            continue;
        }

        if (inDouble) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inDouble = false;
            }
            continue;
        }

        if (inBacktick) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '`') {
                inBacktick = false;
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === '\'') {
            inSingle = true;
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            continue;
        }
        if (ch === '`') {
            inBacktick = true;
            continue;
        }

        if (ch === '{') {
            depth++;
            continue;
        }
        if (ch === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
            if (depth < 0) {
                return -1;
            }
        }
    }

    return -1;
}

function buildQScriptParentContext(source, scriptStart, braceOpen, braceClose) {
    const parentBraceOpen = findNearestOpenBraceBeforeIndex(source, scriptStart);
    let parentTagToken = '';
    if (parentBraceOpen !== -1) {
        parentTagToken = extractTokenBeforeIndex(source, parentBraceOpen);
    }
    if (!parentTagToken) {
        parentTagToken = extractTokenBeforeIndex(source, scriptStart);
    }
    const parsed = parseTagWithClasses(parentTagToken);
    return {
        tag: parsed.base || parentTagToken || '',
        tagToken: parentTagToken || '',
        classes: parsed.classes || [],
        parentBraceOpen,
        qScriptStart: scriptStart,
        qScriptBraceOpen: braceOpen,
        qScriptBraceClose: braceClose
    };
}

function executeQScriptBlock(scriptBody, context, thisArg, hasExplicitThisArg = false) {
    const body = String(scriptBody || '');
    const hostTag = context && context.tag ? context.tag : '';
    const boundThis = hasExplicitThisArg ? thisArg : (context || {});
    let restoreThisContext = null;
    if (hasExplicitThisArg) {
        restoreThisContext = applyQHtmlRuntimeThisContext(thisArg);
    }
    try {
        const fn = new Function(body);
        const result = fn.call(boundThis);
        if (typeof result === 'undefined') {
            componentLogger.warn(hostTag, 'q-script returned undefined; replacing block with empty output.');
            return '';
        }
        if (result == null) {
            return '';
        }
        return String(result);
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        componentLogger.error(hostTag, `q-script execution failed: ${message}`);
        return '';
    } finally {
        if (typeof restoreThisContext === 'function') {
            restoreThisContext();
        }
    }
}

function evaluateQScriptBlocks(input, options = {}) {
    let out = String(input || '');
    const maxPasses = Number(options.maxPasses) > 0 ? Number(options.maxPasses) : 250;
    const topLevelOnly = !!options.topLevelOnly;
    const wrapPrimitiveTopLevel = !!options.wrapPrimitiveTopLevel;
    const hasExplicitThisArg = Object.prototype.hasOwnProperty.call(options, 'thisArg');
    const explicitThisArg = options.thisArg;
    let pass = 0;
    while (pass < maxPasses) {
        let changed = false;
        let pos = 0;
        while (true) {
            const start = findStandaloneKeyword(out, 'q-script', pos);
            if (start === -1) {
                break;
            }
            let open = start + 'q-script'.length;
            while (open < out.length && /\s/.test(out[open])) {
                open++;
            }
            if (out[open] !== '{') {
                pos = start + 'q-script'.length;
                continue;
            }
            const close = findMatchingBraceWithLiterals(out, open);
            if (close === -1) {
                componentLogger.error('', 'q-script block is missing a closing brace.');
                return out;
            }
            const scriptBody = out.slice(open + 1, close);
            const context = buildQScriptParentContext(out, start, open, close);
            if (topLevelOnly && context.parentBraceOpen !== -1) {
                pos = start + 'q-script'.length;
                continue;
            }
            let replacement = executeQScriptBlock(scriptBody, context, explicitThisArg, hasExplicitThisArg);
            if (wrapPrimitiveTopLevel && context.parentBraceOpen === -1) {
                const nextSlice = out.slice(close + 1);
                const prevSlice = out.slice(0, start);
                const nextCharMatch = nextSlice.match(/\S/);
                const prevCharMatch = prevSlice.match(/\S(?=\s*$)/);
                const nextChar = nextCharMatch ? nextCharMatch[0] : '';
                const prevChar = prevCharMatch ? prevCharMatch[0] : '';
                const replacementText = String(replacement == null ? '' : replacement).trim();
                const looksLikeProperty = /^[A-Za-z_][\w\-.]*\s*:/.test(replacementText);
                const shouldWrapAsText = replacementText
                    && !looksLikeQHtmlSnippet(replacementText)
                    && !looksLikeProperty
                    && nextChar !== '{'
                    && prevChar !== ':';
                if (shouldWrapAsText) {
                    replacement = `text { ${replacementText} }`;
                }
            }
            out = out.slice(0, start) + replacement + out.slice(close + 1);
            pos = start + replacement.length;
            changed = true;
        }
        if (!changed) {
            return out;
        }
        pass++;
    }
    componentLogger.warn('', `q-script evaluation stopped after ${maxPasses} passes; unresolved q-script blocks may remain.`);
    return out;
}

function createRuntimeTemplateId(componentId) {
    const base = String(componentId || 'component')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'component';
    qhtmlRuntimeTemplateCounter += 1;
    return `${base}-${qhtmlRuntimeTemplateCounter}`;
}

function indentQHtmlBlock(source, prefix = '  ') {
    return String(source || '')
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n');
}

function buildRuntimeTemplateBlock(templateId, runtimeBlock = '') {
    const attrs = serializeInvocationAttributes({
        id: templateId,
        'qhtml-runtime-template': '1'
    });
    const bodyParts = [attrs];
    if (String(runtimeBlock || '').trim()) {
        bodyParts.push(runtimeBlock);
    }
    return `template {\n${indentQHtmlBlock(bodyParts.join('\n'))}\n}`;
}

function collectRuntimeTemplateRanges(input) {
    const ranges = [];
    let pos = 0;
    while (true) {
        const found = findTagInvocation(input, 'template', pos, { allowClasses: true });
        if (!found) break;
        const body = input.slice(found.braceOpen + 1, found.braceClose);
        const flattened = removeNestedBlocks(body);
        if (/(?:^|\s)qhtml-runtime-template\s*:\s*"1"\s*;?/.test(flattened)) {
            ranges.push({ start: found.braceOpen, end: found.braceClose });
        }
        pos = found.braceClose + 1;
    }
    return ranges;
}

const COMPONENT_SLOTS_RESOLVED_ATTR = 'q-slots-resolved';

function isComponentSlotsResolved(host) {
    if (!host || typeof host.getAttribute !== 'function') {
        return false;
    }
    return String(host.getAttribute(COMPONENT_SLOTS_RESOLVED_ATTR) || '').trim().toLowerCase() === 'true';
}

function warnResolvedComponentSlotApi(host, apiName) {
    const tag = host && host.tagName ? String(host.tagName).toLowerCase() : 'q-component';
    console.warn(`qhtml: ${apiName}() is disabled on <${tag}> because ${COMPONENT_SLOTS_RESOLVED_ATTR}=\"true\".`);
}

function isNodeOwnedByComponentHost(node, host) {
    if (!node || !host || node.nodeType !== 1 || host.nodeType !== 1) {
        return false;
    }
    if (node === host) {
        return true;
    }
    if (typeof host.contains === 'function' && !host.contains(node)) {
        return false;
    }
    if (typeof node.closest === 'function') {
        const owner = node.closest('[q-component]');
        if (owner) {
            return owner === host;
        }
    }
    return true;
}

function findComponentSlotAnchors(host, slotId = '') {
    if (!host || typeof host.querySelectorAll !== 'function') {
        return [];
    }
    const normalized = String(slotId == null ? '' : slotId).trim();
    const anchors = [];
    const selector = '[q-slot-anchor="1"][slot]';
    let candidates = Array.from(host.querySelectorAll(selector));
    if (!candidates.length) {
        candidates = Array.from(host.querySelectorAll('[slot]')).filter((node) => {
            return String(node && node.tagName ? node.tagName : '').toLowerCase() !== 'q-into';
        });
    }
    candidates.forEach((node) => {
        if (!node || typeof node.getAttribute !== 'function') {
            return;
        }
        const currentName = String(node.getAttribute('slot') || '').trim();
        if (!currentName) {
            return;
        }
        if (!normalized || currentName === normalized) {
            anchors.push(node);
        }
    });
    return anchors;
}

function findComponentIntoCarriers(host, slotId = '') {
    if (!host || !host.children) {
        return [];
    }
    const normalized = String(slotId == null ? '' : slotId).trim();
    const carriers = [];
    Array.from(host.children).forEach((node) => {
        if (!node || node.nodeType !== 1) {
            return;
        }
        const tagName = String(node.tagName || '').toLowerCase();
        if (tagName !== 'q-into' && tagName !== 'into') {
            return;
        }
        if (typeof node.hasAttribute === 'function' && node.hasAttribute('q-slot-anchor')) {
            return;
        }
        const currentName = String(node.getAttribute('slot') || '').trim();
        if (!currentName) {
            return;
        }
        if (!normalized || currentName === normalized) {
            carriers.push(node);
        }
    });
    return carriers;
}

function findOwnedComponentSlotAnchors(host, slotId = '') {
    return findComponentSlotAnchors(host, slotId).filter((node) => isNodeOwnedByComponentHost(node, host));
}

function createComponentClassSlotMarker(slotId) {
    const normalized = String(slotId == null ? '' : slotId)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized ? `qhtml-slot-${normalized}` : '';
}

function findComponentClassSlotTargets(host, slotId = '') {
    if (!host || typeof host.querySelectorAll !== 'function') {
        return [];
    }
    const normalizedSlot = String(slotId == null ? '' : slotId).trim().toLowerCase();
    if (!normalizedSlot) {
        return [];
    }
    if (!host.__qhtmlClassSlotTargets || typeof host.__qhtmlClassSlotTargets !== 'object') {
        host.__qhtmlClassSlotTargets = Object.create(null);
    }
    const cached = host.__qhtmlClassSlotTargets[normalizedSlot];
    if (Array.isArray(cached) && cached.length) {
        return cached.filter((node) => !!node && node.isConnected);
    }
    const marker = createComponentClassSlotMarker(normalizedSlot);
    if (!marker) {
        return [];
    }
    const targets = [];
    if (host.classList && host.classList.contains(marker)) {
        targets.push(host);
        host.classList.remove(marker);
    }
    Array.from(host.querySelectorAll('*')).forEach((node) => {
        if (node && node.classList && node.classList.contains(marker)) {
            targets.push(node);
            node.classList.remove(marker);
        }
    });
    host.__qhtmlClassSlotTargets[normalizedSlot] = targets;
    return targets;
}

function parseClassTokensFromSlotCarrier(carrier) {
    const raw = String((carrier && carrier.textContent) || '');
    const tokens = new Set();
    const dotMatches = raw.match(/\.[A-Za-z_][A-Za-z0-9_-]*/g) || [];
    dotMatches.forEach((match) => {
        const token = match.slice(1).trim();
        if (token) {
            tokens.add(token);
        }
    });
    if (!dotMatches.length) {
        raw.split(/[\s,]+/).forEach((piece) => {
            const token = String(piece || '').trim();
            if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
                tokens.add(token);
            }
        });
    }
    return Array.from(tokens);
}

function syncGeneratedComponentClassSlotsFromCarriers(host) {
    if (!host) {
        return;
    }
    const carriers = findComponentIntoCarriers(host);
    carriers.forEach((carrier) => {
        const slotName = String(carrier.getAttribute('slot') || '').trim();
        const normalizedSlot = slotName.toLowerCase();
        if (!slotName) {
            return;
        }
        const targets = findComponentClassSlotTargets(host, normalizedSlot);
        if (!targets.length) {
            return;
        }
        const nextClasses = parseClassTokensFromSlotCarrier(carrier);
        targets.forEach((target) => {
            if (!target || !target.classList) {
                return;
            }
            if (!target.__qhtmlClassSlotApplied || typeof target.__qhtmlClassSlotApplied !== 'object') {
                target.__qhtmlClassSlotApplied = Object.create(null);
            }
            const prev = Array.isArray(target.__qhtmlClassSlotApplied[normalizedSlot])
                ? target.__qhtmlClassSlotApplied[normalizedSlot]
                : [];
            prev.forEach((className) => {
                if (className) {
                    target.classList.remove(className);
                }
            });
            nextClasses.forEach((className) => {
                if (className) {
                    target.classList.add(className);
                }
            });
            target.__qhtmlClassSlotApplied[normalizedSlot] = nextClasses;
        });
    });
}

function cloneNodeList(nodes) {
    return (Array.isArray(nodes) ? nodes : []).map((node) => {
        if (!node || typeof node.cloneNode !== 'function') {
            return null;
        }
        return node.cloneNode(true);
    }).filter(Boolean);
}

function replaceNodeChildren(target, nodes, options = {}) {
    if (!target) {
        return;
    }
    const { consumeFirst = false } = options;
    while (target.firstChild) {
        target.removeChild(target.firstChild);
    }
    (Array.isArray(nodes) ? nodes : []).forEach((node, idx) => {
        if (!node) return;
        const useOriginal = consumeFirst && idx === 0;
        const next = useOriginal ? node : node.cloneNode(true);
        target.appendChild(next);
    });
}

function writeNodesIntoComponentAnchors(host, slotId, nodes) {
    const anchors = findOwnedComponentSlotAnchors(host, slotId);
    if (!anchors.length) {
        return false;
    }
    anchors.forEach((anchor, anchorIdx) => {
        replaceNodeChildren(anchor, nodes, { consumeFirst: anchorIdx === 0 });
    });
    return true;
}

function ensureComponentIntoCarrier(host, slotId) {
    const existing = findComponentIntoCarriers(host, slotId);
    if (existing.length) {
        const carrier = existing[0];
        if (!carrier.getAttribute('q-into-carrier')) {
            carrier.setAttribute('q-into-carrier', '1');
        }
        const rawStyle = String(carrier.getAttribute('style') || '');
        const existingStyle = rawStyle.toLowerCase();
        if (!/display\s*:\s*none/.test(existingStyle)) {
            const normalized = rawStyle.trim();
            const next = normalized
                ? `${normalized}${normalized.endsWith(';') ? '' : ';'} display: none;`
                : 'display: none;';
            carrier.setAttribute('style', next);
        }
        return carrier;
    }
    if (!host || typeof document === 'undefined' || typeof host.appendChild !== 'function') {
        return null;
    }
    const carrier = document.createElement('q-into');
    carrier.setAttribute('slot', String(slotId || '').trim());
    carrier.setAttribute('q-into-carrier', '1');
    carrier.setAttribute('style', 'display: none;');
    host.appendChild(carrier);
    return carrier;
}

function syncGeneratedComponentSlotsFromCarriers(host) {
    if (!host || isComponentSlotsResolved(host)) {
        return;
    }
    const carriers = findComponentIntoCarriers(host);
    carriers.forEach((carrier) => {
        const slotName = String(carrier.getAttribute('slot') || '').trim();
        if (!slotName) {
            return;
        }
        const payload = Array.from(carrier.childNodes || []).map((node) => node.cloneNode(true));
        writeNodesIntoComponentAnchors(host, slotName, payload);
    });
    syncGeneratedComponentClassSlotsFromCarriers(host);
}

function normalizeImplicitContentToSingleSlotCarrier(host, slotName) {
    if (!host || !slotName || isComponentSlotsResolved(host)) {
        return;
    }
    if (findComponentIntoCarriers(host).length) {
        return;
    }
    const payload = Array.from(host.childNodes || []).filter((node) => {
        if (!node) return false;
        if (node.nodeType === 8) return false;
        if (node.nodeType === 3 && !String(node.textContent || '').trim()) return false;
        if (node.nodeType === 1) {
            const el = node;
            if (el.hasAttribute && el.hasAttribute('q-slot-anchor')) return false;
            if (String(el.tagName || '').toLowerCase() === 'q-into') return false;
        }
        return true;
    });
    if (!payload.length) {
        return;
    }
    const carrier = ensureComponentIntoCarrier(host, slotName);
    if (!carrier) {
        return;
    }
    payload.forEach((node) => carrier.appendChild(node));
}

function unwrapNodePreservingChildren(node) {
    if (!node || node.nodeType !== 1 || !node.parentNode) {
        return;
    }
    const parent = node.parentNode;
    while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
}

function resolveComponentSlotsInPlace(host, options = {}) {
    const { warnIfAlreadyResolved = true } = options;
    if (!host || host.nodeType !== 1) {
        return false;
    }
    if (isComponentSlotsResolved(host)) {
        if (warnIfAlreadyResolved) {
            warnResolvedComponentSlotApi(host, 'resolveSlots');
        }
        return true;
    }
    ensureGeneratedComponentTemplateHydrated(host);
    syncGeneratedComponentSlotsFromCarriers(host);
    findComponentIntoCarriers(host).forEach((carrier) => {
        if (carrier && carrier.parentNode === host) {
            host.removeChild(carrier);
        }
    });
    findOwnedComponentSlotAnchors(host).forEach((anchor) => {
        unwrapNodePreservingChildren(anchor);
    });
    host.setAttribute(COMPONENT_SLOTS_RESOLVED_ATTR, 'true');
    return true;
}

function teardownComponentRuntimeInstance(host) {
    if (!host || host.nodeType !== 1) {
        return;
    }
    if (host.__qhtmlActionBindingObserver && typeof host.__qhtmlActionBindingObserver.disconnect === 'function') {
        host.__qhtmlActionBindingObserver.disconnect();
    }
    delete host.__qhtmlActionBindingObserver;

    const signalStore = host.__qhtmlSignalStore;
    if (signalStore && typeof signalStore === 'object') {
        Object.keys(signalStore).forEach((signalName) => {
            const entry = signalStore[signalName];
            const emitter = host[signalName];
            if (emitter && typeof emitter.disconnect === 'function') {
                try {
                    emitter.disconnect();
                } catch {
                    // ignore disconnect failures during teardown
                }
            }
            if (entry && Array.isArray(entry.listeners)) {
                entry.listeners.length = 0;
            }
            if (entry && entry.connectionMap instanceof Map) {
                entry.connectionMap.clear();
            }
            if (entry && entry.handlerKeys instanceof Set) {
                entry.handlerKeys.clear();
            }
            try {
                delete host[signalName];
            } catch {
                // ignore property cleanup failures
            }
        });
    }
    delete host.__qhtmlSignalStore;
}

function countNodeDepth(node) {
    let depth = 0;
    let cursor = node;
    while (cursor && cursor.parentElement) {
        depth += 1;
        cursor = cursor.parentElement;
    }
    return depth;
}

function toTemplateComponentInstance(host, options = {}) {
    const { recursive = false } = options;
    if (!host || host.nodeType !== 1 || typeof document === 'undefined') {
        return [];
    }

    if (recursive && typeof host.querySelectorAll === 'function') {
        const descendants = Array.from(host.querySelectorAll('[q-component]'))
            .filter((node) => node && node.nodeType === 1 && node !== host)
            .sort((a, b) => countNodeDepth(b) - countNodeDepth(a));
        descendants.forEach((node) => {
            if (node && node.parentNode) {
                toTemplateComponentInstance(node, { recursive: false });
            }
        });
    }

    resolveComponentSlotsInPlace(host, { warnIfAlreadyResolved: false });
    teardownComponentRuntimeInstance(host);

    const parent = host.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') {
        return [];
    }
    const insertedNodes = [];
    const fragment = document.createDocumentFragment();
    while (host.firstChild) {
        const child = host.firstChild;
        insertedNodes.push(child);
        fragment.appendChild(child);
    }
    parent.insertBefore(fragment, host);
    if (typeof parent.removeChild === 'function') {
        parent.removeChild(host);
    }
    return insertedNodes;
}

function ensureGeneratedComponentTemplateHydrated(host) {
    if (!host || host.nodeType !== 1 || host.__qhtmlComponentTemplateHydrated || typeof document === 'undefined' || isComponentSlotsResolved(host)) {
        return;
    }
    const componentId = String(host.tagName || '').toLowerCase();
    const templateSource = String(qhtmlGeneratedComponentTemplateCache.get(componentId) || '').trim();
    host.__qhtmlComponentTemplateHydrated = true;
    if (!templateSource) {
        return;
    }
    const anchorTemplate = replaceTemplateSlots(templateSource, new Map(), {
        componentId,
        warnOnMissing: false,
        preserveAnchors: true
    });
    const nodes = parseQHtmlSnippetToNodes(anchorTemplate, host);
    if (!nodes.length) {
        return;
    }
    const frag = document.createDocumentFragment();
    nodes.forEach((node) => frag.appendChild(node));
    host.insertBefore(frag, host.firstChild);
}

function hydrateGeneratedComponentInstances(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return;
    }
    const ids = new Set();
    qhtmlGeneratedComponentTemplateCache.forEach((_, key) => ids.add(key));
    qhtmlGeneratedComponentActionCache.forEach((_, key) => ids.add(key));
    if (!ids.size) {
        return;
    }
    ids.forEach((componentId) => {
        const selector = String(componentId || '').trim();
        if (!selector) {
            return;
        }
        let instances = [];
        try {
            instances = Array.from(root.querySelectorAll(selector));
        } catch {
            instances = [];
        }
        instances.forEach((instance) => {
            if (!instance || instance.nodeType !== 1) {
                return;
            }
            if (!instance.getAttribute('q-component')) {
                instance.setAttribute('q-component', componentId);
            }
            if (!instance.getAttribute('qhtml-component-instance')) {
                instance.setAttribute('qhtml-component-instance', '1');
            }
            if (!isComponentSlotsResolved(instance)) {
                const slotNames = getGeneratedComponentSlotNames(componentId);
                if (slotNames.length === 1) {
                    normalizeImplicitContentToSingleSlotCarrier(instance, slotNames[0]);
                }
                ensureGeneratedComponentTemplateHydrated(instance);
                syncGeneratedComponentSlotsFromCarriers(instance);
            }
            const compiled = qhtmlGeneratedComponentActionCache.get(componentId) || [];
            const actionNames = [];
            compiled.forEach((entry) => {
                const actionName = String(entry && entry.name ? entry.name : '').trim();
                if (!actionName) {
                    return;
                }
                actionNames.push(actionName);
                instance[actionName] = function(...args) {
                    return entry.fn.apply(this, args);
                };
            });
            if (actionNames.length) {
                bindComponentActionsRecursively(instance, actionNames);
                observeComponentActionBinding(instance, actionNames);
            }
        });
    });
}

function listComponentSlotNames(host) {
    if (isComponentSlotsResolved(host)) {
        warnResolvedComponentSlotApi(host, 'slots');
        return [];
    }
    const names = [];
    const seen = new Set();
    findOwnedComponentSlotAnchors(host).forEach((anchor) => {
        const slotName = String(anchor.getAttribute('slot') || '').trim();
        if (!slotName || seen.has(slotName)) {
            return;
        }
        seen.add(slotName);
        names.push(slotName);
    });
    findComponentIntoCarriers(host).forEach((carrier) => {
        const slotName = String(carrier.getAttribute('slot') || '').trim();
        if (!slotName || seen.has(slotName)) {
            return;
        }
        seen.add(slotName);
        names.push(slotName);
    });
    const tagName = host && host.tagName ? String(host.tagName).toLowerCase() : '';
    getGeneratedComponentSlotNames(tagName).forEach((slotName) => {
        if (!slotName || seen.has(slotName)) {
            return;
        }
        seen.add(slotName);
        names.push(slotName);
    });
    return names;
}

function looksLikeQHtmlSnippet(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) {
        return false;
    }
    if (/<[A-Za-z!/]/.test(text)) {
        return false;
    }
    return /[A-Za-z0-9_.-]+\s*\{/.test(text);
}

function parseQHtmlSnippetToNodes(snippet, hostForReady) {
    const qhtml = String(snippet == null ? '' : snippet).trim();
    if (!qhtml) {
        return [];
    }
    const runtimeInput = hostForReady
        ? evaluateQScriptBlocks(qhtml, { topLevelOnly: true, thisArg: hostForReady })
        : evaluateQScriptBlocks(qhtml, { topLevelOnly: true });
    const encoded = encodeQuotedStrings(runtimeInput);
    const adjusted = addClosingBraces(encoded);
    const root = document.createElement('div');
    root.__qhtmlRoot = true;
    root.__qhtmlHost = hostForReady || root;
    const segments = extractPropertiesAndChildren(adjusted);
    segments.forEach((segment) => processSegment(segment, root));
    flushReadyLifecycleHooks(root, hostForReady || root);
    return Array.from(root.childNodes);
}

function normalizeIntoPayloadToNodes(payload, hostForReady) {
    if (payload == null) {
        return [];
    }
    if (typeof payload === 'function') {
        try {
            return normalizeIntoPayloadToNodes(payload.call(hostForReady || null), hostForReady);
        } catch (err) {
            console.error('qhtml: failed to execute into() payload function', err);
            return [];
        }
    }
    if (typeof Node !== 'undefined' && payload instanceof Node) {
        return [payload];
    }
    if (typeof NodeList !== 'undefined' && payload instanceof NodeList) {
        return Array.from(payload);
    }
    if (typeof HTMLCollection !== 'undefined' && payload instanceof HTMLCollection) {
        return Array.from(payload);
    }
    if (Array.isArray(payload)) {
        return payload.flatMap((entry) => normalizeIntoPayloadToNodes(entry, hostForReady));
    }
    const text = String(payload);
    if (!text.trim()) {
        return [];
    }
    if (looksLikeQHtmlSnippet(text)) {
        return parseQHtmlSnippetToNodes(text, hostForReady);
    }
    const container = document.createElement('div');
    container.innerHTML = text;
    return Array.from(container.childNodes);
}

function injectIntoComponentSlot(host, slotId, payload) {
    if (isComponentSlotsResolved(host)) {
        warnResolvedComponentSlotApi(host, 'into');
        return false;
    }
    const normalizedSlot = String(slotId == null ? '' : slotId).trim();
    if (!normalizedSlot) {
        return false;
    }
    ensureGeneratedComponentTemplateHydrated(host);
    const nodes = normalizeIntoPayloadToNodes(payload, host);
    const carrier = ensureComponentIntoCarrier(host, normalizedSlot);
    if (carrier) {
        replaceNodeChildren(carrier, cloneNodeList(nodes));
    }
    const projected = writeNodesIntoComponentAnchors(host, normalizedSlot, nodes) || !!carrier;
    syncGeneratedComponentClassSlotsFromCarriers(host);
    return projected;
}

function signalNameToHandlerProperty(signalName) {
    const name = String(signalName || '').trim();
    if (!name) {
        return '';
    }
    return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function handlerTagToSignalName(tagName) {
    const tag = String(tagName || '').trim();
    if (!/^on[A-Za-z0-9_]+$/.test(tag) || tag.length <= 2) {
        return '';
    }
    const suffix = tag.slice(2);
    return `${suffix.charAt(0).toLowerCase()}${suffix.slice(1)}`;
}

function ensureComponentSignals(host, signalDefs = [], signalHandlers = [], componentId = '') {
    if (!host || (typeof host !== 'object' && typeof host !== 'function')) {
        return;
    }
    if (!host.__qhtmlSignalStore || typeof host.__qhtmlSignalStore !== 'object') {
        host.__qhtmlSignalStore = Object.create(null);
    }
    const store = host.__qhtmlSignalStore;
    const normalizedDefs = (Array.isArray(signalDefs) ? signalDefs : [])
        .map((entry) => ({
            name: String(entry && entry.name ? entry.name : '').trim(),
            params: Array.isArray(entry && entry.params)
                ? entry.params.map((param) => String(param || '').trim()).filter(Boolean)
                : []
        }))
        .filter((entry) => entry.name);

    normalizedDefs.forEach((signalDef) => {
        const signalName = signalDef.name;
        if (!store[signalName]) {
            store[signalName] = {
                name: signalName,
                params: signalDef.params.slice(),
                listeners: [],
                connectionMap: new Map(),
                handlerKeys: new Set(),
                emitter: null
            };
        }
        const entry = store[signalName];
        if (!Array.isArray(entry.listeners)) {
            entry.listeners = [];
        }
        if (!(entry.connectionMap instanceof Map)) {
            entry.connectionMap = new Map();
        }
        if (!(entry.handlerKeys instanceof Set)) {
            entry.handlerKeys = new Set();
        }
        if (signalDef.params.length) {
            entry.params = signalDef.params.slice();
        }

        let signalFn = host[signalName];
        const shouldCreateEmitter = !(
            typeof signalFn === 'function'
            && signalFn.__qhtmlSignalHost === host
            && signalFn.__qhtmlSignalName === signalName
        );

        if (shouldCreateEmitter) {
            signalFn = function(...args) {
                const listeners = Array.isArray(entry.listeners) ? entry.listeners.slice() : [];
                listeners.forEach((listener) => {
                    if (typeof listener !== 'function') {
                        return;
                    }
                    const restoreThisContext = applyQHtmlRuntimeThisContext(host);
                    try {
                        listener.apply(host, args);
                    } catch (err) {
                        componentLogger.error(componentId, `Signal listener for "${signalName}" failed.`);
                    } finally {
                        if (typeof restoreThisContext === 'function') {
                            restoreThisContext();
                        }
                    }
                });

                const handlerProp = signalNameToHandlerProperty(signalName);
                const possibleHandlers = [
                    handlerProp ? host[handlerProp] : null,
                    handlerProp ? host[handlerProp.toLowerCase()] : null
                ];
                const seenHandlers = new Set();
                possibleHandlers.forEach((handler) => {
                    if (typeof handler !== 'function' || seenHandlers.has(handler)) {
                        return;
                    }
                    seenHandlers.add(handler);
                    if (handler === signalFn) {
                        return;
                    }
                    const restoreThisContext = applyQHtmlRuntimeThisContext(host);
                    try {
                        handler.apply(host, args);
                    } catch (err) {
                        componentLogger.error(componentId, `Signal handler "${handlerProp}" failed.`);
                    } finally {
                        if (typeof restoreThisContext === 'function') {
                            restoreThisContext();
                        }
                    }
                });

                if (typeof host.dispatchEvent === 'function') {
                    try {
                        host.dispatchEvent(new CustomEvent(signalName, {
                            detail: {
                                signal: signalName,
                                args: args.slice()
                            }
                        }));
                    } catch (err) {
                        // Ignore dispatch errors for non-EventTarget hosts.
                    }
                }
            };

            signalFn.connect = function(target) {
                if (typeof target !== 'function') {
                    return signalFn;
                }
                if (target === signalFn) {
                    return signalFn;
                }
                if (entry.connectionMap.has(target)) {
                    return signalFn;
                }
                const forwarder = function(...args) {
                    if (typeof target !== 'function') {
                        return;
                    }
                    target(...args);
                };
                entry.connectionMap.set(target, forwarder);
                entry.listeners.push(forwarder);
                return signalFn;
            };

            signalFn.disconnect = function(target) {
                if (typeof target === 'undefined' || target === null) {
                    entry.connectionMap.forEach((forwarder) => {
                        entry.listeners = entry.listeners.filter((listener) => listener !== forwarder);
                    });
                    entry.connectionMap.clear();
                    return signalFn;
                }
                const forwarder = entry.connectionMap.get(target);
                if (!forwarder) {
                    return signalFn;
                }
                entry.listeners = entry.listeners.filter((listener) => listener !== forwarder);
                entry.connectionMap.delete(target);
                return signalFn;
            };

            signalFn.add = function(listener) {
                if (typeof listener !== 'function') {
                    return signalFn;
                }
                if (!entry.listeners.includes(listener)) {
                    entry.listeners.push(listener);
                }
                return signalFn;
            };

            signalFn.remove = function(listener) {
                if (typeof listener !== 'function') {
                    return signalFn;
                }
                entry.listeners = entry.listeners.filter((current) => current !== listener);
                return signalFn;
            };

            signalFn.emit = function(...args) {
                return signalFn(...args);
            };

            signalFn.__qhtmlSignalHost = host;
            signalFn.__qhtmlSignalName = signalName;
            host[signalName] = signalFn;
        }

        entry.emitter = signalFn;
    });

    const normalizedHandlers = (Array.isArray(signalHandlers) ? signalHandlers : [])
        .map((entry) => ({
            signalName: String(entry && entry.signalName ? entry.signalName : '').trim(),
            params: String(entry && entry.params ? entry.params : '').trim(),
            body: String(entry && entry.body ? entry.body : '').trim()
        }))
        .filter((entry) => entry.signalName && entry.body);

    normalizedHandlers.forEach((handlerDef) => {
        const entry = store[handlerDef.signalName];
        if (!entry) {
            return;
        }
        const handlerKey = `${handlerDef.signalName}|${handlerDef.params}|${handlerDef.body}`;
        if (entry.handlerKeys.has(handlerKey)) {
            return;
        }
        try {
            const fn = new Function(handlerDef.params, handlerDef.body);
            const listener = function(...args) {
                const restoreThisContext = applyQHtmlRuntimeThisContext(host);
                try {
                    return fn.apply(host, args);
                } finally {
                    if (typeof restoreThisContext === 'function') {
                        restoreThisContext();
                    }
                }
            };
            entry.listeners.push(listener);
            entry.handlerKeys.add(handlerKey);
        } catch (err) {
            componentLogger.error(componentId, `Failed to compile signal handler for "${handlerDef.signalName}".`);
        }
    });
}

function installGeneratedComponentBaseMethods(ctor) {
    if (!ctor || !ctor.prototype) {
        return;
    }
    if (typeof ctor.prototype.slots !== 'function') {
        ctor.prototype.slots = function() {
            return listComponentSlotNames(this);
        };
    }
    if (typeof ctor.prototype.into !== 'function') {
        ctor.prototype.into = function(slotId, payload) {
            injectIntoComponentSlot(this, slotId, payload);
            return this;
        };
    }
    if (typeof ctor.prototype.resolveSlots !== 'function') {
        ctor.prototype.resolveSlots = function() {
            resolveComponentSlotsInPlace(this);
            return this;
        };
    }
    if (typeof ctor.prototype.toTemplate !== 'function') {
        ctor.prototype.toTemplate = function() {
            return toTemplateComponentInstance(this, { recursive: false });
        };
    }
    if (typeof ctor.prototype.toTemplateRecursive !== 'function') {
        ctor.prototype.toTemplateRecursive = function() {
            return toTemplateComponentInstance(this, { recursive: true });
        };
    }
}

function bindComponentActionsRecursively(root, actionNames) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return;
    }
    const names = (Array.isArray(actionNames) ? actionNames : [])
        .map((name) => String(name || '').trim())
        .filter(Boolean);
    if (!names.length) {
        return;
    }
    const bindOnNode = (node, ownerRoot) => {
        if (!node || node.nodeType !== 1) {
            return;
        }
        names.forEach((actionName) => {
            if (typeof node[actionName] === 'function') {
                return;
            }
            node[actionName] = function(...args) {
                if (ownerRoot && typeof ownerRoot[actionName] === 'function') {
                    return ownerRoot[actionName](...args);
                }
                return undefined;
            };
        });
    };
    bindOnNode(root, root);
    const descendants = root.querySelectorAll('*');
    descendants.forEach((node) => bindOnNode(node, root));
}

function observeComponentActionBinding(root, actionNames) {
    if (!root || typeof root.querySelectorAll !== 'function' || typeof MutationObserver === 'undefined') {
        return;
    }
    const names = (Array.isArray(actionNames) ? actionNames : [])
        .map((name) => String(name || '').trim())
        .filter(Boolean);
    if (!names.length) {
        return;
    }
    bindComponentActionsRecursively(root, names);
    if (root.__qhtmlActionBindingObserver) {
        return;
    }
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (!mutation || mutation.type !== 'childList') {
                return;
            }
            mutation.addedNodes.forEach((node) => {
                if (!node || node.nodeType !== 1) {
                    return;
                }
                names.forEach((actionName) => {
                    if (typeof node[actionName] !== 'function') {
                        node[actionName] = function(...args) {
                            if (typeof root[actionName] === 'function') {
                                return root[actionName](...args);
                            }
                            return undefined;
                        };
                    }
                });
                if (typeof node.querySelectorAll === 'function') {
                    node.querySelectorAll('*').forEach((child) => {
                        names.forEach((actionName) => {
                            if (typeof child[actionName] === 'function') {
                                return;
                            }
                            child[actionName] = function(...args) {
                                if (typeof root[actionName] === 'function') {
                                    return root[actionName](...args);
                                }
                                return undefined;
                            };
                        });
                    });
                }
            });
        });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.__qhtmlActionBindingObserver = observer;
}

function installElementQHtmlGetter() {
    if (typeof Element === 'undefined' || !Element.prototype) {
        return;
    }
    const existing = Object.getOwnPropertyDescriptor(Element.prototype, 'qhtml');
    if (existing) {
        return;
    }
    Object.defineProperty(Element.prototype, 'qhtml', {
        configurable: true,
        enumerable: false,
        get() {
            if (!this || typeof this.getAttribute !== 'function') {
                return null;
            }
            const templateId = this.getAttribute('qhtml-runtime-template-id');
            if (!templateId || typeof document === 'undefined') {
                return null;
            }
            const registry = ensureQHtmlRuntimeRegistry();
            if (registry && registry.byTemplateId && registry.byTemplateId[templateId]) {
                return registry.byTemplateId[templateId];
            }
            const template = document.getElementById(templateId);
            if (!template || String(template.tagName || '').toLowerCase() !== 'template' || !template.content) {
                return null;
            }
            return template.content.firstElementChild || null;
        }
    });
}

function resolveQHtmlTopLevelForNode(node) {
    if (!node || node.nodeType !== 1) {
        return null;
    }
    if (node.qhtml) {
        return node.qhtml;
    }
    if (typeof node.getAttribute === 'function' && node.getAttribute('q-component')) {
        return node;
    }
    if (typeof node.closest === 'function') {
        const owner = node.closest('[q-component]');
        if (owner) {
            return owner.qhtml || owner;
        }
    }
    return node;
}

function queryRuntimeRegistryBySelector(selector, options = {}) {
    const { all = false } = options;
    const registry = ensureQHtmlRuntimeRegistry();
    if (!registry || !registry.byTemplateId) {
        return all ? [] : null;
    }
    const seen = new Set();
    const matches = [];
    const addMatch = (node) => {
        if (!node || node.nodeType !== 1 || seen.has(node)) {
            return;
        }
        seen.add(node);
        matches.push(node);
    };

    const idMatch = String(selector || '').trim().match(/^#([A-Za-z_][\w\-:.]*)$/);
    if (idMatch && registry.byInstanceId) {
        const byId = registry.byInstanceId[idMatch[1]];
        if (byId) {
            addMatch(byId);
            if (!all) {
                return matches[0] || null;
            }
        }
    }

    Object.values(registry.byTemplateId).forEach((node) => {
        if (!node || node.nodeType !== 1 || typeof node.matches !== 'function') {
            return;
        }
        try {
            if (node.matches(selector)) {
                addMatch(node);
            }
        } catch {
            // ignore invalid selectors here; caller already uses native query APIs
        }
    });

    return all ? matches : (matches[0] || null);
}

function installDocumentQHtmlQueryHelpers() {
    if (typeof Document === 'undefined' || !Document.prototype) {
        return;
    }
    if (typeof Document.prototype.queryQHTML !== 'function') {
        Document.prototype.queryQHTML = function(selector) {
            const query = String(selector || '').trim();
            if (!query) return null;
            let liveMatches = [];
            try {
                liveMatches = Array.from(this.querySelectorAll(query));
            } catch {
                return null;
            }
            for (const node of liveMatches) {
                const resolved = resolveQHtmlTopLevelForNode(node);
                if (resolved) {
                    return resolved;
                }
            }
            return queryRuntimeRegistryBySelector(query, { all: false });
        };
    }
    if (typeof Document.prototype.queryQHTMLAll !== 'function') {
        Document.prototype.queryQHTMLAll = function(selector) {
            const query = String(selector || '').trim();
            if (!query) return [];
            const resolved = [];
            const seen = new Set();
            const pushUnique = (node) => {
                if (!node || seen.has(node)) return;
                seen.add(node);
                resolved.push(node);
            };
            let liveMatches = [];
            try {
                liveMatches = Array.from(this.querySelectorAll(query));
            } catch {
                return [];
            }
            liveMatches.forEach((node) => {
                const top = resolveQHtmlTopLevelForNode(node);
                if (top) pushUnique(top);
            });
            const runtimeMatches = queryRuntimeRegistryBySelector(query, { all: true });
            (Array.isArray(runtimeMatches) ? runtimeMatches : []).forEach((node) => pushUnique(node));
            return resolved;
        };
    }
}

function installRuntimeActionProxiesOnPureRoot(pureRoot, componentId) {
    if (!pureRoot || pureRoot.nodeType !== 1) {
        return;
    }
    const key = String(componentId || '').toLowerCase();
    const actions = qhtmlGeneratedComponentActionCache.get(key) || [];
    actions.forEach((entry) => {
        const actionName = String(entry && entry.name ? entry.name : '').trim();
        if (!actionName || typeof pureRoot[actionName] === 'function') {
            return;
        }
        pureRoot[actionName] = function(...args) {
            const runtime = this.qhtml;
            if (runtime && typeof runtime[actionName] === 'function') {
                return runtime[actionName](...args);
            }
            return undefined;
        };
    });
}

function transferRuntimeHostAttributesToPureRoot(runtimeNode, pureRoot) {
    if (!runtimeNode || !pureRoot || runtimeNode.nodeType !== 1 || pureRoot.nodeType !== 1) {
        return;
    }
    const internal = new Set([
        'qhtml-runtime-host',
        'qhtml-runtime-template-id',
        'qhtml-runtime-component',
        'qhtml-component-instance'
    ]);
    Array.from(runtimeNode.attributes || []).forEach((attr) => {
        const name = String(attr && attr.name ? attr.name : '').trim();
        if (!name || internal.has(name)) {
            return;
        }
        const value = String(attr.value || '');
        if (name.toLowerCase() === 'class') {
            mergeClassAttribute(pureRoot, value);
        } else {
            pureRoot.setAttribute(name, value);
        }
    });
}

function finalizeRuntimeComponentHosts(root) {
    if (!root || typeof root.querySelectorAll !== 'function' || typeof document === 'undefined') {
        return;
    }
    const runtimeRegistry = ensureQHtmlRuntimeRegistry();
    let templateContainer = document.getElementById('qhtml-runtime-templates');
    if (!templateContainer) {
        templateContainer = document.createElement('div');
        templateContainer.id = 'qhtml-runtime-templates';
        templateContainer.style.display = 'none';
        (document.body || document.documentElement).appendChild(templateContainer);
    }
    const runtimeHosts = Array.from(root.querySelectorAll('[qhtml-runtime-host="1"][qhtml-runtime-template-id]'));
    runtimeHosts.forEach((runtimeNode) => {
        const templateId = String(runtimeNode.getAttribute('qhtml-runtime-template-id') || '').trim();
        if (!templateId) {
            return;
        }
        const insertionParent = runtimeNode.parentNode;
        const insertionNext = runtimeNode.nextSibling;
        let template = document.getElementById(templateId);
        if (!template || String(template.tagName || '').toLowerCase() !== 'template') {
            template = document.createElement('template');
            template.id = templateId;
        }
        if (!insertionParent) {
            return;
        }

        const runtimeId = String(runtimeNode.getAttribute('id') || '').trim();
        const componentId = String(runtimeNode.getAttribute('qhtml-runtime-component') || runtimeNode.tagName || '').toLowerCase();
        const pureFragment = document.createDocumentFragment();
        const runtimeInstance = runtimeNode;

        if (runtimeRegistry && runtimeRegistry.byTemplateId) {
            runtimeRegistry.byTemplateId[templateId] = runtimeInstance;
        }
        if (runtimeRegistry && runtimeRegistry.byInstanceId && runtimeId) {
            runtimeRegistry.byInstanceId[runtimeId] = runtimeInstance;
        }

        while (template.content.firstChild) {
            template.content.removeChild(template.content.firstChild);
        }
        template.content.appendChild(runtimeInstance);

        while (runtimeInstance.firstChild) {
            pureFragment.appendChild(runtimeInstance.firstChild);
        }

        let firstPureElement = null;
        let cursor = pureFragment.firstChild;
        while (cursor) {
            if (cursor.nodeType === 1) {
                firstPureElement = cursor;
                break;
            }
            cursor = cursor.nextSibling;
        }
        if (firstPureElement) {
            firstPureElement.setAttribute('qhtml-runtime-template-id', templateId);
            transferRuntimeHostAttributesToPureRoot(runtimeInstance, firstPureElement);
            if (runtimeId) {
                firstPureElement.setAttribute('id', runtimeId);
            }
            installRuntimeActionProxiesOnPureRoot(firstPureElement, componentId);
        }

        runtimeInstance.removeAttribute('qhtml-runtime-host');
        runtimeInstance.removeAttribute('qhtml-runtime-template-id');
        runtimeInstance.removeAttribute('qhtml-runtime-component');
        runtimeInstance.removeAttribute('qhtml-component-instance');
        insertionParent.insertBefore(pureFragment, insertionNext);
        templateContainer.appendChild(template);
    });
}

function isValidCustomElementName(name) {
    const normalized = String(name || '').trim();
    if (!normalized) return false;
    if (!normalized.includes('-')) return false;
    if (/[A-Z]/.test(normalized)) return false;
    return /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(normalized);
}

function shouldUseCustomComponentHost(componentId) {
    if (!isValidCustomElementName(componentId)) {
        return false;
    }
    if (typeof window === 'undefined') {
        return false;
    }
    return window.qhtmlCustomComponentHosts === true;
}

function compileGeneratedComponentActions(componentId, actions) {
    const compiled = [];
    (Array.isArray(actions) ? actions : []).forEach((action) => {
        const actionName = String(action && action.name ? action.name : '').trim();
        const actionParams = String(action && action.params ? action.params : '').trim();
        const actionBody = String(action && action.body ? action.body : '').trim();
        if (!actionName) {
            return;
        }
        try {
            const fn = new Function(actionParams, actionBody);
            compiled.push({ name: actionName, fn });
        } catch (err) {
            componentLogger.error(componentId, `Failed to compile component action "${actionName}".`);
        }
    });
    return compiled;
}

function installGeneratedComponentActions(ctor, componentId, actions) {
    if (!ctor || !ctor.prototype) {
        return;
    }
    installGeneratedComponentBaseMethods(ctor);
    const compiled = compileGeneratedComponentActions(componentId, actions);
    qhtmlGeneratedComponentActionCache.set(componentId, compiled);
    compiled.forEach((entry) => {
        ctor.prototype[entry.name] = function(...args) {
            return entry.fn.apply(this, args);
        };
    });
}

function ensureGeneratedCustomElement(componentId, actions, signals = [], signalHandlers = []) {
    if (!isValidCustomElementName(componentId)) {
        return false;
    }
    if (typeof window === 'undefined' || !window.customElements) {
        return false;
    }
    const existing = window.customElements.get(componentId);
    if (existing) {
        installGeneratedComponentActions(existing, componentId, actions);
        return true;
    }
    class GeneratedQHtmlComponent extends HTMLElement {
        connectedCallback() {
            if (!isComponentSlotsResolved(this)) {
                const slotNames = getGeneratedComponentSlotNames(componentId);
                if (slotNames.length === 1) {
                    normalizeImplicitContentToSingleSlotCarrier(this, slotNames[0]);
                }
                ensureGeneratedComponentTemplateHydrated(this);
                syncGeneratedComponentSlotsFromCarriers(this);
            }
            const componentSignals = getGeneratedComponentSignals(componentId);
            const componentSignalHandlers = getGeneratedComponentSignalHandlers(componentId);
            ensureComponentSignals(this, componentSignals, componentSignalHandlers, componentId);
            const actionNames = (qhtmlGeneratedComponentActionCache.get(componentId) || [])
                .map((entry) => String(entry && entry.name ? entry.name : '').trim())
                .filter(Boolean);
            if (actionNames.length) {
                bindComponentActionsRecursively(this, actionNames);
                observeComponentActionBinding(this, actionNames);
            }
        }
    }
    GeneratedQHtmlComponent.__qhtmlGeneratedComponent = true;
    window.customElements.define(componentId, GeneratedQHtmlComponent);
    const ctor = window.customElements.get(componentId);
    installGeneratedComponentActions(ctor, componentId, actions);
    return true;
}

/**
 * Add a trailing semicolon to property definitions missing one.  Properties
 * are expressed as `name: "value"` pairs; this helper ensures they are
 * terminated properly for downstream parsing.
 *
 * @param {string} input Raw qhtml text
 * @returns {string} The input with semicolons appended to property lines
 */
function stripBlockComments(input) {
    let result = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let isEscaped = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const next = input[i + 1];

        if (!inSingleQuote && !inDoubleQuote && ch === '/' && next === '*') {
            i += 2;
            while (i < input.length) {
                if (input[i] === '*' && input[i + 1] === '/') {
                    i += 1;
                    break;
                }
                i++;
            }
            continue;
        }

        result += ch;

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (ch === '\\') {
            isEscaped = true;
            continue;
        }

        if (ch === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }

        if (ch === '\'' && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
        }
    }

    return result;
}

function addSemicolonToProperties(input) {
    const regex = /(\w+)\s*:\s*("[^"]*")(?!;)/g;
    return input.replace(regex, "$1: $2;");
}

/**
 * Legacy compatibility no-op for backtick preprocessing.
 * Backtick-enclosed content is no longer evaluated as JavaScript.
 *
 * @param {string} input The qhtml text
 * @returns {string} The input unchanged
 */
function replaceBackticksWithQuotes(input) {
    return String(input == null ? '' : input);
}

/**
 * URI-encode quoted segments within the qhtml.  This protects values that
 * contain special characters from interfering with parser logic.  At the
 * end of parsing the encoded values are decoded back to their original
 * representation.
 *
 * @param {string} qhtml The raw qhtml markup
     * @returns {string} The qhtml with quoted contents encoded
 */
function encodeQuotedStrings(qhtml) {
    const regex = /"{1}([^\"]*)"{1}/mg;
    return qhtml.replace(regex, (match, p1) => `"${encodeURIComponent(p1)}"`);
}

function decodeEncodedStringIfNeeded(value) {
    const text = String(value == null ? '' : value);
    if (!/%[0-9A-Fa-f]{2}/.test(text)) {
        return text;
    }
    return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (chunk) => {
        try {
            return decodeURIComponent(chunk);
        } catch {
            return chunk;
        }
    });
}

function decodeEncodedDomTree(node) {
    if (!node) {
        return;
    }
    const queue = [node];
    while (queue.length) {
        const current = queue.shift();
        if (!current) {
            continue;
        }
        if (current.nodeType === 1) {
            const attrs = Array.from(current.attributes || []);
            attrs.forEach((attr) => {
                const name = String(attr && attr.name ? attr.name : '');
                if (!name) {
                    return;
                }
                const raw = String(attr.value || '');
                const decoded = decodeEncodedStringIfNeeded(raw);
                if (decoded !== raw) {
                    current.setAttribute(name, decoded);
                }
            });
        } else if (current.nodeType === 3) {
            const raw = String(current.textContent || '');
            const decoded = decodeEncodedStringIfNeeded(raw);
            if (decoded !== raw) {
                current.textContent = decoded;
            }
        }
        if (current.childNodes && current.childNodes.length) {
            queue.push(...Array.from(current.childNodes));
        }
    }
}

/**
 * Add missing closing braces to a qhtml string.  This function walks the
 * input and tracks nesting depth; if a closing brace is encountered when
 * depth would underflow, a closing brace is added.  At the end, any
 * unmatched opening braces are closed.
 *
 * @param {string} input Raw qhtml
 * @returns {string} qhtml with balanced braces
 */
function addClosingBraces(input) {
    let depth = 0;
    let result = '';
    for (let i = 0; i < input.length; i++) {
        if (input[i] === '{') {
            depth++;
        } else if (input[i] === '}') {
            depth--;
            if (depth < 0) {
                result += '} '.repeat(-depth);
                depth = 0;
            }
        }
        result += input[i];
    }
    return result + '} '.repeat(depth);
}

/**
 * Find the index of the matching closing brace for the opening brace at
 * `openIdx`.  Nested braces are properly tracked.  Returns -1 if no match
 * is found.
 *
 * @param {string} str Input string containing braces
 * @param {number} openIdx Index of an opening brace
 * @returns {number} Index of the matching closing brace or -1
 */
function findMatchingBrace(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Remove specific top-level properties from a qhtml component definition.  Only
 * properties at the root of the block (not nested within child blocks) are
 * considered.
 *
 * @param {string} blockContent The content of a component block
 * @param {string[]} propNames Names of properties to remove
 * @returns {string} The block content with specified properties removed
 */
function stripTopLevelProps(blockContent, propNames) {
    if (!propNames || propNames.length === 0) {
        return blockContent;
    }
    const nameSet = new Set(propNames);
    let result = '';
    let depth = 0;
    let i = 0;
    while (i < blockContent.length) {
        const ch = blockContent[i];
        if (ch === '{') {
            depth++;
            result += ch;
            i++;
            continue;
        }
        if (ch === '}') {
            depth = Math.max(0, depth - 1);
            result += ch;
            i++;
            continue;
        }
        if (depth > 0) {
            result += ch;
            i++;
            continue;
        }
        const match = blockContent.slice(i).match(/^\s*([a-zA-Z_][\w\-.]*)\s*:/);
        if (match) {
            const [full, name] = match;
            if (nameSet.has(name)) {
                let j = i + full.length;
                while (j < blockContent.length && /\s/.test(blockContent[j])) j++;
                if (blockContent[j] === '"') {
                    j++;
                    while (j < blockContent.length) {
                        if (blockContent[j] === '"' && blockContent[j - 1] !== '\\') {
                            j++;
                            break;
                        }
                        j++;
                    }
                }
                while (j < blockContent.length && /\s/.test(blockContent[j])) j++;
                if (blockContent[j] === ';') j++;
                i = j;
                continue;
            }
        }
        result += ch;
        i++;
    }
    return result.trim();
}

/**
 * Escape a string for safe inclusion in a regular expression.
 *
 * @param {string} s The string to escape
 * @returns {string} The escaped string
 */
function escapeReg(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find an invocation of a component tag (e.g. `<my-tag> { ... }`) within a
 * larger qhtml string.  Returns null if no invocation is found.  This
 * respects quoting and nested braces.
 *
 * @param {string} str The qhtml string
 * @param {string} id The tag name to search for
 * @param {number} fromIndex An optional start index for the search
 * @returns {object|null} An object containing the indices of the tag start,
 *                        opening brace and closing brace
 */
function findTagInvocation(str, id, fromIndex, options = {}) {
    const { allowClasses = false } = options;
    const pattern = allowClasses
        ? `(^|[^\\w-])(${escapeReg(id)}(?:\\.[A-Za-z0-9_-]+)*)\\s*\\{`
        : `(^|[^\\w-])(${escapeReg(id)})\\s*\\{`;
    const re = new RegExp(pattern, 'g');
    re.lastIndex = fromIndex || 0;
    const m = re.exec(str);
    if (!m) return null;
    const braceOpen = m.index + m[0].lastIndexOf('{');
    const tagStart = m.index + (m[1] ? 1 : 0);
    const braceClose = findMatchingBrace(str, braceOpen);
    if (braceClose === -1) return null;
    return { tagStart, braceOpen, braceClose, tagToken: m[2] };
}

/**
 * Split a qhtml component invocation body into top-level segments.  A segment
 * corresponds to either a child element (e.g. `div { ... }`) or a property
 * assignment.  Nested blocks within segments are not considered.
 *
 * @param {string} body The content inside a component invocation
 * @returns {Array<{tag: string, block: string, start: number}>} An array of child element descriptors
 */
function splitTopLevelSegments(body) {
    const segs = [];
    let i = 0;
    while (i < body.length) {
        while (i < body.length && /\s/.test(body[i])) i++;
        if (i >= body.length) break;
        let j = i;
        while (j < body.length && !/[{:]/.test(body[j])) j++;
        const token = body.slice(i, j).trim();
        if (!token) break;
        if (body[j] === '{') {
            const open = j;
            const close = findMatchingBrace(body, open);
            if (close === -1) break;
            const block = `${token} ${body.slice(open, close + 1)}`;
            segs.push({ tag: token, block, start: i, braceOpen: open, braceClose: close });
            i = close + 1;
        } else {
            const semi = body.indexOf(';', j);
            if (semi === -1) break;
            i = semi + 1;
        }
    }
    return segs;
}

/**
 * Remove nested blocks from a qhtml string and return only the top-level
 * characters.  Used when searching for slot names within a block.
 *
 * @param {string} str The string to flatten
 * @returns {string} The flattened string
 */
function removeNestedBlocks(str) {
    let out = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{') { depth++; continue; }
        if (ch === '}') { depth--; continue; }
        if (depth === 0) out += ch;
    }
    return out;
}

function extractSlotNameFromBlock(inner, options = {}) {
    const { componentId = '', componentIds = [] } = options;
    const resolvedInner = evaluateQScriptBlocks(inner, { topLevelOnly: true });
    const flattened = removeNestedBlocks(resolvedInner);
    if (/(?:^|\s)(?:id|name)\s*:\s*"[^"]+"\s*;?/.test(flattened)) {
        componentLogger.error(componentId, 'Legacy slot syntax is no longer supported. Use `slot { slot-name }`.');
        return '';
    }
    const shorthandMatch = flattened.match(/^\s*([A-Za-z0-9_-]+)\s*;?\s*$/);
    const slotName = shorthandMatch ? shorthandMatch[1] : '';
    if (!slotName && flattened.trim()) {
        componentLogger.error(componentId, 'Invalid slot syntax. Expected `slot { slot-name }`.');
        return '';
    }
    if (slotName && componentIds.length && componentIds.includes(slotName)) {
        componentLogger.error(componentId, `cannot name slots the same as components ("${slotName}").`);
        return '';
    }
    return slotName;
}

function resolveQImportPath(block, componentId) {
    const brace = block.indexOf('{');
    if (brace === -1) {
        componentLogger.warn(componentId, 'q-import is missing an opening brace.');
        return '';
    }
    const close = findMatchingBrace(block, brace);
    if (close === -1) {
        componentLogger.warn(componentId, 'q-import is missing a closing brace.');
        return '';
    }
    const inner = block.slice(brace + 1, close);
    const flattened = removeNestedBlocks(inner);
    let path = flattened.trim();
    if (path.endsWith(';')) {
        path = path.slice(0, -1).trim();
    }
    if (!path) {
        componentLogger.warn(componentId, 'q-import has no path.');
        return '';
    }
    if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith('\'') && path.endsWith('\''))) {
        componentLogger.warn(componentId, 'q-import path must be raw text, not quoted.');
        return '';
    }
    return path;
}

function resolveQImportUrl(path) {
    if (typeof window === 'undefined' || !window.location) {
        return path;
    }
    try {
        if (path.startsWith('/')) {
            return `${window.location.origin}${path}`;
        }
        return new URL(path, window.location.href).toString();
    } catch (err) {
        return path;
    }
}

const qImportSourceCache = new Map();
const qImportInFlight = new Map();

function ensureQImportResolveState(state) {
    const next = state || {};
    if (typeof next.count !== 'number') {
        next.count = 0;
    }
    if (typeof next.limit !== 'number') {
        next.limit = 100;
    }
    if (typeof next.warned !== 'boolean') {
        next.warned = false;
    }
    return next;
}

async function resolveQImportSourceFromUrl(url) {
    if (qImportSourceCache.has(url)) {
        return qImportSourceCache.get(url);
    }
    if (qImportInFlight.has(url)) {
        return qImportInFlight.get(url);
    }

    const loadPromise = (async () => {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                componentLogger.warn('', `q-import failed to load "${url}" (${resp.status}).`);
                qImportSourceCache.set(url, '');
                return '';
            }

            const text = await resp.text();
            if (/<\s*q-html/i.test(text)) {
                componentLogger.warn('', `q-import rejected "${url}" because it contains <q-html>.`);
                qImportSourceCache.set(url, '');
                return '';
            }
            qImportSourceCache.set(url, text);
            return text;
        } catch (err) {
            componentLogger.warn('', `q-import failed to load "${url}".`);
            qImportSourceCache.set(url, '');
            return '';
        }
    })();

    qImportInFlight.set(url, loadPromise);
    try {
        return await loadPromise;
    } finally {
        qImportInFlight.delete(url);
    }
}

async function resolveQImportFromUrl(url, state) {
    const source = await resolveQImportSourceFromUrl(url);
    if (!source) {
        return '';
    }
    return resolveQImports(source, state);
}

async function resolveQImports(input, state = null) {
    const runtimeState = ensureQImportResolveState(state);
    let out = input;
    let pos = 0;
    while (true) {
        const found = findTagInvocation(out, 'q-import', pos);
        if (!found) break;

        const block = out.slice(found.tagStart, found.braceClose + 1);
        let replacement = '';

        if (runtimeState.count >= runtimeState.limit) {
            if (!runtimeState.warned) {
                componentLogger.warn('', `q-import limit reached (${runtimeState.limit}); remaining imports skipped.`);
                runtimeState.warned = true;
            }
        } else {
            runtimeState.count += 1;
            const path = resolveQImportPath(block, '');
            if (path) {
                const url = resolveQImportUrl(path);
                replacement = await resolveQImportFromUrl(url, runtimeState);
            }
        }

        out = out.slice(0, found.tagStart) + replacement + out.slice(found.braceClose + 1);
        pos = found.tagStart + replacement.length;
    }
    return out;
}

/**
 * Collect ranges of component invocations so nested structures can be
 * excluded from into resolution.
 *
 * @param {string} input The qhtml string to scan
 * @param {string[]} componentIds Known component tags
 * @returns {Array<{start: number, end: number}>} Invocation ranges
 */
function collectComponentInvocationRanges(input, componentIds) {
    const ranges = [];
    componentIds.forEach((id) => {
        let pos = 0;
        while (true) {
            const found = findTagInvocation(input, id, pos, { allowClasses: true });
            if (!found) break;
            ranges.push({ start: found.braceOpen, end: found.braceClose });
            pos = found.braceClose + 1;
        }
    });
    return ranges;
}

function isIndexInsideRanges(index, ranges) {
    for (const range of ranges) {
        if (index >= range.start && index <= range.end) {
            return true;
        }
    }
    return false;
}

/**
 * Collect slot definitions within a component template, tracking which slots
 * live directly on the component versus inside sub-component invocations.
 *
 * @param {string} template Component template text
 * @param {string[]} componentIds Known component tags
 * @returns {{directSlots: Map<string, number>, subcomponentSlots: Map<string, number>, slotNames: Set<string>}}
 */
function collectTemplateSlotDefinitions(template, componentIds, componentId = '') {
    const directSlots = new Map();
    const subcomponentSlots = new Map();
    const slotNames = new Set();
    const subcomponentRanges = collectComponentInvocationRanges(template, componentIds);

    let pos = 0;
    while (true) {
        const idx = findStandaloneKeyword(template, 'slot', pos);
        if (idx === -1) break;
        let cursor = idx + 4;
        while (cursor < template.length && /\s/.test(template[cursor])) cursor++;
        if (template[cursor] !== '{') {
            pos = idx + 4;
            continue;
        }
        const open = cursor;
        const close = findMatchingBrace(template, open);
        if (close === -1) break;
        const inner = template.slice(open + 1, close);
        const slotName = extractSlotNameFromBlock(inner, { componentId, componentIds });
        if (slotName) {
            slotNames.add(slotName);
            const target = isIndexInsideRanges(idx, subcomponentRanges) ? subcomponentSlots : directSlots;
            target.set(slotName, (target.get(slotName) || 0) + 1);
        }
        pos = close + 1;
    }
    return { directSlots, subcomponentSlots, slotNames };
}

/**
 * Parse an into block into an IntoNode-like descriptor for projection.
 *
 * @param {string} block The full into { ... } block
 * @param {string} componentId Component context for logging
 * @returns {{targetSlot: string, children: string, position: number}|null}
 */
function parseIntoBlock(block, componentId, position) {
    const brace = block.indexOf('{');
    if (brace === -1) {
        componentLogger.error(componentId, 'Into block is missing an opening brace.');
        return null;
    }
    const close = findMatchingBrace(block, brace);
    if (close === -1) {
        componentLogger.error(componentId, 'Into block is missing a closing brace.');
        return null;
    }
    const inner = block.slice(brace + 1, close);
    const resolvedInner = evaluateQScriptBlocks(inner, { topLevelOnly: true });
    const flattened = removeNestedBlocks(resolvedInner);
    const re = /([a-zA-Z_][\w\-.]*)\s*:\s*"([^"]+)"\s*;?/g;
    const props = [];
    let match;
    while ((match = re.exec(flattened))) {
        props.push({ property: match[1], value: match[2] });
    }
    const illegalTargets = props.filter((prop) => prop.property.endsWith('.slot'));
    if (illegalTargets.length) {
        componentLogger.error(componentId, `Into block attempted to inject into non-slot target "${illegalTargets[0].property}".`);
        return null;
    }
    const slotProps = props.filter((prop) => prop.property === 'slot');
    if (!slotProps.length) {
        componentLogger.error(componentId, 'Into block is missing required slot attribute.');
        return null;
    }
    if (slotProps.length > 1) {
        componentLogger.error(componentId, 'Into block has multiple slot targets; slot must be unique.');
        return null;
    }
    const slotName = slotProps[0].value.trim();
    if (!slotName) {
        componentLogger.error(componentId, 'Into block slot attribute is empty.');
        return null;
    }
    if (slotName.includes('.')) {
        componentLogger.error(componentId, `Into block attempted to inject into non-slot target "${slotName}".`);
        return null;
    }

    // IntoNode shape: { targetSlot, children }
    const cleaned = stripTopLevelProps(resolvedInner, ['slot']).trim();
    return { targetSlot: slotName, children: cleaned, position };
}

/**
 * Collect into blocks that apply to the current component instance. Into
 * blocks nested inside other component invocations are ignored so resolution
 * follows the nearest enclosing component instance.
 *
 * @param {string} body Invocation body to scan
 * @param {string[]} componentIds Known component tags
 * @param {string} componentId Component context for logging
 * @returns {Array<{targetSlot: string, children: string, position: number}>}
 */
function collectIntoNodes(body, componentIds, componentId) {
    const nodes = [];
    const componentRanges = collectComponentInvocationRanges(body, componentIds);
    let pos = 0;
    while (true) {
        const found = findTagInvocation(body, 'into', pos);
        if (!found) break;
        if (!isIndexInsideRanges(found.tagStart, componentRanges)) {
            const block = body.slice(found.tagStart, found.braceClose + 1);
            const node = parseIntoBlock(block, componentId, found.tagStart);
            if (node) nodes.push(node);
        }
        pos = found.braceClose + 1;
    }
    return nodes;
}

function hasTopLevelIntoBlock(body, componentIds) {
    const componentRanges = collectComponentInvocationRanges(body, componentIds);
    let pos = 0;
    while (true) {
        const found = findTagInvocation(body, 'into', pos);
        if (!found) break;
        if (!isIndexInsideRanges(found.tagStart, componentRanges)) {
            return true;
        }
        pos = found.braceClose + 1;
    }
    return false;
}

/**
 * Resolve an into target against a component's slot definitions. Resolution
 * prefers direct slots on the component, then slots declared inside
 * sub-component invocations.
 *
 * @param {string} slotName The slot requested by into
 * @param {{directSlots: Map<string, number>, subcomponentSlots: Map<string, number>}} slotInfo
 * @param {string} componentId Component context for logging
 * @returns {string|null} The resolved slot name or null on error
 */
function resolveIntoSlotTarget(slotName, slotInfo, componentId) {
    const directCount = slotInfo.directSlots.get(slotName) || 0;
    const nestedCount = slotInfo.subcomponentSlots.get(slotName) || 0;

    if (directCount > 1) {
        componentLogger.error(componentId, `Into target slot "${slotName}" is ambiguous; multiple direct slot matches found.`);
        return null;
    }
    if (directCount === 1) {
        return slotName;
    }
    if (nestedCount > 1) {
        componentLogger.error(componentId, `Into target slot "${slotName}" is ambiguous; multiple sub-component slot matches found.`);
        return null;
    }
    if (nestedCount === 1) {
        return slotName;
    }
    componentLogger.error(componentId, `Into target slot "${slotName}" was not found.`);
    return null;
}

function shouldMarkComponentSegment(tag) {
    if (!tag) return false;
    const { base } = parseTagWithClasses(tag);
    const lower = base.trim().toLowerCase();
    if (!lower) return false;
    if (lower === 'html' || lower === 'text' || lower === 'css' || lower === 'style' || lower === 'slot' || lower === 'into') {
        return false;
    }
    if (/^on[a-z0-9_]+$/.test(lower)) {
        return false;
    }
    return true;
}

function addComponentOriginMarkers(source, componentId, options = {}) {
    if (!componentId || !source) return source;
    const {
        classes = [],
        rootAttributes = {},
        actions = []
    } = options;
    const segments = splitTopLevelSegments(source);
    if (!segments.length) return source;
    const primarySegmentIndex = segments.findIndex((seg) => shouldMarkComponentSegment(seg.tag));
    let out = source;
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        if (!shouldMarkComponentSegment(seg.tag)) continue;
        const open = seg.braceOpen;
        const close = seg.braceClose;
        if (open == null || close == null) continue;
        const inner = out.slice(open + 1, close);
        const flattened = removeNestedBlocks(inner);
        const insertionLines = [];
        if (!/(?:^|\s)q-component\s*:/.test(flattened)) {
            insertionLines.push(`q-component: "${componentId}";`);
        }
        if (classes && classes.length) {
            insertionLines.push(`class: "${classes.join(' ')}";`);
        }
        const readyLines = [];
        if (i === primarySegmentIndex) {
            const projectedAttrs = serializeInvocationAttributes(rootAttributes || {});
            if (projectedAttrs.trim()) {
                insertionLines.push(projectedAttrs);
            }
            Object.entries(rootAttributes || {}).forEach(([name, value]) => {
                const attrName = String(name || '').trim();
                if (!attrName) return;
                const attrValue = String(value == null ? '' : value);
                if (attrName.toLowerCase() === 'class') {
                    readyLines.push(`this.setAttribute('class', [this.getAttribute('class') || '', ${JSON.stringify(attrValue)}].join(' ').trim());`);
                } else {
                    readyLines.push(`this.setAttribute(${JSON.stringify(attrName)}, ${JSON.stringify(attrValue)});`);
                }
            });
            (Array.isArray(actions) ? actions : []).forEach((action) => {
                const actionName = String(action && action.name ? action.name : '').trim();
                if (!actionName) return;
                const actionParams = String(action && action.params ? action.params : '').trim();
                const actionBody = String(action && action.body ? action.body : '').trim();
                readyLines.push(`this[${JSON.stringify(actionName)}] = function(${actionParams}) {`);
                if (actionBody) {
                    actionBody.split('\n').forEach((line) => {
                        readyLines.push(line);
                    });
                }
                readyLines.push('};');
            });
            const actionNames = (Array.isArray(actions) ? actions : [])
                .map((action) => String(action && action.name ? action.name : '').trim())
                .filter(Boolean);
            if (actionNames.length) {
                readyLines.push(`bindComponentActionsRecursively(this, ${JSON.stringify(actionNames)});`);
                readyLines.push(`observeComponentActionBinding(this, ${JSON.stringify(actionNames)});`);
            }
        }
        if (!insertionLines.length && !readyLines.length) continue;
        let insertion = '';
        if (insertionLines.length) {
            insertion += `\n    ${insertionLines.join('\n    ')}`;
        }
        if (readyLines.length) {
            insertion += `\n    onReady {\n${readyLines.map((line) => `      ${line}`).join('\n')}\n    }`;
        }
        out = out.slice(0, open + 1) + insertion + out.slice(open + 1);
    }
    return out;
}

/**
 * Replace slot placeholders in a component/template body with content provided
 * via `slotMap`.  Slot placeholders have the form `slot { slotName }`.
 * When `preserveAnchors` is true, placeholders become stable slot-anchor
 * nodes; otherwise replacement emits pure content with no slot trace marker.
 *
 * @param {string} template The template containing slot placeholders
 * @param {Map<string, string>} slotMap Mapping of slot names to replacement content
 * @returns {string} The template with slot placeholders replaced
 */
function replaceTemplateSlots(template, slotMap, options = {}) {
    const { componentId = '', warnOnMissing = true, preserveAnchors = true } = options;
    const consumedSlots = new Set();
    let result = template;
    let pos = 0;
    while (true) {
        const s = findStandaloneKeyword(result, 'slot', pos);
        if (s === -1) break;
        let k = s + 4;
        while (k < result.length && /\s/.test(result[k])) k++;
        if (result[k] !== '{') { pos = s + 4; continue; }
        const open = k;
        const close = findMatchingBrace(result, open);
        if (close === -1) break;
        const inner = result.slice(open + 1, close);
        const slotName = extractSlotNameFromBlock(inner);
        const hasReplacement = slotName && slotMap.has(slotName);
        if (!hasReplacement && slotName && warnOnMissing) {
            componentLogger.warn(componentId, `No content provided for slot "${slotName}".`);
        }
        const beforeChar = s > 0 ? result[s - 1] : '';
        const isDotSlotPlaceholder = beforeChar === '.';
        let replacement = '';
        if (slotName) {
            const escapedSlotName = escapeQHtmlPropString(slotName);
            const slotContent = hasReplacement ? slotMap.get(slotName) : '';
            if (preserveAnchors && !isDotSlotPlaceholder) {
                replacement = [
                    `q-into {`,
                    `  slot: "${escapedSlotName}";`,
                    `  q-slot-anchor: "1";`,
                    slotContent,
                    `}`
                ].join('\n');
            } else if (preserveAnchors && isDotSlotPlaceholder) {
                replacement = hasReplacement
                    ? slotContent || ''
                    : createComponentClassSlotMarker(slotName);
            } else {
                replacement = slotContent || '';
            }
            consumedSlots.add(slotName);
        } else if (hasReplacement) {
            replacement = slotMap.get(slotName);
        }
        result = result.slice(0, s) + replacement + result.slice(close + 1);
        pos = s + replacement.length;
    }
    if (componentId) {
        for (const [slotName] of slotMap) {
            if (!consumedSlots.has(slotName)) {
                componentLogger.warn(componentId, `Slot content was supplied for "${slotName}" but the template does not contain a matching placeholder.`);
            }
        }
    }
    return result;
}

/**
 * Collect the names of all slot placeholders defined within a component
 * template.  The placeholders have the form `slot { slotName }`.
 *
 * @param {string} template Component template text
 * @returns {Set<string>} A set of slot names referenced in the template
 */
function collectTemplateSlotNames(template) {
    const names = new Set();
    let pos = 0;
    while (true) {
        const idx = findStandaloneKeyword(template, 'slot', pos);
        if (idx === -1) break;
        let cursor = idx + 4;
        while (cursor < template.length && /\s/.test(template[cursor])) cursor++;
        if (template[cursor] !== '{') {
            pos = idx + 4;
            continue;
        }
        const open = cursor;
        const close = findMatchingBrace(template, open);
        if (close === -1) break;
        const inner = template.slice(open + 1, close);
        const slotName = extractSlotNameFromBlock(inner);
        if (slotName) {
            names.add(slotName);
        }
        pos = close + 1;
    }
    return names;
}

/**
 * Detect legacy top-level slot directives in a component invocation child
 * block. Legacy directives are any property assignment whose name is `slot`
 * or terminates with `.slot`.
 *
 * @param {string} block Component invocation block
 * @returns {{property: string, value: string}|null} The first legacy directive found
 */
function findTopLevelLegacySlotDirective(block) {
    const brace = block.indexOf('{');
    if (brace === -1) return null;
    const inner = block.slice(brace + 1, block.lastIndexOf('}'));
    const flattened = removeNestedBlocks(inner);
    const re = /([a-zA-Z_][\w\-.]*)\s*:\s*"([^"]+)"\s*;?/g;
    let match;
    while ((match = re.exec(flattened))) {
        const propName = match[1];
        if (propName === 'slot' || propName.endsWith('.slot')) {
            return { property: propName, value: match[2] };
        }
    }
    return null;
}

/**
 * Collect top-level invocation attributes from a component instance body.
 * Slot directives are excluded.
 *
 * @param {string} body Component invocation body (inside braces)
 * @returns {Object<string, string>} Attribute map from property name to value
 */
function extractTopLevelInvocationAttributes(body) {
    const flattened = removeNestedBlocks(body);
    const attributes = {};
    const re = /([a-zA-Z_][\w\-.]*)\s*:\s*"([^"]*)"\s*;?/g;
    let match;
    while ((match = re.exec(flattened))) {
        const propName = match[1];
        if (propName === 'slot' || propName.endsWith('.slot')) {
            continue;
        }
        if (propName === 'qhtml-component-instance') {
            continue;
        }
        attributes[propName] = match[2];
    }
    return attributes;
}

function escapeQHtmlPropString(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

function serializeInvocationAttributes(attributes) {
    const lines = [];
    Object.entries(attributes || {}).forEach(([name, value]) => {
        const prop = String(name || '').trim();
        if (!prop) return;
        lines.push(`${prop}: "${escapeQHtmlPropString(value)}";`);
    });
    return lines.join('\n');
}

/**
 * Parse a q-signal parameter list into validated identifier tokens.
 *
 * @param {string} source Comma-separated parameter identifiers
 * @param {string} componentId Component id for diagnostics
 * @param {string} signalName Signal id for diagnostics
 * @returns {string[]} Parameter names
 */
function parseSignalParameterList(source, componentId = '', signalName = '') {
    const raw = String(source || '').trim();
    if (!raw) {
        return [];
    }
    const params = [];
    raw.split(',').map((item) => String(item || '').trim()).forEach((paramName) => {
        if (!paramName) {
            return;
        }
        if (!/^[A-Za-z_$][\w$]*$/.test(paramName)) {
            componentLogger.warn(componentId, `Signal "${signalName}" ignores invalid parameter "${paramName}".`);
            return;
        }
        if (!params.includes(paramName)) {
            params.push(paramName);
        }
    });
    return params;
}

/**
 * Extract top-level q-signal declarations from a component body.
 *
 * Supported syntax:
 *   q-signal stateChanged(newState)
 *   q-signal stateChanged(newState);
 *
 * @param {string} inner Component inner body text (without outer braces)
 * @param {string} componentId Component id for diagnostics
 * @returns {{template: string, signals: Array<{name: string, params: string[]}>}}
 */
function extractComponentSignalsAndTemplate(inner, componentId = '') {
    const source = String(inner || '');
    const signals = [];
    const removals = [];
    const seen = new Set();

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if ((inSingle || inDouble || inBacktick) && ch === '\\') {
            escaped = true;
            continue;
        }

        if (!inDouble && !inBacktick && ch === '\'') {
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && !inBacktick && ch === '"') {
            inDouble = !inDouble;
            continue;
        }
        if (!inSingle && !inDouble && ch === '`') {
            inBacktick = !inBacktick;
            continue;
        }
        if (inSingle || inDouble || inBacktick) {
            continue;
        }

        if (ch === '{') {
            depth++;
            continue;
        }
        if (ch === '}') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0) {
            continue;
        }

        if (i > 0 && /[A-Za-z0-9_$-]/.test(source[i - 1])) {
            continue;
        }
        if (!source.startsWith('q-signal', i)) {
            continue;
        }

        const match = source.slice(i).match(/^q-signal\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*;?/);
        if (!match) {
            continue;
        }

        const signalName = String(match[1] || '').trim();
        const signalKey = signalName.toLowerCase();
        if (seen.has(signalKey)) {
            componentLogger.warn(componentId, `Duplicate q-signal declaration "${signalName}" ignored.`);
        } else {
            seen.add(signalKey);
            signals.push({
                name: signalName,
                params: parseSignalParameterList(match[2], componentId, signalName)
            });
        }

        removals.push({
            start: i,
            end: i + match[0].length
        });
        i += match[0].length - 1;
    }

    if (!removals.length) {
        return {
            template: source.trim(),
            signals
        };
    }

    let template = source;
    removals.sort((a, b) => b.start - a.start).forEach((range) => {
        let end = range.end;
        while (end < template.length && /\s/.test(template[end])) end++;
        if (template[end] === ';') end++;
        template = template.slice(0, range.start) + template.slice(end);
    });

    return {
        template: template.trim(),
        signals
    };
}

/**
 * Extract top-level onSignal handlers from a component body.
 *
 * Supported syntax (for declared signals only):
 *   onStateChanged { ... }
 *
 * @param {string} inner Component body text
 * @param {Array<{name: string, params: string[]}>} signals Known component signals
 * @param {string} componentId Component id for diagnostics
 * @returns {{template: string, signalHandlers: Array<{signalName: string, params: string, body: string}>}}
 */
function extractComponentSignalHandlersAndTemplate(inner, signals = [], componentId = '') {
    const signalLookup = new Map();
    (Array.isArray(signals) ? signals : []).forEach((signal) => {
        const signalName = String(signal && signal.name ? signal.name : '').trim();
        if (!signalName) {
            return;
        }
        signalLookup.set(signalName.toLowerCase(), {
            name: signalName,
            params: Array.isArray(signal && signal.params)
                ? signal.params.map((param) => String(param || '').trim()).filter(Boolean)
                : []
        });
    });

    if (!signalLookup.size) {
        return {
            template: String(inner || '').trim(),
            signalHandlers: []
        };
    }

    const source = String(inner || '');
    const segments = splitTopLevelSegments(source);
    const signalHandlers = [];
    const removals = [];

    for (const seg of segments) {
        const segTag = String(seg && seg.tag ? seg.tag : '').trim();
        const candidate = handlerTagToSignalName(segTag);
        if (!candidate) {
            continue;
        }
        const signalDef = signalLookup.get(candidate.toLowerCase());
        if (!signalDef) {
            continue;
        }
        const open = seg.block.indexOf('{');
        const close = seg.block.lastIndexOf('}');
        const handlerBody = open !== -1 && close > open
            ? seg.block.slice(open + 1, close).trim()
            : '';

        signalHandlers.push({
            signalName: signalDef.name,
            params: signalDef.params.join(', '),
            body: handlerBody
        });
        removals.push({
            start: seg.start,
            end: seg.braceClose + 1
        });
    }

    if (!removals.length) {
        return {
            template: source.trim(),
            signalHandlers
        };
    }

    let template = source;
    removals.sort((a, b) => b.start - a.start).forEach((range) => {
        let end = range.end;
        while (end < template.length && /\s/.test(template[end])) end++;
        if (template[end] === ';') end++;
        template = template.slice(0, range.start) + template.slice(end);
    });

    return {
        template: template.trim(),
        signalHandlers
    };
}

/**
 * Extract top-level component function declarations and return a cleaned
 * template body without those declarations.
 *
 * Supported syntax:
 *   function doAction(params) { ... }
 *
 * @param {string} inner Component inner body text (without outer braces)
 * @param {string} componentId Component id for diagnostics
 * @returns {{template: string, actions: Array<{name: string, params: string, body: string}>}}
 */
function extractComponentActionsAndTemplate(inner, componentId = '') {
    const segments = splitTopLevelSegments(inner);
    const actions = [];
    const removals = [];

    for (const seg of segments) {
        const sig = String(seg.tag || '').trim().match(/^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)$/);
        if (!sig) continue;
        const fnName = sig[1];
        const fnParams = sig[2].trim();
        const open = seg.block.indexOf('{');
        const close = seg.block.lastIndexOf('}');
        const fnBody = open !== -1 && close > open
            ? seg.block.slice(open + 1, close).trim()
            : '';

        actions.push({
            name: fnName,
            params: fnParams,
            body: fnBody
        });
        removals.push({
            start: seg.start,
            end: seg.braceClose + 1
        });
    }

    if (!removals.length) {
        return {
            template: inner.trim(),
            actions
        };
    }

    let template = inner;
    removals.sort((a, b) => b.start - a.start).forEach((range) => {
        let end = range.end;
        while (end < template.length && /\s/.test(template[end])) end++;
        if (template[end] === ';') end++;
        template = template.slice(0, range.start) + template.slice(end);
    });

    if (!template.trim()) {
        componentLogger.warn(componentId, 'Component only defines function blocks and no template markup.');
    }

    return {
        template: template.trim(),
        actions
    };
}

function extractComponentRuntimeMetadataAndTemplate(inner, componentId = '') {
    const signalExtracted = extractComponentSignalsAndTemplate(inner, componentId);
    const handlerExtracted = extractComponentSignalHandlersAndTemplate(
        signalExtracted.template,
        signalExtracted.signals,
        componentId
    );
    const actionExtracted = extractComponentActionsAndTemplate(handlerExtracted.template, componentId);
    return {
        template: actionExtracted.template,
        actions: actionExtracted.actions,
        signals: signalExtracted.signals,
        signalHandlers: handlerExtracted.signalHandlers
    };
}

function addInvocationAttributesToPrimarySegment(source, options = {}) {
    if (!source) return source;
    const {
        classes = [],
        rootAttributes = {}
    } = options;
    const segments = splitTopLevelSegments(source);
    if (!segments.length) return source;
    const primaryIndex = segments.findIndex((seg) => shouldMarkComponentSegment(seg.tag));
    if (primaryIndex === -1) return source;
    const primary = segments[primaryIndex];
    const attrs = Object.assign({}, rootAttributes);
    if (classes.length) {
        attrs.class = mergeClassNames(attrs.class || '', classes.join(' '));
    }
    const serialized = serializeInvocationAttributes(attrs);
    if (!serialized.trim()) return source;
    const injection = `\n    ${serialized.split('\n').join('\n    ')}`;
    return source.slice(0, primary.braceOpen + 1) + injection + source.slice(primary.braceOpen + 1);
}

function buildQIntoCarriersFromSlotEntries(slotEntries) {
    return (Array.isArray(slotEntries) ? slotEntries : []).map((entry) => {
        const slotName = String(entry && entry.slotName ? entry.slotName : '').trim();
        if (!slotName) {
            return '';
        }
        const parts = [
            `slot: "${escapeQHtmlPropString(slotName)}";`,
            `q-into-carrier: "1";`,
            `style: "display: none;";`
        ];
        const content = String(entry && entry.content ? entry.content : '').trim();
        if (content) {
            parts.push(content);
        }
        return `q-into {\n${indentQHtmlBlock(parts.join('\n'))}\n}`;
    }).filter(Boolean).join('\n');
}

function buildRuntimeComponentInvocation(componentId, slotEntries, rootAttributes = {}, classes = [], actions = [], signals = [], signalHandlers = [], hostBlocks = []) {
    const attrs = Object.assign({}, rootAttributes, {
        'q-component': componentId,
        'qhtml-component-instance': '1'
    });
    if (classes.length) {
        attrs.class = mergeClassNames(attrs.class || '', classes.join(' '));
    }
    const attrLines = serializeInvocationAttributes(attrs);
    const carrierBlocks = buildQIntoCarriersFromSlotEntries(slotEntries);
    const readyLines = [];
    const signalDefs = (Array.isArray(signals) ? signals : [])
        .map((signal) => ({
            name: String(signal && signal.name ? signal.name : '').trim(),
            params: Array.isArray(signal && signal.params)
                ? signal.params.map((param) => String(param || '').trim()).filter(Boolean)
                : []
        }))
        .filter((signal) => signal.name);
    const signalHandlerDefs = (Array.isArray(signalHandlers) ? signalHandlers : [])
        .map((handler) => ({
            signalName: String(handler && handler.signalName ? handler.signalName : '').trim(),
            params: String(handler && handler.params ? handler.params : '').trim(),
            body: String(handler && handler.body ? handler.body : '').trim()
        }))
        .filter((handler) => handler.signalName && handler.body);
    if (signalDefs.length || signalHandlerDefs.length) {
        readyLines.push(`ensureComponentSignals(this, ${JSON.stringify(signalDefs)}, ${JSON.stringify(signalHandlerDefs)}, ${JSON.stringify(componentId)});`);
    }
    const actionNames = (Array.isArray(actions) ? actions : [])
        .map((action) => ({
            name: String(action && action.name ? action.name : '').trim(),
            params: String(action && action.params ? action.params : '').trim(),
            body: String(action && action.body ? action.body : '').trim()
        }))
        .filter((entry) => entry.name);
    actionNames.forEach((entry) => {
        readyLines.push(`this[${JSON.stringify(entry.name)}] = function(${entry.params}) {`);
        if (entry.body) {
            entry.body.split('\n').forEach((line) => readyLines.push(line));
        }
        readyLines.push('};');
    });
    if (actionNames.length) {
        const namesLiteral = JSON.stringify(actionNames.map((entry) => entry.name));
        readyLines.push(`bindComponentActionsRecursively(this, ${namesLiteral});`);
        readyLines.push(`observeComponentActionBinding(this, ${namesLiteral});`);
    }
    const readyBlock = readyLines.length
        ? `onReady {\n${readyLines.map((line) => `  ${line}`).join('\n')}\n}`
        : '';
    const hostBlockSource = (Array.isArray(hostBlocks) ? hostBlocks : [])
        .map((block) => String(block || '').trim())
        .filter(Boolean)
        .join('\n');
    const body = [attrLines, hostBlockSource, readyBlock, carrierBlocks].filter((part) => String(part || '').trim()).join('\n');
    return `${componentId} {\n${indentQHtmlBlock(body)}\n}`;
}

function slotEntriesToMap(slotEntries) {
    const slotMap = new Map();
    (Array.isArray(slotEntries) ? slotEntries : []).forEach((entry) => {
        const slotName = String(entry && entry.slotName ? entry.slotName : '').trim();
        if (!slotName) return;
        const existing = slotMap.get(slotName) || '';
        const content = String(entry && entry.content ? entry.content : '');
        slotMap.set(slotName, existing + '\n' + content);
    });
    return slotMap;
}

/**
 * Expand reusable definition blocks found in qhtml.
 *
 * - `q-component` definitions are registered as runtime custom-element hosts.
 *   Invocations are normalized to host tags with `<q-into slot="...">` carriers.
 * - `q-template` definitions are compile-time only and expand to pure HTML.
 *   Function blocks inside q-template are ignored with a warning.
 *
 * @param {string} input Raw qhtml containing component definitions and invocations
 * @returns {string} The qhtml with component/template invocations resolved
 */
function transformComponentDefinitionsHelper(input) {
    const defs = [];
    let out = input;

    const collectDefinitions = (keyword, kind) => {
        let idx = 0;
        while (true) {
            const start = out.indexOf(keyword, idx);
            if (start === -1) break;
            const open = out.indexOf('{', start);
            if (open === -1) break;
            const close = findMatchingBrace(out, open);
            if (close === -1) break;
            const header = out.slice(start, open).trim();
            const headerMatch = header.match(new RegExp(`^${keyword}\\s+([^\\s{]+)$`));
            const id = headerMatch ? headerMatch[1] : '';
            const block = out.slice(start, close + 1);
            const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
            if (!id) {
                const flattenedInner = removeNestedBlocks(inner);
                if (keyword === 'q-component' && /(?:^|\s)id\s*:\s*"[^"]+"\s*;?/.test(flattenedInner)) {
                    componentLogger.error('', 'Legacy component syntax is no longer supported. Use `q-component component-id { ... }`.');
                }
                idx = close + 1;
                continue;
            }
            const templateSource = stripTopLevelProps(inner, ['id', 'slots']).trim();
            const extracted = kind === 'component'
                ? extractComponentRuntimeMetadataAndTemplate(templateSource, id)
                : extractComponentActionsAndTemplate(templateSource, id);
            if (kind === 'template' && extracted.actions.length) {
                componentLogger.warn(id, 'q-template ignores function blocks.');
            }
            defs.push({
                kind,
                id,
                template: extracted.template,
                actions: kind === 'component' ? extracted.actions : [],
                signals: kind === 'component' ? (extracted.signals || []) : [],
                signalHandlers: kind === 'component' ? (extracted.signalHandlers || []) : []
            });
            out = out.slice(0, start) + out.slice(close + 1);
            idx = Math.max(0, start - 1);
        }
    };

    collectDefinitions('q-component', 'component');
    collectDefinitions('q-template', 'template');

    if (!defs.length) {
        return out;
    }

    const componentIds = defs.map((def) => def.id);
    const slotRegistry = new Map();
    for (const def of defs) {
        const slotInfo = collectTemplateSlotDefinitions(def.template, componentIds, def.id);
        slotRegistry.set(def.id, slotInfo);
        if (def.kind === 'component') {
            setGeneratedComponentDefinition(def.id, {
                template: def.template,
                slotNames: Array.from(slotInfo.slotNames || []),
                signals: def.signals || [],
                signalHandlers: def.signalHandlers || []
            });
            if (isValidCustomElementName(def.id)) {
                ensureGeneratedCustomElement(def.id, def.actions, def.signals, def.signalHandlers);
            } else {
                componentLogger.warn(def.id, 'Component id is not a valid custom-element name; methods are unavailable on document.createElement for this tag.');
            }
        }
    }

    const maxPasses = Math.max(1, defs.length * 3);
    let pass = 0;
    let changed = true;

    while (changed && pass < maxPasses) {
        changed = false;
        pass++;
        for (const def of defs) {
            const { id, template, kind } = def;
            let slotInfo = slotRegistry.get(id) || {
                directSlots: new Map(),
                subcomponentSlots: new Map(),
                slotNames: new Set()
            };
            if (!slotInfo.slotNames || slotInfo.slotNames.size === 0) {
                const fallbackSlotNames = collectTemplateSlotNames(template);
                if (fallbackSlotNames.size) {
                    const fallbackDirect = new Map();
                    fallbackSlotNames.forEach((slotName) => fallbackDirect.set(slotName, 1));
                    slotInfo = {
                        directSlots: fallbackDirect,
                        subcomponentSlots: new Map(),
                        slotNames: fallbackSlotNames
                    };
                }
            }

            const totalSlotCount = Array.from(slotInfo.directSlots.values()).reduce((a, b) => a + b, 0)
                + Array.from(slotInfo.subcomponentSlots.values()).reduce((a, b) => a + b, 0);
            let singleSlotName = '';
            if (totalSlotCount === 1) {
                if (slotInfo.directSlots.size === 1) {
                    singleSlotName = Array.from(slotInfo.directSlots.keys())[0];
                } else if (slotInfo.subcomponentSlots.size === 1) {
                    singleSlotName = Array.from(slotInfo.subcomponentSlots.keys())[0];
                }
            }

            let pos = 0;
            while (true) {
                const k = findTagInvocation(out, id, pos, { allowClasses: true });
                if (!k) break;
                const { tagStart, braceOpen, braceClose, tagToken } = k;
                const { classes: componentClasses } = parseTagWithClasses(tagToken || id);
                const body = out.slice(braceOpen + 1, braceClose);
                const flattenedBody = removeNestedBlocks(body);
                if (/(?:^|\s)qhtml-component-instance\s*:\s*"1"\s*;?/.test(flattenedBody)) {
                    pos = braceClose + 1;
                    continue;
                }

                const rootAttributes = extractTopLevelInvocationAttributes(body);
                const children = splitTopLevelSegments(body);
                const slotEntries = [];
                const hostBlocks = [];
                const invocationSignalHandlers = [];
                const nonSlotChildStarts = new Set();
                let hasSlotTagBlocks = false;
                let hasLegacySlotDirective = false;
                const signalLookup = new Map();
                (Array.isArray(def.signals) ? def.signals : []).forEach((signal) => {
                    const signalName = String(signal && signal.name ? signal.name : '').trim();
                    if (!signalName) {
                        return;
                    }
                    signalLookup.set(signalName.toLowerCase(), {
                        name: signalName,
                        params: Array.isArray(signal && signal.params)
                            ? signal.params.map((param) => String(param || '').trim()).filter(Boolean)
                            : []
                    });
                });

                const intoNodes = collectIntoNodes(body, componentIds, id);
                const hasIntoBlocks = hasTopLevelIntoBlock(body, componentIds);
                for (const node of intoNodes) {
                    if (!slotInfo.slotNames.size) {
                        componentLogger.warn(id, `Component does not have slot named "${node.targetSlot}".`);
                        continue;
                    }
                    const resolved = resolveIntoSlotTarget(node.targetSlot, slotInfo, id);
                    if (!resolved) continue;
                    slotEntries.push({
                        slotName: resolved,
                        content: node.children,
                        position: node.position
                    });
                }

                for (const seg of children) {
                    const segTag = String(seg && seg.tag ? seg.tag : '').trim();
                    if (/^on[A-Za-z0-9_]+$/i.test(segTag)) {
                        const candidateSignalName = handlerTagToSignalName(segTag);
                        const signalDef = candidateSignalName ? signalLookup.get(candidateSignalName.toLowerCase()) : null;
                        if (signalDef && !isReadyLifecycleName(segTag)) {
                            const open = seg.block.indexOf('{');
                            const close = seg.block.lastIndexOf('}');
                            const handlerBody = open !== -1 && close > open
                                ? seg.block.slice(open + 1, close).trim()
                                : '';
                            invocationSignalHandlers.push({
                                signalName: signalDef.name,
                                params: signalDef.params.join(', '),
                                body: handlerBody
                            });
                            if (typeof seg.start === 'number') {
                                nonSlotChildStarts.add(seg.start);
                            }
                            continue;
                        }
                        hostBlocks.push(seg.block);
                        if (typeof seg.start === 'number') {
                            nonSlotChildStarts.add(seg.start);
                        }
                        continue;
                    }
                    if (seg.tag === 'into' || seg.tag === 'q-into') {
                        continue;
                    }
                    if (slotInfo.slotNames.has(seg.tag) && !componentIds.includes(seg.tag)) {
                        hasSlotTagBlocks = true;
                        const innerStart = seg.block.indexOf('{');
                        const innerEnd = seg.block.lastIndexOf('}');
                        const injected = innerStart !== -1 && innerEnd > innerStart
                            ? seg.block.slice(innerStart + 1, innerEnd).trim()
                            : '';
                        slotEntries.push({
                            slotName: seg.tag,
                            content: injected,
                            position: typeof seg.start === 'number' ? seg.start : 0
                        });
                        continue;
                    }
                    const legacyDirective = findTopLevelLegacySlotDirective(seg.block);
                    if (legacyDirective) {
                        hasLegacySlotDirective = true;
                        componentLogger.error(id, 'Legacy inline slot assignment is no longer supported. Use `slot-name { ... }` child blocks.');
                    }
                }

                const hasExplicitSlotUsage = hasIntoBlocks || hasSlotTagBlocks || hasLegacySlotDirective || slotEntries.length > 0;
                if (!hasExplicitSlotUsage && singleSlotName) {
                    const autoContent = children
                        .filter((seg) => seg.tag !== 'into' && seg.tag !== 'q-into')
                        .filter((seg) => !(typeof seg.start === 'number' && nonSlotChildStarts.has(seg.start)))
                        .map((seg) => seg.block)
                        .join('\n')
                        .trim();
                    if (autoContent) {
                        slotEntries.push({
                            slotName: singleSlotName,
                            content: autoContent,
                            position: 0
                        });
                    }
                }
                slotEntries.sort((a, b) => a.position - b.position);

                let replacement = '';
                if (kind === 'component') {
                    const runtimeSignalHandlers = []
                        .concat(Array.isArray(def.signalHandlers) ? def.signalHandlers : [])
                        .concat(invocationSignalHandlers);
                    replacement = buildRuntimeComponentInvocation(
                        id,
                        slotEntries,
                        rootAttributes,
                        componentClasses,
                        def.actions,
                        def.signals,
                        runtimeSignalHandlers,
                        hostBlocks
                    );
                } else {
                    const slotMap = slotEntriesToMap(slotEntries);
                    const suppressMissingWarnings = !hasExplicitSlotUsage && children.length === 0;
                    const expanded = replaceTemplateSlots(template, slotMap, {
                        componentId: id,
                        warnOnMissing: !suppressMissingWarnings,
                        preserveAnchors: false
                    });
                    replacement = addInvocationAttributesToPrimarySegment(expanded, {
                        classes: componentClasses,
                        rootAttributes
                    });
                }

                out = out.slice(0, tagStart) + replacement + out.slice(braceClose + 1);
                pos = tagStart + replacement.length;
                changed = true;
            }
        }
    }

    if (changed) {
        componentLogger.warn('', `Component/template expansion stopped after ${maxPasses} passes; recursive blocks may remain.`);
    }
    return out;
}

function sanitizeInlineHandler(scriptBody) {
    let out = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;
    let lastWasSpace = false;
    let lastWasNewline = false;

    for (let i = 0; i < scriptBody.length; i++) {
        const ch = scriptBody[i];

        if (escaped) {
            out += ch;
            escaped = false;
            lastWasSpace = false;
            continue;
        }

        if (ch === '\\' && (inSingle || inDouble || inBacktick)) {
            out += ch;
            escaped = true;
            lastWasSpace = false;
            continue;
        }

        if (ch === '"' && !inSingle && !inBacktick) {
            inDouble = !inDouble;
            out += '\'';
            lastWasSpace = false;
            continue;
        }

        if (ch === '\'' && !inDouble && !inBacktick) {
            inSingle = !inSingle;
            out += '\'';
            lastWasSpace = false;
            continue;
        }

        if (ch === '`' && !inSingle && !inDouble) {
            inBacktick = !inBacktick;
            out += ch;
            lastWasSpace = false;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && (ch === '\n' || ch === '\r')) {
            if (!lastWasNewline) {
                out += '\n';
            }
            lastWasSpace = false;
            lastWasNewline = true;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && /\s/.test(ch)) {
            if (!lastWasSpace) {
                out += ' ';
                lastWasSpace = true;
            }
            lastWasNewline = false;
            continue;
        }

        out += ch;
        lastWasSpace = false;
        lastWasNewline = false;
    }

    return out.trim();
}

function isReadyLifecycleName(name) {
    const normalized = String(name || '').toLowerCase();
    return normalized === 'onready' || normalized === 'onload' || normalized === 'onloaded';
}

/**
 * Extract a flat list of property and child element segments from a qhtml
 * invocation. Produces segments of type: 'property' | 'element' | 'html' | 'css'.
 * Inline HTML/CSS contents are percent-encoded here and decoded at render time.
 *
 * @param {string} input
 * @returns {Array<object>}
 */
function extractPropertiesAndChildren(input) {
  const segments = [];

  // Global scan state for the current level
  let nestedLevel = 0;
  let segmentStart = 0;
  let currentSegment = null; // {type, tag, content, _buf?, _cssDepth?}
  const isEventBlock = (tag) => /^on[A-Za-z0-9_]+$/.test(tag);

  // Per-segment helpers
  const beginHtml = (tag) => {
    currentSegment = { type: 'html', tag, content: '', _buf: [], _htmlDepth: 1 };
  };
  const appendHtml = (ch) => currentSegment && currentSegment._buf.push(ch);
  const incHtmlDepth = () => { if (currentSegment) currentSegment._htmlDepth++; };
  const decHtmlDepth = () => { if (currentSegment) currentSegment._htmlDepth--; };
  const endHtml = () => {
    currentSegment.content = encodeURIComponent(currentSegment._buf.join(''));
    segments.push(currentSegment);
    currentSegment = null;
  };

  const beginCss = (tag) => {
    currentSegment = { type: 'css', tag, content: '', _buf: [], _cssDepth: 1 };
  };
  const appendCss = (ch) => currentSegment && currentSegment._buf.push(ch);
  const incCssDepth = () => { if (currentSegment) currentSegment._cssDepth++; };
  const decCssDepth = () => { if (currentSegment) currentSegment._cssDepth--; };
  const endCss = () => {
    currentSegment.content = encodeURIComponent(currentSegment._buf.join(''));
    segments.push(currentSegment);
    currentSegment = null;
  };

  const beginStyleBlock = (tag) => {
    currentSegment = { type: 'style-block', tag, content: '', _buf: [], _styleDepth: 1 };
  };
  const appendStyleBlock = (ch) => currentSegment && currentSegment._buf.push(ch);
  const incStyleDepth = () => { if (currentSegment) currentSegment._styleDepth++; };
  const decStyleDepth = () => { if (currentSegment) currentSegment._styleDepth--; };
  const endStyleBlock = () => {
    currentSegment.content = currentSegment._buf.join('');
    segments.push(currentSegment);
    currentSegment = null;
  };

  // NEW: text segment helpers (mirrors html, but we will decode to a text node)
  const beginText = (tag) => {
    currentSegment = { type: 'text', tag, content: '', _buf: [], _textDepth: 1 };
  };
  const appendText = (ch) => currentSegment && currentSegment._buf.push(ch);
  const incTextDepth = () => { if (currentSegment) currentSegment._textDepth++; };
  const decTextDepth = () => { if (currentSegment) currentSegment._textDepth--; };
  const endText = () => {
    // For symmetry with html/css we URI-encode; will decode at render time.
    currentSegment.content = encodeURIComponent(currentSegment._buf.join(''));
    segments.push(currentSegment);
    currentSegment = null;
  };

  const beginEventBlock = (name) => {
    currentSegment = { type: 'event-block', name, _buf: [], _depth: 1 };
  };
  const appendEventBlock = (ch) => currentSegment && currentSegment._buf.push(ch);
  const incEventDepth = () => { if (currentSegment) currentSegment._depth++; };
  const decEventDepth = () => { if (currentSegment) currentSegment._depth--; };
  const endEventBlock = () => {
    const raw = currentSegment._buf.join('');
    if (isReadyLifecycleName(currentSegment.name)) {
      segments.push({
        type: 'property',
        name: currentSegment.name,
        value: raw.trim(),
        isReadyLifecycle: true
      });
    } else {
      const cleaned = sanitizeInlineHandler(raw);
      segments.push({ type: 'property', name: currentSegment.name, value: cleaned, isFunction: true });
    }
    currentSegment = null;
  };

  // NOTE: we never mutate `input` while scanning; we just move `i`
  for (let i = 0; i < input.length; i++) {
    // Inside inline HTML
    if (currentSegment && currentSegment.type === 'html') {
      const ch = input[i];
      if (ch === '{') {
        incHtmlDepth();
        appendHtml(ch);
        continue;
      }
      if (ch === '}') {
        decHtmlDepth();
        if (currentSegment._htmlDepth === 0) {
          // End of HTML block: close the segment and decrement nesting level
          endHtml();
          nestedLevel--;
          // After closing an inline HTML block at this level, process the rest of the input
          const rest = input.substring(i + 1);
          return segments.concat(extractPropertiesAndChildren(rest));
        }
        appendHtml(ch);
        continue;
      }
      appendHtml(ch);
      continue;
    }

    // Inside inline CSS (track nested braces)
    if (currentSegment && currentSegment.type === 'css') {
      const ch = input[i];
      if (ch === '{') {
        incCssDepth();
        appendCss(ch);
        continue;
      }
      if (ch === '}') {
        decCssDepth();
        if (currentSegment._cssDepth === 0) {
          // End of CSS block: close the segment and decrement nesting level
          endCss();
          nestedLevel--;
          // After closing an inline CSS block at this level, process the rest of the input
          const rest = input.substring(i + 1);
          return segments.concat(extractPropertiesAndChildren(rest));
        } else {
          appendCss(ch);
        }
        continue;
      }
      appendCss(ch);
      continue;
    }

    // Inside inline STYLE block (track nested braces)
    if (currentSegment && currentSegment.type === 'style-block') {
      const ch = input[i];
      if (ch === '{') {
        incStyleDepth();
        appendStyleBlock(ch);
        continue;
      }
      if (ch === '}') {
        decStyleDepth();
        if (currentSegment._styleDepth === 0) {
          endStyleBlock();
          nestedLevel--;
          const rest = input.substring(i + 1);
          return segments.concat(extractPropertiesAndChildren(rest));
        } else {
          appendStyleBlock(ch);
        }
        continue;
      }
      appendStyleBlock(ch);
      continue;
    }

    // Inside inline TEXT
    if (currentSegment && currentSegment.type === 'text') {
      const ch = input[i];
      if (ch === '{') {
        incTextDepth();
        appendText(ch);
        continue;
      }
      if (ch === '}') {
        decTextDepth();
        if (currentSegment._textDepth === 0) {
          // End of text block: close the segment and decrement nesting level
          endText();
          nestedLevel--;
          // After closing an inline TEXT block at this level, process the rest of the input
          const rest = input.substring(i + 1);
          return segments.concat(extractPropertiesAndChildren(rest));
        }
        appendText(ch);
        continue;
      }
      appendText(ch);
      continue;
    }

    // Inside event handler block (track nested braces)
    if (currentSegment && currentSegment.type === 'event-block') {
      const ch = input[i];
      if (ch === '{') {
        incEventDepth();
        appendEventBlock(ch);
        continue;
      }
      if (ch === '}') {
        decEventDepth();
        if (currentSegment._depth === 0) {
          endEventBlock();
          nestedLevel--;
          const rest = input.substring(i + 1);
          return segments.concat(extractPropertiesAndChildren(rest));
        } else {
          appendEventBlock(ch);
        }
        continue;
      }
      appendEventBlock(ch);
      continue;
    }

    // Top-level parser at this nesting level
    const ch = input[i];

    // Opening of a block → decide html/css/text/element
    if (ch === '{') {
      nestedLevel++;
      if (nestedLevel === 1) {
        segmentStart = i + 1;
        const tag = input.substring(0, i).trim();

        if (isEventBlock(tag)) { beginEventBlock(tag); continue; }
        if (tag === 'html') { beginHtml(tag); continue; }
        if (tag === 'css')  { beginCss(tag); continue; }
        if (tag === 'text') { beginText(tag); continue; }
        if (tag === 'style') { beginStyleBlock(tag); continue; }
        if (/^function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)$/.test(tag)) {
          currentSegment = { type: 'function-def', tag, content: '' };
          continue;
        }

        // default element
        currentSegment = { type: 'element', tag, content: '' };
      }
      continue;
    }

    // Closing of current element block
    if (ch === '}') {
      nestedLevel--;
      if (nestedLevel === 0 && currentSegment) {
        currentSegment.content = input.substring(segmentStart, i).trim();
        segments.push(currentSegment);
        currentSegment = null;

        // reset for the next sibling at this level
        const rest = input.substring(i + 1);
        // we DO NOT mutate input nor reset i; the outer loop continues
        // but we need the tag prefix to be consumed correctly:
        // emulate the original behavior by slicing the already-processed
        // head off and restarting scan on the remainder
        return segments.concat(extractPropertiesAndChildren(rest));
      }
      continue;
    }

    // Property at top level of this invocation
    if (nestedLevel === 0 && ch === ':') {
      const propName = input.substring(0, i).trim();
      let remainder = input.substring(i + 1).trim();

      // Function-body property support: prop: { ... };
      if (remainder.startsWith('{')) {
        let braceCount = 0;
        let endIndex = 0;
        for (let j = 0; j < remainder.length; j++) {
          const c = remainder[j];
          if (c === '{') braceCount++;
          else if (c === '}') { braceCount--; if (braceCount === 0) { endIndex = j; break; } }
        }
        const fnBody = remainder.substring(1, endIndex).trim();
        let skipIndex = endIndex + 1;
        if (remainder[skipIndex] === ';') skipIndex++;
        segments.push({ type: 'property', name: propName, value: fnBody, isFunction: true });
        const tail = remainder.substring(skipIndex).trim();
        return segments.concat(extractPropertiesAndChildren(tail));
      } else {
        // Regular property value to next semicolon
        const propEnd = remainder.indexOf(';');
        if (propEnd !== -1) {
          let propertyValue = remainder.substring(0, propEnd).trim();
          propertyValue = propertyValue.replace(/^"/, '').replace(/"$/, '');
          segments.push({ type: 'property', name: propName, value: propertyValue });
          const tail = remainder.substring(propEnd + 1).trim();
          return segments.concat(extractPropertiesAndChildren(tail));
        }
      }
    }
  }

  return segments;
}
function processTextSegment(segment, parentElement) {
  let textString;
  try {
    textString = decodeURIComponent(segment.content);
  } catch {
    textString = segment.content;
  }
  textString = evaluateQScriptBlocks(textString, { thisArg: parentElement });
  // Insert as a pure text node (no wrapper, no HTML parsing)
  parentElement.appendChild(document.createTextNode(textString));
}

function queueReadyLifecycleHook(parentElement, scriptBody) {
    if (!parentElement) {
        return;
    }
    const body = String(scriptBody || '').trim();
    if (!body) {
        return;
    }
    if (!Array.isArray(parentElement.__qhtmlReadyHooks)) {
        parentElement.__qhtmlReadyHooks = [];
    }
    parentElement.__qhtmlReadyHooks.push(body);
}

function flushReadyLifecycleHooks(parentElement, fallbackThis) {
    if (!parentElement || !Array.isArray(parentElement.__qhtmlReadyHooks) || !parentElement.__qhtmlReadyHooks.length) {
        return;
    }
    const queued = parentElement.__qhtmlReadyHooks.slice();
    parentElement.__qhtmlReadyHooks.length = 0;
    const boundThis = fallbackThis || parentElement;
    queued.forEach((scriptBody) => {
        try {
            const fn = new Function(scriptBody);
            const restoreThisContext = applyQHtmlRuntimeThisContext(boundThis);
            try {
                fn.call(boundThis);
            } finally {
                if (typeof restoreThisContext === 'function') {
                    restoreThisContext();
                }
            }
        } catch (err) {
            console.error('Failed to execute onReady/onLoad lifecycle block', err);
        }
    });
}


/**
 * Process a property segment. Handles static and dynamic JavaScript-valued
 * properties. Event handler properties are assigned directly to the parent
 * element.
 *
 * @param {object} segment The property segment descriptor
 * @param {HTMLElement} parentElement The DOM element receiving the property
 */
function processPropertySegment(segment, parentElement) {
    const propNameRaw = String(segment.name || '');
    const propNameLower = propNameRaw.toLowerCase();
    if (propNameLower === 'qhtml-component-instance' || propNameLower === 'qhtml-runtime-template') {
        return;
    }
    if (segment.isReadyLifecycle || (segment.isFunction && isReadyLifecycleName(propNameRaw))) {
        let lifecycleBody = segment.value;
        try {
            lifecycleBody = decodeURIComponent(lifecycleBody);
        } catch {
            // ignore decoding errors and use raw body
        }
        queueReadyLifecycleHook(parentElement, lifecycleBody);
        return;
    }

    if (segment.isFunction) {
        let fnBody = segment.value;
        try {
            fnBody = decodeURIComponent(fnBody);
        } catch {
            // ignore decoding errors and use raw body
        }
        try {
            const fn = new Function(fnBody);
            if (/^on\w+/i.test(propNameRaw)) {
                const handler = function(event) {
                    const restoreThisContext = applyQHtmlRuntimeThisContext(this);
                    try {
                        return fn.call(this, event);
                    } catch (err) {
                        console.error('Error executing event handler for', propNameRaw, err);
                    } finally {
                        if (typeof restoreThisContext === 'function') {
                            restoreThisContext();
                        }
                    }
                };
                parentElement[propNameLower] = handler;
                const inlineBodyLiteral = JSON.stringify(fnBody);
                const inlinePropLiteral = JSON.stringify(propNameRaw);
                parentElement.setAttribute(
                    propNameRaw,
                    `return window.__qhtmlInvokeInlineHandler(this, event, ${inlineBodyLiteral}, ${inlinePropLiteral});`
                );
            } else {
                let result;
                try {
                    result = fn.call(parentElement);
                } catch (err) {
                    console.error('Error executing function for property', propNameRaw, err);
                    result = '';
                }
                if (propNameLower === 'class') {
                    mergeClassAttribute(parentElement, result);
                } else {
                    parentElement.setAttribute(propNameRaw, result);
                }
            }
        } catch (err) {
            console.error('Failed to compile function for property', segment.name, err);
        }
    } else {
        let resolvedValue = evaluateQScriptBlocks(segment.value, { thisArg: parentElement });
        if (typeof resolvedValue === 'string') {
            try {
                resolvedValue = decodeURIComponent(resolvedValue);
            } catch {
                // keep raw value when it is not URI-encoded
            }
        }
        if (propNameLower === 'class') {
            mergeClassAttribute(parentElement, resolvedValue);
        } else {
            parentElement.setAttribute(propNameRaw, resolvedValue);
        }
    }
}

/**
 * Process a child element segment.  Handles nested tag lists (comma-separated)
 * and script/q-painter elements specially.  All other elements are
 * recursively parsed via extractPropertiesAndChildren and processSegment.
 *
 * @param {object} segment The element segment descriptor
 * @param {HTMLElement} parentElement The parent DOM element
 */
function processElementSegment(segment, parentElement) {
    const createElementFromTag = (tagName) => {
        const { base, classes } = parseTagWithClasses(tagName);
        const regex = /<(\w+)[\s>]/;
        const match = base.match(regex);
        const resolvedTag = match ? match[1].toLowerCase() : base;
        if (!isLikelyValidElementTagName(resolvedTag)) {
            componentLogger.error('', `Skipping invalid element tag token "${tagName}".`);
            return { element: null, classes, base };
        }
        const element = document.createElement(resolvedTag);
        if (classes.length) {
            mergeClassAttribute(element, classes.join(' '));
        }
        return { element, classes, base };
    };
    if (segment.tag.includes(',')) {
        const tags = segment.tag.split(',').map(t => t.trim());
        let currentParent = parentElement;
        let innermostClasses = [];
        tags.forEach(tag => {
            const created = createElementFromTag(tag);
            if (!created.element) {
                return;
            }
            currentParent.appendChild(created.element);
            currentParent = created.element;
            innermostClasses = created.classes;
        });
        const resolvedContent = evaluateQScriptBlocks(segment.content, {
            topLevelOnly: true,
            thisArg: currentParent,
            wrapPrimitiveTopLevel: true
        });
        const childSegments = extractPropertiesAndChildren(resolvedContent);
        childSegments.forEach(childSegment => processSegment(childSegment, currentParent));
        if (innermostClasses.length) {
            mergeClassAttribute(currentParent, innermostClasses.join(' '));
        }
        flushReadyLifecycleHooks(currentParent);
    } else {
        const created = createElementFromTag(segment.tag);
        if (!created.element) {
            return;
        }
        const newElement = created.element;
        const tagName = created.base;
        if (tagName === 'script' || tagName === 'q-painter') {
            storeAndExecuteScriptLater(segment.content);
            newElement.text = segment.content;
            parentElement.appendChild(newElement);
        } else {
            // Attach first so q-script runtime this can traverse parent/closest.
            parentElement.appendChild(newElement);
            const resolvedContent = evaluateQScriptBlocks(segment.content, {
                topLevelOnly: true,
                thisArg: newElement,
                wrapPrimitiveTopLevel: true
            });
            const childSegments = extractPropertiesAndChildren(resolvedContent);
            childSegments.forEach(childSegment => processSegment(childSegment, newElement));
            if (created.classes.length) {
                mergeClassAttribute(newElement, created.classes.join(' '));
            }
            flushReadyLifecycleHooks(newElement);
        }
    }
}

/**
 * Process an inline HTML segment.  The encoded HTML content is decoded and
 * inserted directly into the parent element without any wrapper.
 *
 * @param {object} segment The HTML segment descriptor
 * @param {HTMLElement} parentElement The parent DOM element
 */
function processHtmlSegment(segment, parentElement) {
    let htmlString;
    try {
        htmlString = decodeURIComponent(segment.content);
    } catch {
        htmlString = segment.content;
    }
    htmlString = evaluateQScriptBlocks(htmlString, { thisArg: parentElement });
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlString;
    while (tempContainer.firstChild) {
        parentElement.appendChild(tempContainer.firstChild);
    }
}

/**
 * Process an inline CSS segment.  Applies the encoded CSS as a style attribute
 * on the parent element.
 *
 * @param {object} segment The CSS segment descriptor
 * @param {HTMLElement} parentElement The parent DOM element
 */
function processCssSegment(segment, parentElement) {
    parentElement.setAttribute('style', segment.content);
}

/**
 * Process a style { } segment.  When invoked within an element, the content
 * is merged into the element's `style` attribute.  When the parent is the
 * synthetic root wrapper generated during parsing, the segment is emitted as
 * a real <style> tag whose text content mirrors the original block.
 *
 * @param {object} segment The style block descriptor
 * @param {HTMLElement} parentElement The parent DOM element
 */
function processStyleBlockSegment(segment, parentElement) {
    if (!parentElement) {
        return;
    }

    const content = evaluateQScriptBlocks(segment.content, { thisArg: parentElement });

    if (parentElement.__qhtmlRoot) {
        const styleElement = document.createElement('style');
        styleElement.textContent = content;
        parentElement.appendChild(styleElement);
        return;
    }

    const normalized = content.trim();
    if (!normalized) {
        return;
    }

    const existing = parentElement.getAttribute('style');
    if (existing && existing.trim()) {
        const trimmedExisting = existing.trim();
        const needsSemicolon = !trimmedExisting.endsWith(';');
        const combined = `${trimmedExisting}${needsSemicolon ? ';' : ''} ${normalized}`.trim();
        parentElement.setAttribute('style', combined);
    } else {
        parentElement.setAttribute('style', normalized);
    }
}

/**
 * Dispatch processing based on segment type.  Delegates to more specific
 * helpers for properties, elements, HTML and CSS segments.
 *
 * @param {object} segment The segment descriptor
 * @param {HTMLElement} parentElement The parent DOM element
 */
function processSegment(segment, parentElement) {
    if (segment.type === 'property') {
        processPropertySegment(segment, parentElement);
    } else if (segment.type === 'element') {
        processElementSegment(segment, parentElement);
    } else if (segment.type === 'function-def') {
        // Function definition blocks should be consumed by component transforms.
        // Ignore gracefully if one leaks into runtime parsing.
        return;
    } else if (segment.type === 'html') {
        processHtmlSegment(segment, parentElement);
    } else if (segment.type === 'css') {
        processCssSegment(segment, parentElement);
    } else if (segment.type === 'style-block') {
        processStyleBlockSegment(segment, parentElement);
    } else if (segment.type === 'text') {
        processTextSegment(segment, parentElement);
    }
}

/**
 * Normalize a q-html host's source text.
 *
 * @param {HTMLElement} host q-html element host
 * @returns {string} Trimmed qhtml source without outer wrapping quotes
 */
function extractRawQHtmlSource(host) {
    if (!host || typeof host.innerHTML !== 'string') {
        return '';
    }
    return host.innerHTML.trim().replace(/^"|"$/g, '');
}

/**
 * Resolve q-import blocks for all provided q-html hosts before parsing begins.
 * A shared runtime state enforces one global import limit across the batch.
 *
 * @param {Iterable<HTMLElement>} hosts q-html elements to preload
 * @returns {Promise<void>}
 */
async function preloadQImportsForHosts(hosts) {
    const elements = Array.from(hosts || []);
    if (!elements.length) {
        return;
    }
    const sharedState = ensureQImportResolveState(null);
    await Promise.all(elements.map(async (elem) => {
        const raw = extractRawQHtmlSource(elem);
        elem.__qhtmlResolvedImports = await resolveQImports(raw, sharedState);
    }));
}

let qhtmlInitialImportBarrier = null;

function ensureInitialImportBarrier() {
    if (qhtmlInitialImportBarrier) {
        return qhtmlInitialImportBarrier;
    }
    const hosts = (typeof document !== 'undefined')
        ? document.querySelectorAll('q-html')
        : [];
    qhtmlInitialImportBarrier = preloadQImportsForHosts(hosts);
    return qhtmlInitialImportBarrier;
}

// Expose helper functions on the global window object so that parseQHtml can
// reliably reference the top-level implementations. Without this, nested
// function definitions hoisted within parseQHtml may shadow the helpers.
if (typeof window !== 'undefined') {
    window.extractPropertiesAndChildren = extractPropertiesAndChildren;
    window.processSegment = processSegment;
    if (typeof window.__qhtmlInvokeInlineHandler !== 'function') {
        window.__qhtmlInvokeInlineHandler = function(thisArg, eventObj, scriptBody, propName) {
            return executeQHtmlInlineEventHandler(scriptBody, thisArg, eventObj, propName);
        };
    }
    installElementQHtmlGetter();
    installDocumentQHtmlQueryHelpers();
}

class QHtmlElement extends HTMLElement {
    constructor() {
        super();
        this.initMutationObserver();
    }

    connectedCallback() {
        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            return;
        }
        this.render();
    }

    async render() {
        if (this.__qhtmlRenderPromise) {
            return this.__qhtmlRenderPromise;
        }
        this.__qhtmlRenderPromise = (async () => {
            if (typeof document !== 'undefined' && document.readyState === 'loading') {
                await new Promise((resolve) => {
                    document.addEventListener('DOMContentLoaded', resolve, { once: true });
                });
                if (qhtmlInitialImportBarrier) {
                    await qhtmlInitialImportBarrier;
                }
            }

            const raw = extractRawQHtmlSource(this);
            let importResolved = this.__qhtmlResolvedImports;
            if (typeof importResolved !== 'string') {
                importResolved = await resolveQImports(raw);
            }
            delete this.__qhtmlResolvedImports;
            const qhtmlContent = this.preprocessAfterImports(importResolved);

            const parsedRoot = this.parseQHtmlToRoot(qhtmlContent);
            const children = Array.from(parsedRoot.childNodes || []);
            this.replaceChildren(...children);
            finalizeRuntimeComponentHosts(this);
            hydrateGeneratedComponentInstances(this);

            // Temporarily replace HTML content sections with placeholders
        })();
        try {
            return await this.__qhtmlRenderPromise;
        } finally {
            this.__qhtmlRenderPromise = null;
        }
    }

    async preprocess(i_qhtml) {
        // Resolve q-imports first so imported content participates in all
        // later transformations (components, slots, and text helpers).
        const importResolved = await resolveQImports(i_qhtml);
        return this.preprocessAfterImports(importResolved);
    }

    preprocessAfterImports(importResolvedQhtml) {
        let input = importResolvedQhtml;
        // Evaluate only top-level q-script blocks here so component/template
        // structure can still be compiled; nested q-script runs later with DOM this.
        input = evaluateQScriptBlocks(input, { topLevelOnly: true });
        input = stripBlockComments(input);
        input = addSemicolonToProperties(input);
        return transformComponentDefinitionsHelper(input);
    }

    transformComponentDefinitions(input) {
        return transformComponentDefinitionsHelper(input);
    }

    parseQHtmlToRoot(qhtml) {
        const runtimeInput = evaluateQScriptBlocks(qhtml, {
            topLevelOnly: true,
            thisArg: this
        });
        const preprocessedInput = encodeQuotedStrings(runtimeInput);
        const adjustedInput = addClosingBraces(preprocessedInput);
        const root = document.createElement('div');
        root.__qhtmlRoot = true;
        root.__qhtmlHost = this;

        const extract = (typeof window !== 'undefined' && window.extractPropertiesAndChildren)
            ? window.extractPropertiesAndChildren
            : extractPropertiesAndChildren;
        const process = (typeof window !== 'undefined' && window.processSegment)
            ? window.processSegment
            : processSegment;
        const segments = extract(adjustedInput);
        segments.forEach((seg) => process(seg, root));
        flushReadyLifecycleHooks(root, root.__qhtmlHost || root);
        decodeEncodedDomTree(root);
        return root;
    }

    parseQHtml(qhtml) {
        const root = this.parseQHtmlToRoot(qhtml);
        return root.outerHTML;
    }

    initMutationObserver() {
        // Create an observer instance linked to a callback function
        const observer = new MutationObserver((mutationsList, observer) => {
            // For each mutation, check if the type is 'childList', indicating added or removed nodes
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    // Emit a custom event signaling the innerHTML change
                    this.dispatchEvent(new CustomEvent('contentChanged', {
                        detail: {
                            message: 'Content has changed'
                        }
                    }));
                }
            }
        });

        // Start observing the target node for configured mutations
        observer.observe(this, {
            childList: true,
            subtree: true
        });
    }

}

// Define the new element
customElements.define('q-html', QHtmlElement);

// for script blocks in qhtml code
function storeAndExecuteScriptLater(scriptContent) {
    // Store the script content in a closure
    function deferredExecution() {
        try {
            var scriptFunction = new Function(scriptContent);
            var newElement = document.createElement("script");
            newElement.text = scriptContent;
            document.body.appendChild(newElement);

        } catch (error) {
            console.error('script execution error:', error);
        }
    }

    // Use setTimeout to defer execution
    setTimeout(function() { deferredExecution.call() }, 0);
}

// unused for now
const componentRegistry = {};

class QComponent extends HTMLElement {
    slots() {
        return listComponentSlotNames(this);
    }

    into(slotId, payload) {
        injectIntoComponentSlot(this, slotId, payload);
        return this;
    }

    resolveSlots() {
        resolveComponentSlotsInPlace(this);
        return this;
    }

    toTemplate() {
        return toTemplateComponentInstance(this, { recursive: false });
    }

    toTemplateRecursive() {
        return toTemplateComponentInstance(this, { recursive: true });
    }

    connectedCallback() {
        this.style.display = 'none';
        if (this.getAttribute('id')) {
            componentLogger.error('', 'Legacy runtime q-component definitions are no longer supported. Use `q-component component-id { ... }` syntax.');
        }
    }
}

customElements.define('q-component', QComponent);

// renders all HTML in-place of any q-html  then dispatch event when qhtml conversion is complete
window.addEventListener("DOMContentLoaded", function () {

    var elems = document.querySelectorAll("q-html");
    var renders = [];
    ensureInitialImportBarrier().then(function() {
        elems.forEach(function (elem) {
            renders.push(Promise.resolve(elem.render()));
        });
        return Promise.all(renders);
    }).catch(function(err) {
        console.warn('qhtml: render error', err);
    }).finally(function() {
        var qhtmlEvent = new CustomEvent('QHTMLContentLoaded', {});
        document.dispatchEvent(qhtmlEvent);
    });
})

window.addEventListener("QHTMLContentLoaded", function() {
    var qhtmlEvent = new CustomEvent('QHTMLPostProcessComplete', {});
    document.dispatchEvent(qhtmlEvent);
});

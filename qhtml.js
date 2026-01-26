/* created by mike nickaloff
 * https://www.github.com/qhtml/qhtml.js
 * v3.99
 * - added text { } helper for inline text only
 * - fixed html { } so now both work as expected
 * - removed text: and content: properties but they still work for backwards compatability. 
 * - added style { } tags to support styling  without the need for using a style:  attribute .
 * div { 
 *   style { background-color: #00FF33; }
 * }
 * 
 * - also fixed qcomponent bug where slots did not render completely.
 * - Now can inject text { } and html { } elements as direct children of slots
 *
 * This file has been refactored to break down large procedural blocks
 * into discrete helper functions.  These helpers are defined at the
 * top-level of the module and encapsulate specific bits of logic
 * originally nested within methods.  The QHtmlElement class now
 * delegates to these helpers for preprocessing, component expansion
 * and qhtml parsing, improving readability and maintainability.
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
 * Replace backtick-enclosed template strings with their evaluated values.
 * Note: this uses `eval` to compute the result of the template.  Because
 * executing arbitrary JavaScript can be dangerous, only enable this in
 * trusted contexts.
 *
 * @param {string} input The qhtml text containing backtick strings
 * @returns {string} A version of the input with backtick expressions replaced
 */
function replaceBackticksWithQuotes(input) {
    return input.replace(/`([^`]*)`/g, (match, p1) => (eval(p1)));
}

/**
 * Backward-compat pre-pass: convert legacy content/text properties into
 * canonical `text { ... }` blocks so everything flows through the unified
 * text-segment pipeline. Only converts double-quoted values.
 *
 * Examples:
 *   text: "hello";          ->  text { hello }
 *   content: "Hi <b>x</b>"; ->  text { Hi <b>x</b> }
 *   innerText: "foo";       ->  text { foo }
 */
function replaceLegacyTextPropsWithTextBlocks(input) {
    const legacyPropRe = /\b(?:text|content|contents|textcontent|textcontents|innertext)\b\s*:\s*"([^"]*)"\s*;/gi;
    return input.replace(legacyPropRe, (m, val) => `text { ${val} }`);
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
function findTagInvocation(str, id, fromIndex) {
    const re = new RegExp(`(^|[^\\w-])(${escapeReg(id)})\\s*\\{`, 'g');
    re.lastIndex = fromIndex || 0;
    const m = re.exec(str);
    if (!m) return null;
    const braceOpen = m.index + m[0].lastIndexOf('{');
    const tagStart = m.index + (m[1] ? 1 : 0);
    const braceClose = findMatchingBrace(str, braceOpen);
    if (braceClose === -1) return null;
    return { tagStart, braceOpen, braceClose };
}

/**
 * Split a qhtml component invocation body into top-level segments.  A segment
 * corresponds to either a child element (e.g. `div { ... }`) or a property
 * assignment.  Nested blocks within segments are not considered.
 *
 * @param {string} body The content inside a component invocation
 * @returns {Array<{tag: string, block: string}>} An array of child element descriptors
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
            segs.push({ tag: token, block });
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

/**
 * Replace slot placeholders in a component template with content provided
 * via `slotMap`.  Slot placeholders have the form `slot { name: "slotName" }`.
 * If a given slot is missing from the map the placeholder is removed.
 *
 * @param {string} template The template containing slot placeholders
 * @param {Map<string, string>} slotMap Mapping of slot names to replacement content
 * @returns {string} The template with slot placeholders replaced
 */
function replaceTemplateSlots(template, slotMap, options = {}) {
    const { componentId = '', warnOnMissing = true } = options;
    const consumedSlots = new Set();
    let result = template;
    let pos = 0;
    while (true) {
        const s = result.indexOf('slot', pos);
        if (s === -1) break;
        let k = s + 4;
        while (k < result.length && /\s/.test(result[k])) k++;
        if (result[k] !== '{') { pos = k; continue; }
        const open = k;
        const close = findMatchingBrace(result, open);
        if (close === -1) break;
        const inner = result.slice(open + 1, close);
        const flattened = removeNestedBlocks(inner);
        const m = flattened.match(/(?:^|\s)name\s*:\s*"([^"]+)"\s*;?/);
        const slotName = m ? m[1] : '';
        const hasReplacement = slotName && slotMap.has(slotName);
        if (!hasReplacement && slotName && warnOnMissing) {
            componentLogger.warn(componentId, `No content provided for slot "${slotName}".`);
        }
        const replacement = hasReplacement ? slotMap.get(slotName) : '';
        if (hasReplacement) {
            consumedSlots.add(slotName);
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
 * template.  The placeholders have the form `slot { name: "slotName" }`.
 *
 * @param {string} template Component template text
 * @returns {Set<string>} A set of slot names referenced in the template
 */
function collectTemplateSlotNames(template) {
    const names = new Set();
    let pos = 0;
    while (true) {
        const idx = template.indexOf('slot', pos);
        if (idx === -1) break;
        let cursor = idx + 4;
        while (cursor < template.length && /\s/.test(template[cursor])) cursor++;
        if (template[cursor] !== '{') {
            pos = cursor;
            continue;
        }
        const open = cursor;
        const close = findMatchingBrace(template, open);
        if (close === -1) break;
        const inner = template.slice(open + 1, close);
        const flattened = removeNestedBlocks(inner);
        const match = flattened.match(/(?:^|\s)name\s*:\s*"([^"]+)"\s*;?/);
        if (match) {
            names.add(match[1]);
        }
        pos = close + 1;
    }
    return names;
}

/**
 * Parse the top-level slot directives present within a component invocation
 * block.  Directives are any property assignment whose name is `slot` or
 * terminates with `.slot`.
 *
 * @param {string} block Component invocation block
 * @returns {Array<{property: string, value: string}>} Slot directives
 */
function extractTopLevelSlotDirectives(block) {
    const brace = block.indexOf('{');
    if (brace === -1) return [];
    const inner = block.slice(brace + 1, block.lastIndexOf('}'));
    const flattened = removeNestedBlocks(inner);
    const directives = [];
    const re = /([a-zA-Z_][\w\-.]*)\s*:\s*"([^"]+)"\s*;?/g;
    let match;
    while ((match = re.exec(flattened))) {
        const propName = match[1];
        if (propName === 'slot' || propName.endsWith('.slot')) {
            directives.push({ property: propName, value: match[2] });
        }
    }
    return directives;
}

/**
 * Determine which component a slot directive targets and the slot name to
 * be filled.  The directive may specify the target either via the property
 * name (`component.slot: "name"`) or within the value itself
 * (`slot: "component.name"`).  If neither is provided, the current
 * component is assumed.
 *
 * @param {{property: string, value: string}} directive Slot directive descriptor
 * @param {string} defaultTarget The component assumed when no explicit target exists
 * @returns {{target: string, slotName: string}}
 */
function resolveSlotDirectiveTarget(directive, defaultTarget) {
    let target = '';
    let slotName = directive.value.trim();
    if (directive.property !== 'slot' && directive.property.endsWith('.slot')) {
        target = directive.property.slice(0, -5);
    }
    const dotIndex = slotName.indexOf('.');
    if (dotIndex !== -1) {
        const potentialTarget = slotName.slice(0, dotIndex).trim();
        const potentialSlot = slotName.slice(dotIndex + 1).trim();
        if (potentialSlot) {
            if (!target) {
                target = potentialTarget;
            }
            slotName = potentialSlot;
        }
    }
    if (!target) {
        target = defaultTarget || '';
    }
    return { target, slotName };
}

/**
 * Remove the specified slot directives from a component invocation block.
 * Each directive is removed exactly once, preserving the remainder of the
 * block content for further processing.
 *
 * @param {string} block Component invocation block
 * @param {Array<{property: string, value: string}>} directives Directives to remove
 * @returns {string} The block without the specified directives
 */
function removeSlotDirectivesFromBlock(block, directives) {
    return directives.reduce((acc, directive) => {
        const escapedName = escapeReg(directive.property);
        const escapedValue = escapeReg(directive.value);
        const pattern = new RegExp(`(\\s*)${escapedName}\\s*:\\s*"${escapedValue}"\\s*;?`);
        return acc.replace(pattern, '$1');
    }, block);
}

/**
 * Expand component definitions found in qhtml.  This function searches for
 * `q-component` blocks, extracts their templates, and then replaces any
 * invocations of those components with expanded HTML according to the
 * provided slots.  The returned string has all component definitions and
 * invocations resolved.
 *
 * @param {string} input Raw qhtml containing component definitions and invocations
 * @returns {string} The qhtml with components expanded
 */
function transformComponentDefinitionsHelper(input) {
    const defs = [];
    let out = input;
    let idx = 0;
    while (true) {
        const start = out.indexOf('q-component', idx);
        if (start === -1) break;
        const open = out.indexOf('{', start);
        if (open === -1) break;
        const close = findMatchingBrace(out, open);
        if (close === -1) break;
        const block = out.slice(start, close + 1);
        const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
        const idMatch = inner.match(/(?:^|\s)id\s*:\s*"([^"]+)"\s*;?/);
        if (idMatch) {
            const id = idMatch[1];
            const template = stripTopLevelProps(inner, ['id', 'slots']).trim();
            const slotNames = collectTemplateSlotNames(template);
            defs.push({ id, template, slotNames });
            out = out.slice(0, start) + out.slice(close + 1);
            idx = Math.max(0, start - 1);
        } else {
            idx = close + 1;
        }
    }
    const maxPasses = Math.max(1, defs.length * 3);
    let pass = 0;
    let changed = true;

    while (changed && pass < maxPasses) {
        changed = false;
        pass++;
        for (const { id, template, slotNames } of defs) {
            let pos = 0;
            while (true) {
                const k = findTagInvocation(out, id, pos);
                if (!k) break;
                const { tagStart, braceOpen, braceClose } = k;
                const body = out.slice(braceOpen + 1, braceClose);
                const children = splitTopLevelSegments(body);
                const slotMap = new Map();
                for (const seg of children) {
                    const directives = extractTopLevelSlotDirectives(seg.block);
                    if (!directives.length) continue;
                    let handled = false;
                    for (const directive of directives) {
                        const { target, slotName } = resolveSlotDirectiveTarget(directive, id);
                        if (target !== id || !slotName) {
                            continue;
                        }
                        if (slotNames.size && !slotNames.has(slotName)) {
                            componentLogger.error(id, `Content was provided for unknown slot "${slotName}".`);
                            handled = true;
                            break;
                        }
                        const cleanedBlock = removeSlotDirectivesFromBlock(seg.block, [directive]).trim();
                        const existing = slotMap.get(slotName) || '';
                        slotMap.set(slotName, existing + '\n' + cleanedBlock);
                        handled = true;
                        break;
                    }
                    if (!handled && directives.length) {
                        const directive = directives[0];
                        const { target } = resolveSlotDirectiveTarget(directive, id);
                        if (target && target !== id) {
                            componentLogger.warn(id, `Encountered slot directive targeting "${target}". Nested component slot assignment is left untouched.`);
                        }
                    }
                }
                const expanded = replaceTemplateSlots(template, slotMap, { componentId: id });
                out = out.slice(0, tagStart) + expanded + out.slice(braceClose + 1);
                pos = tagStart + expanded.length;
                changed = true;
            }
        }
    }

    if (changed) {
        componentLogger.warn('', `Component expansion stopped after ${maxPasses} passes; recursive components may remain.`);
    }
    return out;
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

  // Per-segment helpers
  const beginHtml = (tag) => {
    currentSegment = { type: 'html', tag, content: '', _buf: [] };
  };
  const appendHtml = (ch) => currentSegment && currentSegment._buf.push(ch);
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
    currentSegment = { type: 'text', tag, content: '', _buf: [] };
  };
  const appendText = (ch) => currentSegment && currentSegment._buf.push(ch);
  const endText = () => {
    // For symmetry with html/css we URI-encode; will decode at render time.
    currentSegment.content = encodeURIComponent(currentSegment._buf.join(''));
    segments.push(currentSegment);
    currentSegment = null;
  };

  // NOTE: we never mutate `input` while scanning; we just move `i`
  for (let i = 0; i < input.length; i++) {
    // Inside inline HTML
    if (currentSegment && currentSegment.type === 'html') {
      if (input[i] === '}') {
        // End of HTML block: close the segment and decrement nesting level
        endHtml();
        nestedLevel--;
        // After closing an inline HTML block at this level, process the rest of the input
        const rest = input.substring(i + 1);
        return segments.concat(extractPropertiesAndChildren(rest));
      }
      appendHtml(input[i]);
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
      if (input[i] === '}') {
        // End of text block: close the segment and decrement nesting level
        endText();
        nestedLevel--;
        // After closing an inline TEXT block at this level, process the rest of the input
        const rest = input.substring(i + 1);
        return segments.concat(extractPropertiesAndChildren(rest));
      }
      appendText(input[i]);
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

        if (tag === 'html') { beginHtml(tag); continue; }
        if (tag === 'css')  { beginCss(tag); continue; }
        if (tag === 'text') { beginText(tag); continue; }
        if (tag === 'style') { beginStyleBlock(tag); continue; }

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
  // Insert as a pure text node (no wrapper, no HTML parsing)
  parentElement.appendChild(document.createTextNode(textString));
}


/**
 * Process a property segment.  Handles static properties, content/text
 * assignments and dynamic JavaScript functions.  Event handler properties
 * are assigned directly to the parent element.
 *
 * @param {object} segment The property segment descriptor
 * @param {HTMLElement} parentElement The DOM element receiving the property
 */
function processPropertySegment(segment, parentElement) {
    if (segment.isFunction) {
        let fnBody = segment.value;
        try {
            fnBody = decodeURIComponent(fnBody);
        } catch {
            // ignore decoding errors and use raw body
        }
        try {
            const fn = new Function(fnBody);
            const propName = segment.name;
            if (propName === 'content' || propName === 'contents' || propName === 'text' || propName === 'textcontent' || propName === 'textcontents' || propName === 'innertext') {
                let result;
                try {
                    result = fn.call(parentElement);
                } catch (err) {
                    console.error('Error executing function for property', propName, err);
                    result = '';
                }
                parentElement.innerHTML = result;
            } else if (/^on\w+/i.test(propName)) {
                const handler = function(event) {
                    try {
                        return fn.call(this, event);
                    } catch (err) {
                        console.error('Error executing event handler for', propName, err);
                    }
                };
                parentElement[propName.toLowerCase()] = handler;
            } else {
                let result;
                try {
                    result = fn.call(parentElement);
                } catch (err) {
                    console.error('Error executing function for property', propName, err);
                    result = '';
                }
                parentElement.setAttribute(propName, result);
            }
        } catch (err) {
            console.error('Failed to compile function for property', segment.name, err);
        }
    } else {
        if (segment.name === 'content' || segment.name === 'contents' || segment.name === 'text' || segment.name === 'textcontent' || segment.name === 'textcontents' || segment.name === 'innertext') {
            parentElement.innerHTML = decodeURIComponent(segment.value);
        } else {
            parentElement.setAttribute(segment.name, segment.value);
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
        const regex = /<(\w+)[\s>]/;
        const match = tagName.match(regex);
        return document.createElement(match ? match[1].toLowerCase() : tagName);
    };
    if (segment.tag.includes(',')) {
        const tags = segment.tag.split(',').map(t => t.trim());
        let currentParent = parentElement;
        tags.forEach(tag => {
            const newElement = createElementFromTag(tag);
            currentParent.appendChild(newElement);
            currentParent = newElement;
        });
        const childSegments = extractPropertiesAndChildren(segment.content);
        childSegments.forEach(childSegment => processSegment(childSegment, currentParent));
    } else {
        const newElement = createElementFromTag(segment.tag);
        if (segment.tag === 'script' || segment.tag === 'q-painter') {
            storeAndExecuteScriptLater(segment.content);
            newElement.text = segment.content;
            parentElement.appendChild(newElement);
        } else {
            const childSegments = extractPropertiesAndChildren(segment.content);
            childSegments.forEach(childSegment => processSegment(childSegment, newElement));
            parentElement.appendChild(newElement);
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

    const content = segment.content;

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

// Expose helper functions on the global window object so that parseQHtml can
// reliably reference the top-level implementations. Without this, nested
// function definitions hoisted within parseQHtml may shadow the helpers.
if (typeof window !== 'undefined') {
    window.extractPropertiesAndChildren = extractPropertiesAndChildren;
    window.processSegment = processSegment;
}

class QHtmlElement extends HTMLElement {
    constructor() {
        super();
        this.initMutationObserver();
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const qhtmlContent = this.preprocess(this.innerHTML.trim().replace(/^"|"$/g, ''));

        const htmlContent = this.parseQHtml(qhtmlContent);

        const regex = /"{1}([^\"]*)"{1}/mg;
        this.innerHTML = htmlContent.replace(regex, (match, p1) => `"${decodeURIComponent(p1)}"`); // Modify this line

        // Temporarily replace HTML content sections with placeholders

    }

    preprocess(i_qhtml) {
        // Delegate to top-level helpers for preprocessing.  The helpers
        // perform semicolon insertion, backtick replacement and component
        // expansion in sequence.  See the helper implementations above for
        // details.  Additional preprocessing steps can be inserted here
        // without modifying the core helpers.
        let input = stripBlockComments(i_qhtml);
        input = addSemicolonToProperties(input);
        input = replaceBackticksWithQuotes(input);
        input = replaceLegacyTextPropsWithTextBlocks(input);
        return transformComponentDefinitionsHelper(input);
    }

// unused for now
// --- replace the existing transformComponentDefinitions with this version ---
transformComponentDefinitions(input) {
        // Delegate to top-level helper for expanding q-component definitions.
        // The original implementation remains in place below this line for
        // reference but is bypassed by this early return.
        return transformComponentDefinitionsHelper(input);
        // 1) Extract all q-component blocks with balanced braces
    const defs = []; // { id, template }   (template = inner qhtml of the component)
    let out = input;
    let idx = 0;

    while (true) {
        const start = out.indexOf('q-component', idx);
        if (start === -1) break;

        const open = out.indexOf('{', start);
        if (open === -1) break;

        const close = findMatchingBrace(out, open);
        if (close === -1) break;

        const block = out.slice(start, close + 1);
        const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));

        // pull id: "..."
        const idMatch = inner.match(/(?:^|\s)id\s*:\s*"([^"]+)"\s*;?/);
        if (idMatch) {
            const id = idMatch[1];

            // component template is the inner content with top-level id:/slots: removed
            const template = stripTopLevelProps(inner, ['id', 'slots']).trim();

            defs.push({ id, template });

            // remove the whole q-component block from the document
            out = out.slice(0, start) + out.slice(close + 1);
            // move idx back a bit to catch adjacent content safely
            idx = Math.max(0, start - 1);
        } else {
            // no id? skip it safely
            idx = close + 1;
        }
    }

    // 2) For each component def, expand invocations:  my-comp { ... }  ->  template with slots filled
    for (const { id, template } of defs) {
        let pos = 0;
        while (true) {
            // find <id> { ... }
            const k = findTagInvocation(out, id, pos);
            if (!k) break;

            const { tagStart, braceOpen, braceClose } = k;
            const body = out.slice(braceOpen + 1, braceClose);

            // Get top-level child segments of the invocation body (e.g., div { ... }, span { ... }, html { ... })
            const children = splitTopLevelSegments(body); // [{tag, block}]  where block is the full 'tag { ... }'

            // Build slot->content mapping from children that have a top-level `slot: "name"` property
            const slotMap = new Map();
            for (const seg of children) {
                const slotName = extractTopLevelSlotName(seg.block);
                if (!slotName) continue;

                // strip the 'slot: "name";' property from the child block for clean injection
                const cleaned = stripTopLevelProps(seg.block, ['slot']).trim();
                const existing = slotMap.get(slotName) || '';
                slotMap.set(slotName, existing + '\n' + cleaned);
            }

            // Replace template slots:  slot { name: "slot-1" }  with mapped content (or nothing)
            const expanded = replaceTemplateSlots(template, slotMap);

            // Replace the invocation in the source with the expanded template
            out = out.slice(0, tagStart) + expanded + out.slice(braceClose + 1);

            // Continue scanning after the inserted template
            pos = tagStart + expanded.length;
        }
    }

    return out;

    // ---------- helpers (scoped inside the same object for minimal diff) ----------

    // find the index of the matching '}' for the '{' at openIdx (supports nesting)
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

    // strip specific top-level properties (e.g., id, slots, slot) from a block content
    // Note: only removes occurrences that are at top-level (not inside nested braces)
    function stripTopLevelProps(blockContent, propNames) {
        let out = '';
        let i = 0, depth = 0, tokenStart = 0;

        // Quick-pass removal using regex for each prop while guarding top-level with a manual scan.
        // Strategy: split by semicolons at top level, filter props, then rejoin.
        const parts = [];
        let cur = '';
        while (i < blockContent.length) {
            const ch = blockContent[i];
            if (ch === '{') { depth++; cur += ch; i++; continue; }
            if (ch === '}') { depth--; cur += ch; i++; continue; }
            if (ch === ';' && depth === 0) {
                parts.push(cur + ';');
                cur = '';
                i++;
                continue;
            }
            cur += ch;
            i++;
        }
        if (cur.trim()) parts.push(cur);

        const keep = parts.filter(p => {
            const m = p.match(/^\s*([a-zA-Z_][\w\-]*)\s*:/);
            if (!m) return true;
            return !propNames.includes(m[1]);
        });

        return keep.join('').trim();
    }

    // locate `id { ... }` treating id as a tag-like token followed by a balanced block
    function findTagInvocation(str, id, fromIndex) {
        // ensure the id is a standalone tag token immediately before a '{'
        // allow leading whitespace and line breaks
        const re = new RegExp(`(^|[^\\w-])(${escapeReg(id)})\\s*\\{`, 'g');
            re.lastIndex = fromIndex || 0;
            const m = re.exec(str);
            if (!m) return null;

            const braceOpen = m.index + m[0].lastIndexOf('{');
            const tagStart = m.index + (m[1] ? 1 : 0);
            const braceClose = findMatchingBrace(str, braceOpen);
            if (braceClose === -1) return null;

            return { tagStart, braceOpen, braceClose };
        }

        function escapeReg(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // split top-level segments like:   div { ... }  span { ... }  html { ... }
        function splitTopLevelSegments(body) {
            const segs = [];
            let i = 0;
            while (i < body.length) {
                // skip whitespace
                while (i < body.length && /\s/.test(body[i])) i++;
                if (i >= body.length) break;

                // read tag token up to '{' or ':'
                let j = i;
                while (j < body.length && !/[{:]/.test(body[j])) j++;
                    const token = body.slice(i, j).trim();
                    if (!token) break;

                    if (body[j] === '{') {
                        const open = j;
                        const close = findMatchingBrace(body, open);
                        if (close === -1) break;
                        const block = `${token} ${body.slice(open, close + 1)}`;
                        segs.push({ tag: token, block });
                        i = close + 1;
                    } else {
                        // property (not a child element) — skip to next semicolon at top-level
                        // This is not a child element; leave it as-is
                        const semi = body.indexOf(';', j);
                        if (semi === -1) break;
                        i = semi + 1;
                    }
                }
                return segs;
            }

            // read a top-level slot name property from a child block:  <tag> { slot: "name"; ... }
            function extractTopLevelSlotName(block) {
                // block looks like:  tag { ... }
                const brace = block.indexOf('{');
                if (brace === -1) return '';
                const inner = block.slice(brace + 1, block.lastIndexOf('}'));
                // Only inspect top-level; trivial approach: remove nested blocks first
                const flattened = removeNestedBlocks(inner);
                const m = flattened.match(/(?:^|\s)slot\s*:\s*"([^"]+)"\s*;?/);
                return m ? m[1] : '';
            }

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

            // Replace all template slot placeholders:  slot { name: "slot-1" ... }  -> slotMap.get('slot-1') || ''
            function replaceTemplateSlots(template, slotMap) {
                let result = template;
                let pos = 0;

                while (true) {
                    // find a 'slot {'
                    const s = result.indexOf('slot', pos);
                    if (s === -1) break;

                    // ensure followed by '{' (allow whitespace)
                    let k = s + 4;
                    while (k < result.length && /\s/.test(result[k])) k++;
                    if (result[k] !== '{') { pos = k; continue; }

                    const open = k;
                    const close = findMatchingBrace(result, open);
                    if (close === -1) break;

                    const slotBlock = result.slice(s, close + 1);
                    const inner = result.slice(open + 1, close);

                    // flatten top-level to find name:""
                    const flattened = removeNestedBlocks(inner);
                    const m = flattened.match(/(?:^|\s)name\s*:\s*"([^"]+)"\s*;?/);
                    const slotName = m ? m[1] : '';

                    // replace whole slot block
                    const replacement = slotName && slotMap.has(slotName) ? slotMap.get(slotName) : '';
                    result = result.slice(0, s) + replacement + result.slice(close + 1);
                    pos = s + replacement.length;
                }
                return result;
            }
        }


        //parse all text and convert this element's contents into HTML
        parseQHtml(qhtml) {
        // Use the refactored pipeline to convert qhtml into HTML.  The
        // preprocessed input is encoded, balanced for braces, broken into
        // segments and then assembled into a DOM tree via helper functions.
        const _preprocessedInput = encodeQuotedStrings(qhtml);
        const _adjustedInput = addClosingBraces(_preprocessedInput);
        const _root = document.createElement('div');
        _root.__qhtmlRoot = true;
        // Always use the top-level extract/process helpers rather than any nested versions
        const _extract = (typeof window !== 'undefined' && window.extractPropertiesAndChildren) ? window.extractPropertiesAndChildren : extractPropertiesAndChildren;
        const _process = (typeof window !== 'undefined' && window.processSegment) ? window.processSegment : processSegment;
        const _segments = _extract(_adjustedInput);
        _segments.forEach(seg => _process(seg, _root));
        return _root.outerHTML;

            // Function to find the matching closing brace for each opening brace and add closing braces accordingly
            function addClosingBraces(input) {
                let depth = 0;
                let result = '';

                for (let i = 0; i < input.length; i++) {
                    if (input[i] === '{') {
                        depth++;
                    } else if (input[i] === '}') {
                        depth--;
                        if (depth < 0) {
                            result += '} '.repeat(-depth); // Add extra closing braces as needed
                            depth = 0;
                        }
                    }
                    result += input[i];
                }

                return result + '} '.repeat(depth); // Add any remaining closing braces at the end
            }

            function preprocess(i_qhtml) {
                const regex = /"{1}([^\"]*)"{1}/mg;

                // Alternative syntax using RegExp constructor
                // const regex = new RegExp('[^\\:]+:[^\\"]+"{1}(1:[^\\"]*)"{1}', 'mg')


                let m;
                var new_qhtml = i_qhtml.replace(regex, (match, p1) => `"${encodeURIComponent(p1)}"`);
                while ((m = regex.exec(i_qhtml)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }

                    // The result can be accessed through the `m`-variable.
                    //console.log(m);
                    m.forEach((match, groupIndex) => {

                        //		console.log(`Found	 match, group ${groupIndex}: ${match}`);


                    });

                }

                return new_qhtml;
            }
            const preprocessedInput = preprocess(qhtml);
            const adjustedInput = addClosingBraces(preprocessedInput);

            function extractPropertiesAndChildren(input) {
                const segments = [];
                let nestedLevel = 0;
                let segmentStart = 0;
                let currentProperty = null;
                var isHTML = false;
                var isCSS = false;
                var cssNestingLevel = 0;
                var htmlString = "";

                for (let i = 0; i < input.length; i++) {
                    if (isHTML) {
                        if (input[i] === "}") {
                            isHTML = false;
                            currentProperty.content = encodeURIComponent(htmlString);
                            segments.push(currentProperty);
                            currentProperty = null;
                            //htmlString = "";
                            // NOTE: do NOT mutate `input` here; allow the for-loop to continue naturally
                            // The loop will advance past this '}' and keep scanning the remaining siblings.
                            continue;
                        } else {
                            htmlString += input[i];
                            continue;
                        }
                    }
                    if (isCSS) {
                        if (input[i] === "}") {
                            cssNestingLevel--;
                            if (cssNestingLevel == 0) {
                                isCSS = false;
                                currentProperty.content = encodeURIComponent(htmlString);
                                segments.push(currentProperty);
                                currentProperty = null;

                                // Reset input to process remaining elements/properties
                                input = input.substring(i + 1);
                                i = -1; // Reset loop index
                                continue;
                            } else {
                                input = input.substring(i + 1);
                                i = -1; // Reset loop index
                                htmlString = htmlString.concat(input[i] ?? "");
                            }
                        } else {
                            if (input[i] === "{") {
                                cssNestingLevel++;
                                continue;

                            } else {
                                htmlString = htmlString.concat(input[i]);
                                continue;
                            }
                        }
                    } else {
                        if (input[i] === "{") {
                            nestedLevel++;
                            if (nestedLevel === 1) {
                                segmentStart = i + 1; // Start after the opening brace
                                const tag = input.substring(0, i).trim();
                                if (tag === "html") {

                                    currentProperty = {
                                        type: 'html',
                                        tag,
                                        content: ''
                                    };
                                    isHTML = true;
                                    htmlString = "";
                                    continue;
                                } else if (tag === "css") {
                                    currentProperty = {
                                        type: 'css',
                                        tag,
                                        content: ''
                                    };
                                    isCSS = true; // (fixed)
                                    cssNestingLevel = 1;
                                    htmlString = "";
                                    continue;

                                } else {
                                    currentProperty = {
                                        type: 'element',
                                        tag,
                                        content: ''
                                    };
                                }
                            }
                        } else if (input[i] === "}") {
                            nestedLevel--;
                            if (nestedLevel === 0 && currentProperty !== null) {
                                // When closing an element, add its content and reset currentProperty
                                currentProperty.content = input.substring(segmentStart, i).trim();
                                segments.push(currentProperty);
                                currentProperty = null;

                                // Reset input to process remaining elements/properties
                                input = input.substring(i + 1).trim();
                                i = -1; // Reset loop index
                            }
                        } else if (nestedLevel === 0 && input[i] === ":") {
                            // Handle properties only at the root level (nestedLevel === 0)
                            // Extract the property name and the remainder of the input after the colon
                            const propName = input.substring(0, i).trim();
                            let remainder = input.substring(i + 1).trim();
                            // If the remainder begins with a function block (enclosed in braces),
                            // parse until the matching closing brace instead of to the next semicolon.
                            if (remainder.startsWith('{')) {
                                let braceCount = 0;
                                let endIndex = 0;
                                for (let j = 0; j < remainder.length; j++) {
                                    const ch = remainder[j];
                                    if (ch === '{') {
                                        braceCount++;
                                    } else if (ch === '}') {
                                        braceCount--;
                                        // When braceCount returns to 0, we've found the end of the function body
                                        if (braceCount === 0) {
                                            endIndex = j;
                                            break;
                                        }
                                    }
                                }
                                // Extract the function body (without the outer braces)
                                const fnBody = remainder.substring(1, endIndex).trim();
                                // Skip past the closing brace and any following semicolon
                                let skipIndex = endIndex + 1;
                                if (remainder[skipIndex] === ';') {
                                    skipIndex++;
                                }
                                // Push a property segment marked as a function
                                segments.push({
                                    type: 'property',
                                    name: propName,
                                    value: fnBody,
                                    isFunction: true
                                });
                                // Remove the parsed portion from input and restart parsing
                                input = remainder.substring(skipIndex).trim();
                                i = -1;
                            } else {
                                // Regular property value ends at the next semicolon
                                let propEnd = remainder.indexOf(";");
                                if (propEnd !== -1) {
                                    let propertyValue = remainder.substring(0, propEnd).trim();
                                    // Remove surrounding quotes if present
                                    propertyValue = propertyValue.replace(/^"/, '').replace(/"$/, '');
                                    segments.push({
                                        type: 'property',
                                        name: propName,
                                        value: propertyValue
                                    });
                                    // Adjust the remaining input and restart the loop
                                    input = remainder.substring(propEnd + 1).trim();
                                    i = -1;
                                }
                            }
                        }
                    }
                }
                console.log(JSON.stringify(segments))
                return segments;
            }

            function processSegment(segment, parentElement) {
                if (segment.type === 'property') {
                    // If this property contains a JavaScript function definition, evaluate accordingly
                    if (segment.isFunction) {
                        // Retrieve the stored function body. It may contain percent-encoded
                        // segments due to earlier preprocessing, so decode them before
                        // constructing the function. If decoding fails, fall back to
                        // the raw body.
                        let fnBody = segment.value;
                        try {
                            fnBody = decodeURIComponent(fnBody);
                        } catch (e) {
                            // Use original if decoding fails.
                        }
                        try {
                            // Create the function from the body
                            const fn = new Function(fnBody);
                            const propName = segment.name;
                            // Content/text properties: call the function and assign the return value to innerHTML
                            if (propName === 'content' || propName === 'contents' || propName === 'text' || propName === 'textcontent' || propName === 'textcontents' || propName === 'innertext') {
                                let result;
                                try {
                                    result = fn.call(parentElement);
                                } catch (err) {
                                    console.error('Error executing function for property', propName, err);
                                    result = '';
                                }
                                parentElement.innerHTML = result;
                            } else if (/^on\w+/i.test(propName)) {
                                // Event handler properties: assign a function that invokes the provided body
                                const handler = function(event) {
                                    try {
                                        return fn.call(this, event);
                                    } catch (err) {
                                        console.error('Error executing event handler for', propName, err);
                                    }
                                };
                                parentElement[propName.toLowerCase()] = handler;
                            } else {
                                // Other attributes: call the function and assign its return value as attribute
                                let result;
                                try {
                                    result = fn.call(parentElement);
                                } catch (err) {
                                    console.error('Error executing function for property', propName, err);
                                    result = '';
                                }
                                parentElement.setAttribute(propName, result);
                            }
                        } catch (err) {
                            console.error('Failed to compile function for property', segment.name, err);
                        }
                    } else {
                        // Regular property handling
                        if (segment.name === 'content' || segment.name === 'contents' || segment.name === 'text' || segment.name === 'textcontent' || segment.name === 'textcontents' || segment.name === 'innertext') {
                            parentElement.innerHTML = decodeURIComponent(segment.value);
                        } else {
                            if (segment.name === 'style' || segment.name === 'script' || segment.name === 'q-painter' || segment.name === 'css') {
                                parentElement.setAttribute(segment.name, segment.value);

                            } else {

                                parentElement.setAttribute(segment.name, segment.value);
                            }
                        }
                    }
                } else if (segment.type === 'element') {
                    if (segment.tag.includes(',')) {
                        // Split the tag by comma and trim each tag name
                        const tags = segment.tag.split(',').map(tag => tag.trim());
                        // Recursively create nested elements for each tag
                        let currentParent = parentElement;
                        tags.forEach(tag => {
                            function getTagNameFromHTML(htmlSnippet) {
                                var regex = /<(\w+)[\s>]/;
                                var match = htmlSnippet.match(regex);
                                return match ? match[1].toLowerCase() : '';
                            }
                            const newElement = document.createElement(getTagNameFromHTML(tag) === '' ? tag : getTagNameFromHTML(tag));
                            currentParent.appendChild(newElement);
                            currentParent = newElement; // Update the current parent to the newly created element

                        });
                        const childSegments = extractPropertiesAndChildren(segment.content);
                        childSegments.forEach(childSegment => processSegment(childSegment, currentParent));
                    } else {
                        function getTagNameFromHTML(htmlSnippet) {
                            var regex = /<(\w+)[\s>]/;
                            var match = htmlSnippet.match(regex);
                            return match ? match[1].toLowerCase() : '';
                        }
                        const newElement = document.createElement(getTagNameFromHTML(segment.tag) === '' ? segment.tag : getTagNameFromHTML(segment.tag));

                        if (segment.tag === 'script' || segment.tag === 'q-painter') {

                            storeAndExecuteScriptLater(segment.content)
                            newElement.text = segment.content;
                            parentElement.appendChild(newElement);

                        } else {
                            if (segment.tag === 'asdf-component') {}
                            else {

                                const childSegments = extractPropertiesAndChildren(segment.content);
                                childSegments.forEach(childSegment => processSegment(childSegment, newElement));
                                parentElement.appendChild(newElement);
                            }
                        }
                    }
                } else {
                                    if (segment.type === 'html') {
                                            // Inline HTML injection: decode the stored HTML string,
                                            // parse it into a temporary container, and append each
                                            // resulting node directly into the current parent.  This
                                            // preserves the exact ordering relative to siblings and
                                            // avoids wrapping the content in a surrogate element.
                                            let htmlString;
                                            try {
                                                    htmlString = decodeURIComponent(segment.content);
                                                } catch {
                                                        htmlString = segment.content;
                                                    }
                                                    const tempContainer = document.createElement('div');
                                                    tempContainer.innerHTML = htmlString;
                                                    while (tempContainer.firstChild) {
                                                            parentElement.appendChild(tempContainer.firstChild);
                                                        }
                                                        return;
                                                    }
                    if (segment.type === 'css') {
                        parentElement.setAttribute("style", segment.content);
                    }
                }
            }

            const root = document.createElement('div');
            const segments = extractPropertiesAndChildren(adjustedInput); // Use the adjusted input
            segments.forEach(segment => processSegment(segment, root));

            return root.outerHTML;
        }

        //unusd for now
        convertComponents(inputText) {
            const regex = /q-component\s*{\s*id:\s*"([^"]+)"\s*([^}]*)}/g;
            let match;

            while ((match = regex.exec(inputText)) !== null) {
                const id = match[1];
                const content = match[2].trim();

                class CustomComponent extends HTMLElement {
                    connectedCallback() {
                        this.innerHTML = content;
                    }
                }

                customElements.define(id, CustomComponent);

                const elements = document.getElementsByTagName(id);
                for (let i = 0; i < elements.length; i++) {
                    elements[i].innerHTML = content;
                }
            }
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
    connectedCallback() {
        this.style.display = 'none';
        const componentName = this.getAttribute('id');
        var slots = [];
        try {
            slots = this.getAttribute('slots').split(',');
        } catch {
            slots = [];
        }
        if (componentName && !customElements.get(componentName)) {
            const templateContent = this.innerHTML;
            this.registerCustomElement(componentName, templateContent,slots);
            this.outerHTML = ''; // Clear the initial content to avoid duplication
        }
    }

    registerCustomElement(name, content,slots) {
        const elementClass = this.createCustomElementClass(name, content, slots)
    }
    createCustomElementClass(name, content, slots) {
        var myAttributes = { "slot": this.innerHTML };
        slots.forEach(function(attr) { myAttributes[attr.trim()] = ""; });
        return class extends HTMLElement {
            constructor() {
                super();
                // Lay down template HTML immediately
                this.innerHTML = +content;
            }
            static get observedAttributes() {
                return ['slot'].concat(slots);
            }
            attributeChangedCallback(name, oldValue, newValue) {
                if (name === 'slot') {
                    this.replaceSlotContent();
                }
                if (slots.indexOf(name) !== -1) {
                    this.replaceCustomSlotContent(name);
                }
            }
            connectedCallback() {
                // Collect any light-DOM children that specify slot content via attribute: slot="name"
                const carriers = this.querySelectorAll('[slot]');
                carriers.forEach(carrier => {
                    const sName = carrier.getAttribute('slot');
                    if (!sName) return;
                    // Save the HTML into the component's attribute (no encoding necessary)
                    this.setAttribute(sName, carrier.innerHTML);
                    // Remove the carrier node from the light DOM
                    carrier.remove();
                });

                // Now fill default <slot> and custom-named placeholders
                this.replaceSlotContent();
                slots.forEach((sName) => {
                    this.replaceCustomSlotContent(sName);
                });
            }
            replaceSlotContent() {
                const html = this.getAttribute('slot');
                if (html == null) return;
                this.querySelectorAll('slot').forEach(elem => {
                    elem.innerHTML += html;
                });
            }
            replaceCustomSlotContent(slotName) {
                const html = this.getAttribute(slotName);
                if (html == null) return;
                // a) <slot name="slotName">
                this.querySelectorAll('slot[name="' + slotName + '"]').forEach(elem => {
                    elem.innerHTML += html;
                });
                // b) <slotname> custom tag placeholder
                this.querySelectorAll(slotName).forEach(elem => {
                    elem.innerHTML = html;
                });
            }
        };


    }

}

customElements.define('q-component', QComponent);

// renders all HTML in-place of any q-html  then dispatch event when qhtml conversion is complete
window.addEventListener("DOMContentLoaded", function () {

    var elems = document.querySelectorAll("q-html")
    elems.forEach(function (elem) {

        elem.render();

    })
    var qhtmlEvent = new CustomEvent('QHTMLContentLoaded', {});
    document.dispatchEvent(qhtmlEvent);
})

window.addEventListener("QHTMLContentLoaded", function() {
    var qhtmlEvent = new CustomEvent('QHTMLPostProcessComplete', {});
    document.dispatchEvent(qhtmlEvent);
});


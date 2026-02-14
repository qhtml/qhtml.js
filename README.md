# QHTML.js (Quick HTML)

QHTML is a compact, readable way to write HTML using a CSS-like block syntax. It turns short, clean markup into real HTML at runtime, without extra boilerplate. Drop your markup inside a `<q-html>` tag, include `qhtml.js`, and the browser renders normal HTML for you.

This README is written for builders who want a quick, reliable way to author UI without a heavy framework. Examples below are ready to copy and run.

## Highlights

- Write HTML structure with a clean, readable block syntax.
- Use standard HTML attributes and event handlers.
- Inline HTML or plain text blocks where needed.
- Build reusable components with slots.
- Optional add-ons: `w3-tags.js` and `bs-tags.js` for shorthand UI markup.

## Quick Start

1. Include the script

```html
<script src="qhtml.js"></script>
```

2. Write QHTML

```html
<q-html>
  div {
    class: "card"
    h1 { text { Hello QHTML } }
    p { text { Small markup, big results. } }
  }
</q-html>
```

3. Resulting HTML

```html
<div class="card">
  <h1>Hello QHTML</h1>
  <p>Small markup, big results.</p>
</div>
```

## Core Syntax

### Elements and nesting

QHTML uses a CSS-style block to describe nested elements.

QHTML:

```qhtml
<q-html>
  div {
    h2 { text { Title } }
    p { text { A short paragraph. } }
  }
</q-html>
```

HTML:

```html
<div>
  <h2>Title</h2>
  <p>A short paragraph.</p>
</div>
```

### Attributes

Attributes use `name: "value"` inside a block.

QHTML:

```qhtml
<q-html>
  a {
    href: "https://example.com"
    class: "link"
    text { Visit Example }
  }
</q-html>
```

HTML:

```html
<a href="https://example.com" class="link">Visit Example</a>
```

### Text and HTML and Style blocks

Use `text { ... }` for plain text and `html { ... }` for raw HTML. 
Also you can include `style { ... }` for element specific CSS  which can be written in normal CSS.

QHTML:

```qhtml
<q-html>
  p {
    style { 
      font-size: 24px; 
      margin-top: 4px;
    }
    text { This is plain text. }
  }
  p {
    html { <strong>This is real HTML.</strong> }
  }
</q-html>
```

HTML:

```html
<p style="font-size: 24px;margin-top:4px;">This is plain text.</p>
<p><strong>This is real HTML.</strong></p>
```

### Multi-tag shorthand

Use commas to nest multiple tags in a single line.

QHTML:

```qhtml
<q-html>
  p,center,a {
    href: "https://example.com"
    text { Visit Example }
  }
</q-html>
```

HTML:

```html
<p><center><a href="https://example.com">Visit Example</a></center></p>
```

## Events and page initialization

### QHTMLContentLoaded

`qhtml.js` triggers a `QHTMLContentLoaded` event when it finishes converting QHTML into HTML. If you need to run logic that touches rendered elements (for example, attach listeners or read dimensions), do it inside this event.

```html
<script>
  document.addEventListener("QHTMLContentLoaded", function () {
    const button = document.querySelector("#saveButton");
    if (button) {
      button.addEventListener("click", function () {
        console.log("Button ready and wired");
      });
    }
  });
</script>
```

### Inline event handlers

You can use the standard attribute form:

```qhtml
<q-html>
  button {
    onclick: "alert('Hello')"
    text { Click me }
  }
</q-html>
```

And you can also use the new `on*` block syntax for cleaner event bodies with support for multiple lines and other complex javascript:

QHTML:

```qhtml
<q-html>
  div {
    id: "mydiv"
    onclick {
      var md = document.getElementById("mydiv");
      md.innerHTML += "Clicked (again)";
    }
  }
</q-html>
```

This is converted into an `onclick` attribute. The handler body is compacted into a single line and double quotes are converted to single quotes so it fits inside the attribute safely.

HTML (conceptual):

```html
<div id="mydiv" onclick="var md = document.getElementById('mydiv'); md.innerHTML += 'Clicked (again)';"></div>
```

- *Note*: The onEvent grammar can not contain any single quotations in it, so instead of using single quotes for edge cases, use backticks or move the javascript outside of the QHTML context entirely in a separate script block and function, then call the function from onclick.

### Lifecycle ready hooks: `onReady {}`, `onLoad {}`, `onLoaded {}`

These three names are aliases for the same lifecycle behavior. They run after the node has been parsed and appended on the QHTML side.

- Inside an element block, `this` is that rendered element.
- At top-level (no parent element), `this` is the `<q-html>` host element.

QHTML:

```qhtml
<q-html>
  div {
    class: "card"
    onReady {
      console.log("element ready:", this.outerHTML)
    }
  }
</q-html>
```

Behavior:

- The `div` is rendered first.
- Then the lifecycle block executes.
- `this.outerHTML` logs the final rendered `<div ...>` markup.

Top-level host example:

```qhtml
<q-html>
  onLoad {
    console.log("host tag:", this.tagName)
  }
  p { text { Hello } }
</q-html>
```

## Components and slots (q-component)

`q-component` lets you create reusable UI blocks with named slots.

You can define a component name directly after `q-component`:

```qhtml
q-component card-panel {
  div {
    class: "card"
    slot { name: "content" }
  }
}
```

This is equivalent to:

```qhtml
q-component {
  id: "card-panel"
  div {
    class: "card"
    slot { name: "content" }
  }
}
```

QHTML:

```qhtml
q-component {
  id: "text-bar"
  div {
    class: "w3-bar w3-blue"
    span {
      slot { name: "left" }
    }
    slot { name: "right" }
  }
}

div {
  text-bar {
    div {
      slot: "left"
      text { Left content }
    }
    div {
      slot: "right"
      text { Right content }
    }
  }
}
```

HTML:

```html
<div class="w3-bar w3-blue">
  <span>
    <div slot="left">Left content</div>
  </span>
  <div slot="right">Right content</div>
</div>
```

## Into blocks (slot projection)

The `into {}` block lets you project content into a named slot without attaching
`slot: "name"` to every child. It is a structural block (not an attribute), and
`slot` is required. `into` targets only `slot { name: "..." }` placeholders and
never injects directly into components.

### Single-slot injection

QHTML:

```qhtml
q-component {
  id: "label-pill"
  span {
    class: "pill"
    slot { name: "label" }
  }
}

label-pill {
  into {
    slot: "label"
    text { New }
  }
}
```

HTML:

```html
<span class="pill">New</span>
```

### Nested projection through another component

This example wraps content across two components by targeting a single slot.

QHTML:

```qhtml
q-component {
  id: "outer-frame"
  div {
    class: "outer"
    inner-box {
      into {
        slot: "inner"
        slot { name: "content" }
      }
    }
  }
}

q-component {
  id: "inner-box"
  div {
    class: "inner"
    slot { name: "inner" }
  }
}

outer-frame {
  into {
    slot: "content"
    p { text { Wrapped twice } }
  }
}
```

HTML:

```html
<div class="outer">
  <div class="inner">
    <p>Wrapped twice</p>
  </div>
</div>
```

## Shorthand syntax

### Dot-class tags

You can attach classes directly to tags with dot notation (works for components too). Classes are merged with any `class: "..."` property.

QHTML:

```qhtml
div.someclass.anotherclass,span.thirdclass {
  text { hello world }
}
```

HTML:

```html
<div class="someclass anotherclass">
  <span class="thirdclass">hello world</span>
</div>
```

### Slot definitions

Slot blocks accept shorthand forms:

```qhtml
q-component my-component {
  slot { id: "my-slot1" }
  slot { name: "my-slot2" }
  slot { my-slot3 }
}
```

This is equivalent to:

```qhtml
q-component {
  id: "my-component"
  slot { name: "my-slot1" }
  slot { name: "my-slot2" }
  slot { name: "my-slot3" }
}
```

### Slot injection shorthand

When a component defines slots, you can inject by naming a slot block directly in the instance:

```qhtml
q-component my-component {
  slot { name: "my-slot" }
}

my-component {
  my-slot {
    text { hello world }
  }
}
```

This is equivalent to:

```qhtml
my-component {
  into {
    slot: "my-slot"
    text { hello world }
  }
}
```

## `q-import` (external QHTML includes)

Use `q-import { ... }` to include QHTML from another file before normal parsing continues.

Rules:

- The import path inside `{}` must be raw text (not quoted).
- Imports are resolved before component/slot/text transformations.
- Imports are recursive.
- Recursive expansion is capped at 100 imports per render pass.
- Imported source is cached by URL, so repeated imports do not re-fetch the same file.
- Imported files must be QHTML fragments (not full `<q-html>...</q-html>` wrappers).

Basic example:

```qhtml
<q-html>
  div {
    q-import { ./partials/card.qhtml }
  }
</q-html>
```

If `./partials/card.qhtml` contains:

```qhtml
section.card {
  h3 { text { Imported title } }
  p { text { Imported body } }
}
```

it is inlined before render, producing normal HTML as if it were written directly in place.

Recursive example:

```qhtml
<q-html>
  q-import { ./pages/home.qhtml }
</q-html>
```

`home.qhtml` can itself contain more `q-import { ... }` blocks. The engine keeps expanding recursively until no imports remain or the 100-import safety cap is reached.

## `tools/qhtml-tools.js` conversion helpers

`tools/qhtml-tools.js` exposes three browser helpers for converting between HTML/DOM and QHTML.

Include:

```html
<script src="qhtml.js"></script>
<script src="tools/qhtml-tools.js"></script>
```

Available as:

- `qhtml.fromHTML(...)`, `qhtml.fromDOM(...)`, `qhtml.toHTML(...)`
- Alias: `qhtmlTools.*`
- Hyphen alias: `window["qhtml-tools"].*`

### `fromHTML(rawHtml)`

Converts an HTML string into a QHTML snippet.

```js
const input = `
  <div>
    <section class="card">
      <h3>Live test</h3>
      <p>Hello</p>
    </section>
  </div>
`;

const q = qhtml.fromHTML(input);
console.log(q);
```

### `fromDOM(node)`

Converts an existing DOM node (or fragment/document) into a QHTML snippet.

```js
const box = document.createElement("div");
box.innerHTML = `
  <article class="note">
    <h4>DOM source</h4>
    <p>Converted from a node tree.</p>
  </article>
`;

const q = qhtml.fromDOM(box);
console.log(q);
```

### `toHTML(qhtmlCode)`

Renders QHTML by creating a `<q-html>` element, mounting it to the page, and returning the rendered HTML string.

```js
const source = `
div.card {
  h3 { text { Render me } }
  p { text { Generated by qhtml.toHTML } }
}
`;

const html = await Promise.resolve(qhtml.toHTML(source));
console.log(html);
```

Notes for `toHTML`:

- It appends a `<q-html>` host into `document.body` (or `document.documentElement` fallback).
- Return value may be immediate or async depending on render timing, so `await Promise.resolve(...)` is the safest calling pattern.

## w3-tags.js (W3CSS shorthand)

`w3-tags.js` lets you write W3CSS classes as tags. It transforms nested `w3-*` elements into real HTML with the right classes.

Include it:

```html
<script src="w3-tags.js"></script>
<link rel="stylesheet" href="w3.css">
```

QHTML:

```qhtml
<q-html>
  w3-card, w3-padding, div {
    w3-blue, w3-center, h2 { text { W3 Tag Example } }
    p { text { This uses W3CSS classes as tags. } }
  }
</q-html>
```

HTML (result):

```html
<div class="w3-card w3-padding">
  <h2 class="w3-blue w3-center">W3 Tag Example</h2>
  <p>This uses W3CSS classes as tags.</p>
</div>
```

## bs-tags.js (Bootstrap shorthand)

If you include `bs-tags.js`, you can use Bootstrap class tags the same way. This is a separate add-on, but the syntax mirrors `w3-tags.js`.

Include it:

```html
<script src="bs-tags.js"></script>
<link rel="stylesheet" href="bootstrap.min.css">
```

QHTML:

```qhtml
<q-html>
  bs-card, bs-shadow, div {
    bs-card-body, div {
      h5 { class: "bs-card-title" text { Card title } }
      p { class: "bs-card-text" text { This is a Bootstrap card. } }
    }
  }
</q-html>
```

HTML (result):

```html
<div class="bs-card bs-shadow">
  <div class="bs-card-body">
    <h5 class="bs-card-title">Card title</h5>
    <p class="bs-card-text">This is a Bootstrap card.</p>
  </div>
</div>
```

## Notes

- `text {}` inserts plain text. Use it when you do not want HTML parsing.
- `html {}` injects raw HTML directly.
- `on* {}` blocks convert to inline event attributes.
- If you need to run startup logic, hook `QHTMLContentLoaded`.

## Demo

Open `demo.html` to see a full playground with QHTML, HTML, and live preview side by side.
Also check out <a href="https://datafault.net/">datafault.net</a> for more information and examples on using qhtml.js.


## 📊 Project Metrics Summary

### 🗓 Timeline
- **Spec timeline:** **Unavailable**
  - `spec_memory.created_at` is empty in all rows  
  - **0 / 113** timestamps populated

---

### 📝 Specification Activity
- **Total spec entries:** **113**

**Spec focus areas (root path scope):**
- into — **34**
- demo — **20**
- q-import — **19**
- slot — **16**
- syntax — **13**
- component — **7**

---

### 📋 Requirements & Governance
- **Requirements (total):** **42**
  - Closed — **42**
  - Approved — **0**
  - Superseded — **0**

- **Decisions + Constraints (total):** **37**
  - Decisions — **3**
  - Constraints — **34**

---

### ❓ Question Handling
- **Total questions:** **25**
  - Closed — **25**
  - Approved — **0**
  - Open — **0**

- **Completion gate health:**  
  - Open questions — **0**  
  - Open requirement/decision/constraint rows — **0**

---

### 🚀 Delivery & Change Management
- **Total changes shipped:** **5**
- **Completion rate:** **5 / 5 (100%)**

---

### 📚 Definition Catalog
- **Total definitions:** **155**
- **Files covered:** **14**
- **Average definitions per file:** **11.07**

**Definition type mix:**
- function — **147**
- class — **3**
- const — **3**
- method — **2**

---

### 🔗 Change Impact & Coverage (Definition-Level)
- **change_defs links:** **0**
- **Average defs per change:** **0.00**
- **Unique defs touched:** **0 (0.00%)**
- **Tracking coverage (definition-level):** **0 / 5 (0.00%)**

**Most frequently touched definition:**  
- **Unavailable** (change_defs table is empty)

---

### 📁 Change Impact (File-Level)
- **Tracking coverage (file-level):** **5 / 5 (100%)**
- **Files touched:** **7**
- **Total file-touch links:** **10**
- **Hotspot concentration:** Top 3 files account for **60.00%** of all file touches

**Top touched files:**
- `qhtml.js` — **4**
- `README.md` — **1**
- `codemirror/codemirror-src.js` — **1**
- `codemirror/codemirror.js` — **1**
- `package-lock.json` — **1**
- `package.json` — **1**
- `rollup.config.js` — **1**

---

### 📡 Process Signals
- **refs table rows:** **0**  
  _(Reference graph not populated)_
- **todo table rows:** **0**

---

### 📈 Catalog Concentration
- **Top 2 files by definition count:** `qhtml.js`, `wheel.sh`
- **Definition concentration:** **72.90%** of all defs reside in these two files

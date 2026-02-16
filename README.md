# QHTML.js (Quick HTML)

QHTML is a compact, readable way to write HTML using a CSS-like block syntax. It turns short, clean markup into real HTML at runtime, without extra boilerplate. Drop your markup inside a `<q-html>` tag, include `qhtml.js`, and the browser renders normal HTML for you.

This README is written for builders who want a quick, reliable way to author UI without a heavy framework. Examples below are ready to copy and run.

## Highlights

- Write HTML structure with a clean, readable block syntax.
- Use standard HTML attributes and event handlers.
- Inline HTML or plain text blocks where needed.
- Build reusable runtime components with slots and methods.
- Build compile-time templates that render to pure HTML.
- Optional add-ons: `w3-tags.js` and `bs-tags.js` for shorthand UI markup.

## v4.6 changes

- Added deprecation warnings in `qhtml.js` for legacy compatibility syntaxes planned for removal in v5.0.
- Added `q-components.qhtml` bundle guidance, including modular `q-components/q-modal.qhtml` usage.
- Updated docs for current `q-component` vs `q-template` behavior and selection guidance.

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

HTML output:

```html
<div>
  <h2>Title</h2>
  <p>A short paragraph.</p>
</div>
```

### Attributes

Attributes use `name: "value"` inside a block.

> Note: Legacy text-property syntax such as `div { text: "some text" }` is deprecated and will be removed in v5.0. Use `text { some text }`.

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

Runtime host output:

```html
<a href="https://example.com" class="link">Visit Example</a>
```

Legacy/deprecated example (still accepted for compatibility, but scheduled for removal in v5.0):

```qhtml
div {
  text: "some text";
}
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

## Events and lifecycle

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

## Components and templates (`q-component` vs `q-template`)

QHTML has two reusable-block modes:

- `q-component`: runtime custom-element host for functional behavior
- `q-template`: compile-time template that renders to pure HTML

### `q-component`: runtime host with methods and slot carriers

`q-component` remains a custom element in output (for valid hyphenated names), so instance methods and direct host queries work.

> Note: Legacy anonymous component syntax like `q-component { id: "my-component" ... }` is deprecated and will be removed in v5.0. Use `q-component my-component { ... }`.

```qhtml
q-component nav-bar {
  function notify() { alert("hello") }

  div.nav-shell {
    h3 { slot { title } }
    div.links { slot { items } }
  }
}

nav-bar {
  id: "main-nav"

  title {
    text { Main Navigation }
  }

  items {
    ul {
      li { text { Home } }
      li { text { Contact } }
    }
  }
}
```

Runtime host shape:

```html
<nav-bar id="main-nav" q-component="nav-bar" qhtml-component-instance="1">
  <q-into slot="title">...</q-into>
  <q-into slot="items">...</q-into>
</nav-bar>
```

Behavior:

- Top-level component `function` blocks become instance methods.
- Invocation attributes stay on the host (`id`, `class`, `data-*`, ARIA, etc.).
- Slot payload is normalized to `q-into` carriers.
- Single-slot rule: if the component defines exactly one slot, unslotted children are auto-wrapped into one `q-into` targeting that slot.

Single-slot normalization example:

```qhtml
q-component hello-box {
  div.frame { slot { main } }
}

hello-box {
  id: "box1"
  text { hello }
}
```

Runtime carrier output:

```html
<hello-box id="box1" q-component="hello-box" qhtml-component-instance="1">
  <q-into slot="main">hello</q-into>
</hello-box>
```

Runtime component methods and helper APIs are documented in the `JavaScript API` section at the end of this README.

### `q-template`: compile-time pure HTML (non-traceable output)

`q-template` composes slot content like a component, but compiles away to plain HTML.

```qhtml
q-template card-shell {
  function ignoredAtCompileTime() {
    console.log("ignored")
  }

  div.card {
    h4 { slot { heading } }
    div.body { slot { body } }
  }
}

card-shell {
  heading { text { Profile } }
  body { p { text { This is pure HTML output } } }
}
```

Rendered HTML:

```html
<div class="card">
  <h4>Profile</h4>
  <div class="body">
    <p>This is pure HTML output</p>
  </div>
</div>
```

Behavior:

- `function` blocks in `q-template` are ignored and produce a warning.
- No slot/component trace markers are preserved from template expansion.
- Expansion is one-way; resulting HTML is not reverse-mapped back to template slot/component sources.
- If nested `q-component` instances are inside a template expansion, those instances still remain runtime custom-element hosts.

### Choosing between them

- Use `q-component` when you need runtime behavior (`function` methods, direct instance control, host-level state).
- Use `q-template` for structure-only composition that should compile down to pure HTML output.
- Default to `q-template` for reusable layout shells, then add `q-component` only where runtime behavior is required.

## Into blocks (slot projection)

The `into {}` block lets you project content into a named slot without attaching
`slot: "name"` to every child. It is a structural block (not an attribute), and
`slot` is required. `into` targets only slot placeholders and never injects directly into components.

### Single-slot injection

QHTML:

```qhtml
q-component label-pill {
  span.pill {
    slot { label }
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
<label-pill q-component="label-pill" qhtml-component-instance="1">
  <q-into slot="label">New</q-into>
</label-pill>
```

### Nested projection through another component

This example wraps content across two components by targeting a single slot.

QHTML:

```qhtml
q-component outer-frame {
  div {
    class: "outer"
    inner-box {
      into {
        slot: "inner"
        slot { content }
      }
    }
  }
}

q-component inner-box {
  div {
    class: "inner"
    slot { inner }
  }
}

outer-frame {
  into {
    slot: "content"
    p { text { Wrapped twice } }
  }
}
```

Runtime host output:

```html
<outer-frame q-component="outer-frame" qhtml-component-instance="1">
  <q-into slot="content">
    <p>Wrapped twice</p>
  </q-into>
</outer-frame>
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

> Note: Legacy slot naming syntax `slot { name: "my-slot" }` is deprecated and will be removed in v5.0. Use `slot { my-slot }`.

```qhtml
q-component my-component {
  slot { my-slot1 }
  slot { my-slot2 }
  slot { my-slot3 }
}
```

Legacy/deprecated slot naming form (v5.0 removal):

```qhtml
slot { name: "my-slot" }
```

### Legacy inline slot-property syntax (deprecated)

> Note: Legacy inline slot property syntax such as `q-component my-component { div { slot: "my-slot" } }` is deprecated and will be removed in v5.0.

Preferred modern approach:

```qhtml
q-component my-component {
  div { slot { my-slot } }
}
```

### Slot injection shorthand

When a component defines slots, you can inject by naming a slot block directly in the instance:

```qhtml
q-component my-component {
  slot { my-slot }
}

my-component {
  my-slot {
    text { hello world }
  }
}
```

Same result can be written with an explicit `into` block:

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
- Initial rendering uses a blocking import-first phase:
  - Phase 1: preload/resolve all `q-import` trees for discovered `<q-html>` hosts.
  - Phase 2: run preprocessing, component expansion, and final render.
- If a `render()` call happens while the document is still loading, it waits for the initial import barrier.
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

## `q-components.qhtml` bundle

`q-components.qhtml` is the component-bundle entrypoint. Instead of keeping all component definitions in one large file, it imports grouped files (currently `q-components/q-modal.qhtml`).

Use it like this:

```qhtml
<q-html>
  q-import { q-components.qhtml }
  ...
</q-html>
```

### `q-modal` usage (from `q-components/q-modal.qhtml`)

```qhtml
<q-html>
  q-import { q-components.qhtml }

  q-modal {
    id: "modal1"
    header { h3 { text { Modal Header } } }
    body { p { text { Modal body content } } }
    footer { p { text { Optional footer note } } }
  }

  button {
    text { Open modal }
    onClick { document.querySelector("#modal1 > q-modal-component").show(); }
  }

  button {
    text { Hide modal }
    onClick { document.querySelector("#modal1 > q-modal-component").hide(); }
  }
</q-html>
```

Notes:

- The controller methods (`show()`, `hide()`) are exposed on the nested `q-modal-component` node.
- `header`, `body`, and `footer` are projected into the modal template through the bundle wrappers.

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
- If you need to run startup logic, hook `QHTMLContentLoaded` (see `JavaScript API` at the end).

## Demo

Open `demo.html` to see a full playground with QHTML, HTML, and live preview side by side.
Also check out <a href="https://datafault.net/">datafault.net</a> for more information and examples on using qhtml.js.

## JavaScript API

### `QHTMLContentLoaded`

`qhtml.js` dispatches `QHTMLContentLoaded` after parsing/rendering finishes for a `<q-html>` tree. Use this event for setup code that needs final DOM nodes.

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

### Runtime APIs on `q-component` instances

Instances created from `q-component` expose:

- Methods declared with `function ... { ... }` in the component definition
- `instance.slots()`
- `instance.into(slotId, payload)`

```js
document.addEventListener("QHTMLContentLoaded", function () {
  const nav = document.querySelector("#main-nav");
  if (!nav) return;

  console.log(nav.slots());
  nav.into("title", "<strong>Updated title</strong>");
  nav.notify();
});
```

### `q-template` runtime behavior

`q-template` does not expose runtime methods. It is compile-time only and expands to plain HTML.

- `function` blocks inside `q-template` are ignored (with warning).
- Use `q-component` when you need callable methods (`.show()`, `.hide()`, custom actions, etc.).

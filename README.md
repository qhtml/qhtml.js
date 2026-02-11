# QHTML.js (Quick HTML)

QHTML is a compact, readable way to author HTML with a block-based syntax. Write markup inside `<q-html>`, include `qhtml.js`, and it renders to normal HTML at runtime.

This guide focuses on the **current v4.2 syntax**, including modern shortcuts.

## Highlights

- CSS-like nested blocks for HTML structure
- Dot-class shortcuts (`div.card.rounded`)
- Multi-tag shorthand (`section,div.card,h2 { ... }`)
- Modern component declaration (`q-component my-card { ... }`)
- Slot shortcuts (define and fill slots by name directly)
- Inline event blocks (`onclick { ... }`)

## Quick Start

1. Include qhtml.js

```html
<script src="qhtml.js"></script>
```

2. Write QHTML

```qhtml
<q-html>
  div.card {
    h1 { text { Hello QHTML } }
    p.muted { text { Small markup, big results. } }
  }
</q-html>
```

3. Output HTML

```html
<div class="card">
  <h1>Hello QHTML</h1>
  <p class="muted">Small markup, big results.</p>
</div>
```

## Core Syntax

### Elements and nesting

```qhtml
<q-html>
  main {
    h2 { text { Title } }
    p { text { A short paragraph. } }
  }
</q-html>
```

### Attributes

Use standard `name: "value"` properties.

```qhtml
<q-html>
  a.link {
    href: "https://example.com"
    target: "_blank"
    rel: "noopener noreferrer"
    text { Visit Example }
  }
</q-html>
```

### Text, HTML, and inline style blocks

```qhtml
<q-html>
  p.lead {
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

### Class shortcuts (modern)

Use dot syntax directly on tags:

```qhtml
<q-html>
  div.card.shadow.rounded {
    span.badge.success { text { Ready } }
  }
</q-html>
```

### Multi-tag shorthand

Comma-separated tags nest left to right:

```qhtml
<q-html>
  section,div.card,h3.title {
    text { Nested in one line }
  }
</q-html>
```

Outputs:

```html
<section>
  <div class="card">
    <h3 class="title">Nested in one line</h3>
  </div>
</section>
```

## Events and initialization

### `QHTMLContentLoaded`

QHTML dispatches `QHTMLContentLoaded` after conversion completes.

```html
<script>
  document.addEventListener("QHTMLContentLoaded", () => {
    const button = document.querySelector("#saveButton");
    if (button) button.addEventListener("click", () => console.log("Ready"));
  });
</script>
```

### Event blocks (modern)

Use `on* { ... }` blocks for inline handlers with multi-line JavaScript:

```qhtml
<q-html>
  button.primary {
    id: "saveButton"
    onclick {
      const btn = document.getElementById("saveButton");
      btn.textContent = "Saved";
    }
    text { Save }
  }
</q-html>
```

## Components and slots (modern)

### Declare components with inline name

Use the preferred form:

```qhtml
q-component app-bar {
  header.bar {
    slot { left }
    slot { right }
  }
}
```

### Fill slots with slot-name child tags

Use direct slot-name children when invoking:

```qhtml
app-bar {
  left {
    span { text { Brand } }
  }
  right {
    button { text { Sign in } }
  }
}
```

### Single-slot convenience

If a component has exactly one slot, children are auto-mapped when no explicit slot syntax is used:

```qhtml
q-component label-pill {
  span.pill {
    slot { label }
  }
}

label-pill {
  text { New }
}
```

### `into {}` for explicit projection

`into {}` is still useful when you want explicit slot targeting:

```qhtml
label-pill {
  into {
    slot: "label"
    strong { text { New } }
  }
}
```

## Add-ons

### `w3-tags.js`

Write W3CSS classes as tags:

```html
<script src="w3-tags.js"></script>
<link rel="stylesheet" href="w3.css">
```

```qhtml
<q-html>
  w3-card,w3-padding,div {
    w3-blue,w3-center,h2 { text { W3 Tag Example } }
    p { text { This uses W3CSS classes as tags. } }
  }
</q-html>
```

### `bs-tags.js`

Use Bootstrap class tags the same way:

```html
<script src="bs-tags.js"></script>
<link rel="stylesheet" href="bs.css">
```

```qhtml
<q-html>
  bs-card,div {
    bs-card-body,div {
      h5.bs-card-title { text { Card title } }
      p.bs-card-text { text { This is a Bootstrap card. } }
    }
  }
</q-html>
```

## Notes

- Use `text {}` for plain text.
- Use `html {}` for raw HTML.
- Prefer `on* {}` blocks for inline event code.
- Prefer `q-component my-name { ... }` and slot-name shortcuts in new code.

## Demo

Open `demo.html` for a live playground.

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

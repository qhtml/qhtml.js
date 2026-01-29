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

## Components and slots (q-component)

`q-component` lets you create reusable UI blocks with named slots.

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

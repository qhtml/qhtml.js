// qscript.js

// Initialize q-script parsing on page load
document.addEventListener("QHTMLContentLoaded", function() {
   const qScripts = document.querySelectorAll('q-script');
  qScripts.forEach(function(qScript) {
    let content = qScript.textContent;

    // Replace all occurrences of #elementId with document.querySelector("#elementId")
    content = content.replace(/#(\w+)/g, 'document.querySelector("#$1")');

    // Replace .on("event"): { ... } with .addEventListener("event", function(event) { try { ... } catch { } });
    content = content.replace(/(document\.querySelector\("#\w+"\))\.on\((.*?)\):\s*\{([\s\S]*?)\}/g,
      '$1.addEventListener($2, function(event) { try { $3 } catch { } });');

    // Create new <script> element with the transformed code
    const script = document.createElement('script');
    script.textContent = content;

    // Replace the <q-script> element with the new <script> element
    qScript.parentNode.replaceChild(script, qScript);
  });




// Function to parse q-html content

})
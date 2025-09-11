/* created by mike nickaloff
 * https://www.github.com/mikeNickaloff/qhtml
 */
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
        function addSemicolonToProperties(input) {
            const regex = /(\w+)\s*:\s*("[^"]*")(?!;)/g;
            return input.replace(regex, "$1: $2;");
        }

        function evaluateTemplateStrings(input) {
            const templateRegex = /\$\{([^}]+)\}/g;
            return input.replace(templateRegex, (match, expr) => {
                try {
                    // Using `eval` to evaluate the expression inside ${}.
                    // Be sure that this is safe in your context before using!
                    return eval(expr);
                } catch (error) {
                    console.error('Error evaluating expression:', expr);
                    return "";
                }
            });
    }

    function replaceBackticksWithQuotes(input) {
        // This replaces all backtick-enclosed strings with double-quoted strings.
        // It assumes all `${}` expressions are already evaluated or replaced.
        return input.replace(/`([^`]*)`/g, (match, p1) => (eval(p1)));
    }

    let preprocessedInput = addSemicolonToProperties(i_qhtml);
    // preprocessedInput = evaluateTemplateStrings(preprocessedInput);
    let preprocessedInput3 = replaceBackticksWithQuotes(preprocessedInput);
    let preprocessedInput2 = this.transformComponentDefinitions(preprocessedInput3);

    return preprocessedInput2;
}

// unused for now
transformComponentDefinitions(input) {
    const componentDefRegex = /component\s+(\w+)\s*\{/g;
        return input.replace(componentDefRegex, (match, componentName, properties) => {
            // Preserve the properties as they are, just change the component declaration format
            return `q-component { id: "${componentName}"`;
            });
        }

        //parse all text and convert this element's contents into HTML
        parseQHtml(qhtml) {

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

                            // Reset input to process remaining elements/properties
                            input = input.substring(i + 1);
                            i = -1; // Reset loop index
                            continue;
                        } else {
                            // Collect raw HTML verbatim until the closing brace
                            htmlString = htmlString.concat(input[i]);
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
                        // inject decoded raw HTML directly into the current parent (no wrapper div)
                        try {
                            var itm = document.createElement("qdiv");
                            itm.innerHTML = decodeURIComponent(segment.content);
                            parentElement.appendChild(itm);
                        //parentElement.insertAdjacentHTML('beforeend', decodeURIComponent(segment.content));
                        } catch(err) {
                            parentElement.innerHTML += decodeURIComponent(segment.content);

                        }
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
        const elementClass = this.createCustomElementClass(name, content, slots);
        customElements.define(name, elementClass);
    }

    createCustomElementClass(name, content, slots) {
        var myAttributes = {
            "slot": this.innerHTML
        }
        slots.forEach(function(attr) { myAttributes[attr] = ""; })
        return class extends HTMLElement {
            constructor() {
                super();
                this.innerHTML = content;
                // Set attributes on the new element
                //    this.setAttributes(attributes);
            }
            static get observedAttributes() {
                return ['slot'].concat(slots);
            }

            attributeChangedCallback(name, oldValue, newValue) {
                if (name === 'slot') {
                    this.replaceSlotContent(["slot"])
                }
                if (slots.indexOf(name) != -1) {
                    this.replaceCustomSlotContent([name])
                }
            }

            connectedCallback() {
                this.replaceSlotContent(["slot"]);
                try {
                    slots.forEach(function(t_slot) { setAttribute(t_slot, encodeURIComponent(this.querySelector(t_slot).innerHTML)); this.replaceCustomSlotContent(t_slot); });
                } catch {

                }
            }

            setAttributes(attributes) {
                for (const [key, value] of Object.entries(myAttributes)) {
                    this.setAttribute(key, value);
                }
            }

            replaceSlotContent(attributes) {
                // Replace the innerHTML of elements with slot attributes matching q-component attributes

                const slotElements = this.querySelectorAll("slot");
                slotElements.forEach(elem => {
                    elem.innerHTML = this.getAttribute("slot");
                });

            }


            replaceCustomSlotContent(slotName) {

                const slotElements = this.querySelectorAll(slotName);
                slotElements.forEach(elem => {
                    elem.innerHTML = this.getAttribute(slotName);
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

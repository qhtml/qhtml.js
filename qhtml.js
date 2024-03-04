/* created by mike nickaloff
https://www.github.com/mikeNickaloff/qhtml
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
        const qhtmlContent = this.preprocess(this.textContent.trim());
        const htmlContent = this.parseQHtml(qhtmlContent);
        this.innerHTML = htmlContent;  // Modify this line
    }

    preprocess(i_qhtml) {
       function addSemicolonToProperties(input) {
	  const regex = /(\w+)\s*:\s*("[^"]*")(?!;)/g;
	  return input.replace(regex, "$1: $2;");
	}
        let preprocessedInput = addSemicolonToProperties(i_qhtml);

	return preprocessedInput;
    }


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

 
    const preprocessedInput = qhtml;
    const adjustedInput = addClosingBraces(preprocessedInput);

    function extractPropertiesAndChildren(input) {
        const segments = [];
        let nestedLevel = 0;
        let segmentStart = 0;

        for (let i = 0; i < input.length; i++) {
            if (input[i] === "{") {
                if (nestedLevel === 0) segmentStart = i;
                nestedLevel++;
            } else if (input[i] === "}") {
                nestedLevel--;
                if (nestedLevel === 0) {
                    segments.push({
                        type: 'element',
                        tag: input.substring(0, segmentStart).trim(),
                        content: input.substring(segmentStart + 1, i)
                    });
                    input = input.substr(i + 1).trim(); // Adjust the remaining input
                    i = -1;  // Restart the loop
                }
            } else if (nestedLevel === 0 && input[i] === ":") {
                let propEnd = input.indexOf(";", i);
                if (propEnd !== -1) {
                    let propertySegment = input.substring(0, propEnd + 1);
                    let [name, value] = propertySegment.split(":").map(s => s.trim());
                    value = value.replace(/";$/, "").replace(/^"/, "");
                    segments.push({
                        type: 'property',
                        name: name,
                        value: value
                    });
                    input = input.substr(propEnd + 1).trim(); // Adjust the remaining input
                    i = -1;  // Restart the loop
                }
            }
        }

        return segments;
    }

    function processSegment(segment, parentElement) {
        if (segment.type === 'property') {
            if (segment.name === 'content' || segment.name === 'contents' || segment.name === 'text' || segment.name === 'textcontent' || segment.name === 'textcontents' || segment.name === 'innertext') {
                parentElement.innerHTML = segment.value;
            } else {
		if (segment.name === 'style' || segment.name === 'script') {

		} else {
	                parentElement.setAttribute(segment.name, segment.value);
		}
            }
        } else if (segment.type === 'element') {
		if (segment.tag.includes(',')) {
       		       // Split the tag by comma and trim each tag name
                	const tags = segment.tag.split(',').map(tag => tag.trim());
	                // Recursively create nested elements for each tag
        	        let currentParent = parentElement;
                	tags.forEach(tag => {
	                    const newElement = document.createElement(tag);
	                    currentParent.appendChild(newElement);
	                    currentParent = newElement; // Update the current parent to the newly created element
			  
        	        });
			   const childSegments = extractPropertiesAndChildren(segment.content);
		            childSegments.forEach(childSegment => processSegment(childSegment, currentParent));
		} else {

		   const newElement = document.createElement(segment.tag);
		 
                   if (segment.tag === 'script') { 
		      	
				storeAndExecuteScriptLater(segment.content)
				newElement.text = segment.content;
		    	        parentElement.appendChild(newElement);
			
		   } else {
	            
        	   
		            const childSegments = extractPropertiesAndChildren(segment.content);
		            childSegments.forEach(childSegment => processSegment(childSegment, newElement));
                              parentElement.appendChild(newElement);
	           }
		}
        }
    }

    const root = document.createElement('div');
    const segments = extractPropertiesAndChildren(adjustedInput); // Use the adjusted input
    segments.forEach(segment => processSegment(segment, root));

    return root.innerHTML;
}



initMutationObserver() {
    // Create an observer instance linked to a callback function
    const observer = new MutationObserver((mutationsList, observer) => {
      // For each mutation, check if the type is 'childList', indicating added or removed nodes
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          // Emit a custom event signaling the innerHTML change
          this.dispatchEvent(new CustomEvent('contentChanged', {
            detail: { message: 'Content has changed' }
          }));
        }
      }
    });

    // Start observing the target node for configured mutations
    observer.observe(this, { childList: true, subtree: true });
  }


 
}

// Define the new element
customElements.define('q-html', QHtmlElement);

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
  setTimeout(deferredExecution, 0);
}

window.addEventListener("DOMContentLoaded", function() {
	var elems = document.querySelectorAll("q-html")
	elems.forEach(function(elem) { 

		elem.render();

	})
	var qhtmlEvent = new CustomEvent('QHTMLContentLoaded', { });
	document.dispatchEvent(qhtmlEvent);

 })



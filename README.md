I**ntroduction to Quick HTML: *The Quick Inline HyperText Markup Language***

- qHTML is a simplified, custom representation of HTML designed for ease of reading and maintainence. Its structure and syntax are similar to CSS, but instead of styles, it defines HTML structure and attributes inline. 

- qHTML is a custom component, so there is no boilerplate code or javascript API required. 

- You just place your qHTML within a q-html tag and like magic, it transforms into regular inline HTML automatically. 

- Extending qHTML is super easy as well - just define a new custom component and it will become available along with all of its inline attributes without having to even interact with qHTML. 

- For code editor:  <a href="https://www.datafault.net/qhtml/demo.html">click here!</a>
- For Official API / Documentation / Examples
   <a href="https://www.datafault.net/qhtml">https://www.datafault.net/qhtml/</a>

**Basic Structure:**


- Elements: Elements are defined similarly to CSS. A tag name is provided, followed by a pair of curly braces {}. Within the curly braces, the attributes and nested elements are defined.

**Example:**
 
      <script src="qhtml.js"></script>
       <q-html>
         div {
              content: "my div"
          }
    
           p {
               content: "my paragraph"
           }
         </q-html>

- Attributes: Attributes are defined  by specifying the attribute name followed by a colon (:) followed by the value surrrounded in double quotes. 

- The value should be in the same form as traditional inline HTML tags
- All attributes are supported as long as they are valid attributes for a specific tag. 
- You can also use the content attribute on any tag to set the "textcontent" of that tag. (not the HTML content).
- other ways to set text content are through the 'contents', 'text', 'textcontents', and 'innertext' keywords.
- Inline attributes like onclick, onmouseover, etc  work as well.
- Nesting is also supported by simply adding additional tags into existing tags between the { curley braces }


Example:
   

      <q-html>
           div {
              id: "myDiv"
              class: "container"
              content: "click the button below for a special message"
              button {
                  onclick: "alert('hello world')"
                  content: "click me!"
               }
           }
      </q-html>


  Result:  

       <div id="myDiv" class="container">
               click the button below for a special message  
               <button onclick="alert('hello world')">click me!</button>
       </div>

Important Points:

- The content/text attribute is special in qHTML. It represents the inner text of an element.

- All properties are surrounded with double-quotes and can have anything within the quotes
- Place scripts in <script> blocks outside of QHTML (for now until q-script is added)
- Reference script return values using backticks like this... <pre> text: `myscript()` </pre>

Example:

     <q-html>
      p {
            content: "This is a paragraph."
            span {
                   content: "And here is how to handle multiple elements... "                   
            } 
           a { 
               href:"#"
              content: "Click here!"
              onclick: "myFunction()"
           }
            span { 
                 id: "mySpan"
                 content: " and continue learning"
            }
           
         }
          script {

             function myFunction() {  
                  document.querySelector("#mySpan").innerText = " " + Math.random() * 65535; 
                  alert("clicked!"); 
              }
           }
         
     </q-html>




Simplified Nesting

- You can nest multiple tags for convenience using a comma

Example:

qHTML:

       <q-html>
         p,center,a {
           href: "https://www.example.com"
           text: "Visit Example"
        }
       </q-html>

Converted to HTML:

            <p><center><a href="https://www.example.com">Visit Example</a></center></p>


q-components:

   
      q-component {
	     slots: "custom-slot1,custom-slot2";
	     id: "text-bar";
	     div {
		class: "w3-bar w3-blue";
		span {
		    custom-slot1 {

		    }
		}
	       div {
		   custom-slot2 {

		   }
	       }
	    }
      }
		
	div {
	  text-bar {
	      custom-slot1: "slot 1 text";
	      custom-slot2: "slot 2 text";
	  }
	  br { }
	  text-bar {
	      custom-slot1: "some other text for slot 1";
	      custom-slot2: "and the other slot 2 text";
	  
	  }
	}

Result:

  	<text-bar custom-slot1="slot 1 text" custom-slot2="slot 2 text">
            <div class="w3-bar w3-blue">
	       <span>
	         <custom-slot1>slot 1 text</custom-slot1>
	      </span>
           <div>
	       <custom-slot2>slot 2 text</custom-slot2>
	  </div>
       </div></text-bar>
       
       <br>
       <text-bar custom-slot1="some other text for slot 1" custom-slot2="and the other slot 2 text">
          <div class="w3-bar w3-blue">
	    <span>
               <custom-slot1>some other text for slot 1</custom-slot1>
	    </span>
            <div>
	       <custom-slot2>and the other slot 2 text</custom-slot2>
	    </div>
          </div>
	</text-bar>

q-script:
	
 	       <q-html>
		
			w3-red,w3-panel,div {
				id: "myDiv"
				text: "Hover mouse here to see q-script"
				style: "min-height: 30%; min-width: 50%;"
			}
			
		</q-html>

	       <q-script>
			#myDiv.on("mouseover"): {
				#myDiv.classList.remove("w3-red");
				#myDiv.classList.add("w3-green");
			}
			#myDiv.on("mouseout"): {
				#myDiv.classList.remove("w3-green");
				#myDiv.classList.add("w3-red");
			}
	        </q-script>
	


 Currently planned features for later release:
 - extend q-script support to create more seamless integration


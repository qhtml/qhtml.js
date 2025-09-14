I**ntroduction to Quick HTML: *The Quick Inline HyperText Markup Language***

- qHTML is a simplified, custom representation of HTML designed for ease of reading and maintainence. Its structure and syntax are similar to CSS, but instead of styles, it defines HTML structure and attributes inline. 

- qHTML is a custom component, so there is no boilerplate code or javascript API required. 

- You just place your qHTML within a q-html tag and like magic, it transforms into regular inline HTML automatically. 

- Extending qHTML is super easy as well - just define a new custom component and it will become available along with all of its inline attributes without having to even interact with qHTML. 

- For code editor:  <a href="https://www.datafault.net/qhtml/demo.html">click here!</a>
- For Official API / Documentation / Examples
   <a href="https://www.datafault.net/index.php/qhtml">https://www.datafault.net/index.php/qhtml</a>

--------------

**Changes**
- 9/12/2025 - *Updated how q-component works which will break any existing implementations of q-component that you may be using for a good cause.. See q-components below...*

---------------

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
- The HTML element allows you to switch context between qhtml and HTML so you can inline HTML into q-html elements.

Example:

     <q-html>
      p {
            
            span {
                html { here is some inline html }                  
            } 
           a { 
               href:"#"
              content: "Click here!"
              onclick: "myFunction()"
           }
            span { 
                 id: "mySpan"
                html { and here is some inline html }
            }
           
         }
      
         
     </q-html>


-------------

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

-------------------

**q-components:**

Q-Components now behave just like how HTML5 templates and slots work -- you define slots using 

`<slot name="some-name">`

The only difference is that you don't clone the template node, instead it creates a custom HTML element with the name from the "id" property of the q-component.  

In the example below, q-component creates a new element called "text-bar"  which is then used in the q-html code that follows and the slots are defined using the a slot element, and the contents of the slots are filled whenever the text-bar element is used and has a child element with the property "slot: slot-name"
	
   
      q-component {
	     
	     id: "text-bar";
	     div {
		class: "w3-bar w3-blue";
		span {
		    slot {
               name: "custom-slot1"
		    }
		}
	       slot {
		       name: "custom-slot2"		
	       }
	    }
      }
		
	div {
	  text-bar {
        
	      div { 
	        comment: "the slot property causes this entire div to be injected into custom-slot1"
	        slot: "custom-slot1"
		    text: "slot 1 text";
	     }
	  
	
	     div {   
            
	       slot: "custom-slot2"
		
		   span { 
	         html { slot 2 html }
           }
	       br { }
		   span { text: "additional qhtml for custom-slot2" }
	  }
    }
	

Result:

	
	  <div class="w3-bar w3-blue">
	    <span>
	      <div comment="the slot property causes this entire div to be injected into custom-slot1" slot="custom-slot1">
	         slot 1 text
	      </div>
	    </span>
	    <div slot="custom-slot2">
	      <span> slot 2 html </span>
	      <br>
          <span>additional qhtml for custom-slot2</span>
	    </div>
	  </div>
	

-------------

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

---------------

 Inline HTML 
 --
 **Note** 9/13/2025 - For now - inline HTML must be wrapped in another element (can be any element even made up one), but currently adding html tags will cause the parent element's entire tree to be replaced.  This is a known bug and this behavior will be fixed in future versions.
			
            <q-html> 
				  div {
				   text: "hello world"
				   span {
	                  html { 
					     <br> hello again
				      }
		          }
		
		        }
		  </q-html>

 Results: 

          <div>hello world<span><br> hello again </span></div>
	


 Currently planned features for later release:
 - extend q-script support to create more seamless integration

















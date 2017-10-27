
 var selectionHandler = function(e) {
   //////////////console.log("In search handler");
   var filename = "";
   if (e.selectionText) {
       console.log(e.selectionText)
       filename =  e.selectionText.replace(/ /g, '').replace(/[^a-z0-9_-]+/gi, "_");
       console.log(filename);
       var imageData = []
       var imageURIs = []
       var saveFileName = filename;
       chrome.tabs.executeScript(null, {file: 'js/date.js'}, function () { /* Good date formatting library */
         console.log("In: chrome.tabs.executeScript")
         var uris = []
         var datum = []
         chrome.tabs.query({'active':true}, function (tab) {
           // chrome.pageAction.setIcon({path:"../icons/icon-running.png",tabId:tab.id})
           console.log(tab)

           if(currentTabId != tab[0].id){
             currentTabId = tab[0].id;
             //responseHeaders = [];
             //requestHeadersTracking = [];
             //requestHeaders = [];
           }
           var port = chrome.tabs.connect(tab[0].id, {name: 'warcreate'}) // create a persistent connection
           port.postMessage({url: tab[0].url, method: 'getHTML'}) // fetch the html of the page, in content.js

           var imageDataFilledTo = -1

           // Perform the first listener, populate the binary image data
           port.onMessage.addListener(function (msg) { // get image base64 data
             var fileName = (new Date().toISOString()).replace(/:|-|T|Z|\./g, '') + '.warc'

             // If the user has specified a custom filename format, apply it here
             if (localStorage['filenameScheme'] && localStorage['filenameScheme'].length > 0) {
               fileName = moment().format(localStorage['filenameScheme']) + '.warc'
             }
             var requestToBeSent = {
               url: tab[0].url,
               fileName: saveFileName,
               currentTabId: currentTabId,
               method: 'generateWarc',
               docHtml: msg.html,
               file: fileName,
               img: {uris: msg.uris, data:msg.data},
               css: {uris: msg.css.uris, data: msg.css.data},
               js: {uris: msg.js.uris, data: msg.js.data},
               outlinks: msg.outlinks
             }
             //console.log(requestToBeSent);
             generateWarc(requestToBeSent)
           })
         });
       });

   } else {
     console.log("No selected text.");
   }
 };

 chrome.contextMenus.create({
     "title": "Save WARC by Selection",
     "contexts": ["selection"],
     "onclick" : selectionHandler
  });

/**
 * WARCreate for Google Chrome
 * "Create WARC files from any webpage"
 * by Mat Kelly <warcreate@matkelly.com>
 *
 * See included LICENSE file for reuse information
 *
 */

var tabHash = {};
// Called when the url of a tab changes.
function checkForValidUrl (tabId, changeInfo, tab) {
  currentTabId = tab.id;
  chrome.pageAction.show(tabId)
}

/**
 * TODO: Provide 'sequential archiving' wherein a site's hierarchy is referenced
 * and all pages referenced in the hierarchy are captured
 *
 */
function sequentialGenerateWarc () {
  var urls = []
  $(localStorage['spec']).find('url').each(function (index) {
    urls.push($(this).text())
  })
  var uu = 0

  function generateWarcFromNextURL (nextUrl) {
    chrome.tabs.create({url: nextUrl, active: true},
      function (tab) {
        chrome.tabs.onUpdated.addListener(function (tabId, info) {
          if (info.status === 'complete') {
            doGenerateWarc()
            // chrome.tabs.remove(tab.tabId)
            alert('done with ' + (uu + 1) + '/' + urls.length)
            if (++uu >= urls.length) { return }
            generateWarcFromNextURL(urls[uu])
          }
        })
      }
    )
  }

  generateWarcFromNextURL(urls[uu])
}

function addProgressBar () {
  var body = document.getElementsByTagName('body')[0]
  var progressBar = document.createElement('progress')
  progressBar.setAttribute('value','0')
  progressBar.setAttribute('max','0')
  body.appendChild(progressBar)
}

/**
 * Calls and aggregates the results of the functions that progressively create a
 * string representative of the contents of the WARC file being generated.
 */
function doGenerateWarc (saveFileName) {
  //addProgressBar()
  console.log("doGenerateWarc: " + saveFileName)
  var imageData = []
  var imageURIs = []
  if(typeof saveFileName != "string" ){
    saveFileName = document.getElementById('gwFileName').value;
  }
  if(!saveFileName || saveFileName == "") saveFileName = "";

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
        chrome.runtime.sendMessage(requestToBeSent) // Received in warcGenerator.js
      })
    })

  })
}

/**
 * Sets up the popup activated when the extensions's icon is clicked.
 */
window.onload = function () {
  //var background = chrome.extension.getBackgroundPage()

  var buttonContainer = document.getElementById('buttonContainer')

  var sButton = document.getElementById('submit')
  var acButton = document.getElementById('alertContent')
  // var encryptButton = document.getElementById('encrypt')
  var encodeButton = document.getElementById('encodeImages')

  // if a website is recognized from the spec, show the "Cohesive archive"
  var caButtonDOM = document.createElement('input')
  caButtonDOM.type = 'button'
  caButtonDOM.id = 'generateCohesiveWARC'
  caButtonDOM.disabled = 'disabled'
  var t

  caButtonDOM.value = 'Generate WARC for site'

  // create buttons for popup
  var gwFileName = document.createElement('input')
  gwFileName.type = 'text'
  gwFileName.id = 'gwFileName'
  gwFileName.value = ''
  var gwButtonDOM = document.createElement('input')
  gwButtonDOM.type = 'button'
  gwButtonDOM.id = 'generateWarc'
  gwButtonDOM.value = 'Generate WARC'
  var clsButtonDOM = document.createElement('input')
  clsButtonDOM.type = 'button'
  clsButtonDOM.id = 'clearLocalStorage'
  clsButtonDOM.value = 'Clear LocalStorage'

  // For debugging, display content already captured
  // var dcButtonDOM = document.createElement('input'); dcButtonDOM.type = "button"; dcButtonDOM.id = "displayCaptured"; gwButtonDOM.value = "Show pending content"

  var errorText = document.createElement('a')
  errorText.id = 'errorText'
  errorText.target = '_blank'
  var status = document.createElement('input')
  status.id = 'status'
  status.type = 'text'
  status.value = ''

  if (!buttonContainer) { return }

  // add buttons to DOM
  buttonContainer.appendChild(gwFileName)
  buttonContainer.appendChild(gwButtonDOM)
  buttonContainer.appendChild(caButtonDOM)

  buttonContainer.appendChild(clsButtonDOM)
  buttonContainer.appendChild(status)
  $(buttonContainer).prepend(errorText)
  $('#status').css('display', 'none') // initially hide the status block

  var gwButton = document.getElementById('generateWarc')
  gwButton.onclick = doGenerateWarc

  var clsButton = document.getElementById('clearLocalStorage')

  // future implementation for NEH HD-51670-13
  // https://securegrants.neh.gov/publicquery/main.aspx?f=1&gn=HD-51670-13
  var ulButton = document.getElementById('uploader')
  var caButton = document.getElementById('generateCohesiveWARC')
  $(ulButton).css('display', 'none')
  $(caButton).css('display', 'none')

  $(clsButton).css('display', 'none') // clear local storage, used in debugging
  caButton.onclick = sequentialGenerateWarc
}
// Listen for any changes to the URL of any tab.
chrome.tabs.onUpdated.addListener(checkForValidUrl)

var headers = ''

/**
 * address #79 by keeping track per URL what headers we have already concatenated
 */
var requestHeadersTracking = []

var responseHeaders = []
var requestHeaders = []
var CRLF = '\r\n'

var currentTabId = -1

chrome.tabs.getSelected(null, function (tab) {
  console.log(tab);
  if(currentTabId != tab.id){
    //currentTabId = tab.id;
    //responseHeaders = [];
    //requestHeadersTracking = [];
    //requestHeaders = [];
    //console.log("reset");
  }

  chrome.storage.local.set({'lastTabId': tab.id})

  chrome.storage.local.get('lastTabId', function (result) {
    // $("body").append("Tab IDY: "+result.lastTabId)
    // $("body").append(tab.url)
  })

  var port = chrome.tabs.connect(tab.id, {name: 'getImageData'}) // create a persistent connection
  port.postMessage({url: tab.url, method: 'getImageData'})
  //port.onMessage.addListener(function (msg) {})
})

/**
 * Stores HTTP response headers into an object array with URI as key.
 */
chrome.webRequest.onHeadersReceived.addListener(
  function (resp) {
    //if(resp.tabId == currentTabId){
    if(!responseHeaders[resp.tabId]) responseHeaders[resp.tabId] = {};
      responseHeaders[resp.tabId][resp.url] = `${resp.statusLine}${CRLF}`

      for (var key in resp.responseHeaders) {
        responseHeaders[resp.tabId][resp.url] += `${resp.responseHeaders[key].name}: ${resp.responseHeaders[key].value}${CRLF}`
      }
    //}
  }
  , {urls: ['http://*/*', 'https://*/*'], tabId: currentTabId}, ['responseHeaders', 'blocking'])

/**
 * Stores HTTP request headers into an object array with URI as key.
 * issue #79, these headers are not available here:
 * Authorization,Cache-Control,Connection,Content-Length,Host,If-Modified-Since,If-None-Match,If-Range
 * Partial-Data,Pragma,Proxy-Authorization,Proxy-Connection,Transfer-Encoding
 * see https://developer.chrome.com/extensions/webRequest
 */
chrome.webRequest.onBeforeSendHeaders.addListener(function (req) {
  //if(req.tabId == currentTabId){
  if(currentTabId != req.tabId){
    //currentTabId = req.tabId;
    //responseHeaders = [];
    //requestHeadersTracking = [];
    //requestHeaders = [];
    //console.log("reset");
  }
  if(!requestHeadersTracking[req.tabId]) requestHeadersTracking[req.tabId] = {};
  if(!requestHeaders[req.tabId]) requestHeaders[req.tabId] = {};
    var path = req.url.substring(req.url.match(/[a-zA-Z0-9]\//).index + 1)

    // per #79 keep track of already concatenated headers for warc string
    if (requestHeadersTracking[req.tabId][req.url] === null || requestHeadersTracking[req.tabId][req.url] === undefined) {
      requestHeadersTracking[req.tabId][req.url] = new Set()
    } else {
      requestHeadersTracking[req.tabId][req.url].clear()
    }
    requestHeaders[req.tabId][req.url] = `${req.method} ${path} HTTP/1.1${CRLF}`
    // requestHeaders[req.tabId][req.url] += req.method + ' ' + path + ' ' + FABRICATED_httpVersion + CRLF
    // console.log(("- Request headers received for "+req.url)
    for (var key in req.requestHeaders) {
      requestHeaders[req.tabId][req.url] += `${req.requestHeaders[key].name}: ${req.requestHeaders[key].value}${CRLF}`
      requestHeadersTracking[req.tabId][req.url].add(req.requestHeaders[key].name)
    }
  //}

}, {urls: ['http://*/*', 'https://*/*'], tabId: currentTabId}, ['requestHeaders', 'blocking'])

/**
 * Stores HTTP request headers into an object array with URI as key.
 * fix for issue #79, see explanation in onBeforeSendHeaders and documentation for requestHeadersTracking
 */
chrome.webRequest.onSendHeaders.addListener(function (req) {
  //if(req.tabId == currentTabId){
  if(currentTabId != req.tabId){
    //currentTabId = req.tabId;
    //responseHeaders = [];
    //requestHeadersTracking = [];
    //requestHeaders = [];
    //console.log("reset");
  }
    for (var key in req.requestHeaders) {
      if (!requestHeadersTracking[req.tabId]
        && !requestHeadersTracking[req.tabId][req.url]
        && !requestHeadersTracking[req.tabId][req.url].has(req.requestHeaders[key].name)) {
        requestHeaders[req.tabId][req.url] += `${req.requestHeaders[key].name}: ${req.requestHeaders[key].value}${CRLF}`
        requestHeadersTracking[req.tabId][req.url].add(req.requestHeaders[key].name)
      }
    }
  //}

}, {urls: ['http://*/*', 'https://*/*'], tabId: currentTabId}, ['requestHeaders'])

/**
 * Captures information about redirects that otherwise would be transparent to
 * the browser.
 */
chrome.webRequest.onBeforeRedirect.addListener(function (resp) {
  //if(resp.tabId == currentTabId){
  if(currentTabId != resp.tabId){
    //currentTabId = resp.tabId;
    //responseHeaders = [];
    //requestHeadersTracking = [];
    //requestHeaders = [];
    //console.log("reset");
  }
    if(!responseHeaders[resp.tabId]) responseHeaders[resp.tabId] = {};
    responseHeaders[resp.tabId][resp.url] += `${resp.statusLine}${CRLF}`

    // console.log(("--------------Redirect Response Headers for "+resp.url+" --------------")
    for (var key in resp.responseHeaders) {
      responseHeaders[resp.tabId][resp.url] += `${resp.responseHeaders[key].name}: ${resp.responseHeaders[key].value}${CRLF}`
    }
  //}
// console.log((responseHeaders[resp.tabId][resp.url])
}, {urls: ['http://*/*', 'https://*/*'], tabId: currentTabId}, ['responseHeaders'])

/* ************************************************************

 UTILITY FUNCTIONS

 ************************************************************ */
/**
 * From https://developer.mozilla.org/en-US/docs/Web/API/window.btoa
 * Converts UTF-8 to base 64 data
 */
function utf8_to_b64 (str) {
  return window.btoa(unescape(encodeURIComponent(str)))
}

/**
 * From https://developer.mozilla.org/en-US/docs/Web/API/window.btoa
 * Converts base 64 data to UTF-8
 */
function b64_to_utf8 (str) {
  return decodeURIComponent(escape(window.atob(str)))
}
/**
 * UNUSED: A means of capturing any particular values that are only present in
 * this handler.
 */

/*
 chrome.runtime.onMessage.addListener(
   function(request, sender, sendResponse) {
    console.log("Received message");
    if(request.doGenerateWarc){
      console.log("In background: " + "request.doGenerateWarc " +request.doGenerateWarc);
      doGenerateWarc(request.doGenerateWarc);
      sendResponse({"doGenerateWarc": request.doGenerateWarc});
      return true;
    }
  });
*/

chrome.tabs.onUpdated.addListener(function(tabId,changeInfo,tab){

  if (tabHash[tabId] && tab.url && tab.url.indexOf(tabHash[tabId]) == -1 &&
      changeInfo.url !== undefined){
        tabHash[tabId] = tab.url;
        if(responseHeaders[tabId]) responseHeaders[tabId] = {}; //reset hash
        if(requestHeaders[tabId]) requestHeaders[tabId] = {}; //reset hash
  }
});

chrome.webRequest.onResponseStarted.addListener(
  function (details) {}, {urls: ['http://*/*', 'https://*/*']}, ['responseHeaders'])

/* BEGIN UNUSED CODE */
// function alertContent () {
//   chrome.tabs.executeScript(null, {file: 'js/jquery-2.1.1.min.js'}, function () {
//     chrome.tabs.executeScript(null, {file: 'js/jquery.rc4.js'}, function () {
//       chrome.tabs.executeScript(null, {file: 'js/alertContent.js'}, function () {})
//     })
//   })
// }

// /**
//  * Converts images on the webpage into a binary string
//  */
// function encodeImages () {
//   var images = document.getElementsByTagName('img')
//   var img = new Image()
//   img.src = request.url
//   var canvas = document.createElement('canvas')
//   canvas.width = img.width
//   canvas.height = img.height
//   var context = canvas.getContext('2d')
//
//   // console.log((i+": "+images[i].src+"  file type: "+fileType)
//   var fileType = images[i].src.substr(images[i].src.length - 4).toLowerCase()
//   if (fileType === '.jpg' || fileType === 'jpeg') {
//     fileType = 'image/jpeg'
//   } else if (fileType === '.png') {
//     fileType = 'image/png'
//   } else if (fileType === '.gif') {
//     fileType = 'image/gif'
//   } else {
//     var uTransformed = images[i].src.substring(0, images[i].src.indexOf('.jpg')) + '.jpg'
//     alert('error at image ' + i + ' ' + uTransformed)
//     return
//   }
//   // console.log((i+": "+images[i].src+"  file type: "+fileType)
//
//   try {
//     var base64 = canvas.toDataURL(fileType)
//     img.src = base64
//     // console.log(("Replaced image "+request.url+" with its base64 encoded form per canvas")
//   } catch (e) {
//     alert('Encoding of inline binary content failed!')
//     console.log(e)
//     return
//   }
//   $(images[i]).replaceWith(img)
// }

// /**
//  * UNUSED: Desired functionality is to provide facilities to encrypt data in resulting WARC
//  */
// function encrypt () {
//   var key = document.getElementById('key').value
//   if (key === '') {
//     alert('First enter a key for encryption.')
//     return
//   }
//   chrome.tabs.executeScript(null, {file: 'js/jquery-2.1.1.min.js'}, function () {
//     chrome.tabs.executeScript(null, {file: 'js/jquery.rc4.js'}, function () {
//       chrome.tabs.executeScript(null, {code: 'var params = {k:\'' + key + '\'};'}, function () {
//         chrome.tabs.executeScript(null, {file: 'js/encryptPage.js'}, function () {})
//       })
//     })
//   })
// }
/* END UNUSED CODE */

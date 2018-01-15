// depends on date.js

/* ************** BEGIN STRING UTILITY FUNCTIONS **************  */

// function ab2str (buf) {
//   var s = String.fromCharCode.apply(null, new Uint8Array(buf))
//   return decodeUtf8(decodeUtf8(s))
// }

function str2ab (str) {
  var s = encodeUtf8(str)
  var buf = new ArrayBuffer(s.length) // 2 bytes for each char
  var bufView = new Uint8Array(buf)
  var i = 0
  var strLen = s.length
  for (; i < strLen; i++) {
    bufView[i] = s.charCodeAt(i)
  }
  return buf
}

function encodeUtf8 (s) {
  return unescape(encodeURIComponent(s))
}

// function decodeUtf8 (s) {
//   return decodeURIComponent(escape(s))
// }

function lengthInUtf8Bytes (str) {
  // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
  var m = encodeURIComponent(str).match(/%[89ABab]/g)
  return str.length + (m ? m.length : 0)
}

function ExtractHostname(url) {
    var hostname;
    var protocol;
    var port;

    if (url.indexOf("://") > -1) {
        hostname = url.split('/')[2];
        protocol = url.split(':')[0];
    } else {
        hostname = url.split('/')[0];
    }

    var host_bits = hostname.split(':')
    hostname = host_bits[0];
    if(host_bits[1]){
      port = host_bits[1];
    } else {
      port = protocol;
    }

    hostname = hostname.split('?')[0];

    return {
      hostname: hostname,
      port: port,
      protocol: protocol
    };
}

var responseDigests = {};

var requestDigests = {};

var pastkoSig = {};
var confirmedUrls = {};

/* ************** END STRING UTILITY FUNCTIONS **************  */

/* ************** BEGIN WARC CONTENT CREATOR UTILITY OBJECT **************  */

var WARCEntryCreator = {
  CRLF: '\r\n',
  warcRecordSeparator: '\r\n\r\n',
  contentLengthRe: /Content-Length:.*\r\n/gi,
  contentEncodingGZRe: /Content-Encoding.*gzip\r\n/gi,
  makeWarcHeaderContent (version, isPartOf, warcInfoDescription) {
    // ES6 template preserve the spaces and implicit newline characters added when putting content on the line below
    var whc = `software: WARCPinch/${version} http://threatpinch.com${this.CRLF}format: WARC File Format 1.0${this.CRLF}`
    whc += `conformsTo: http://bibnum.bnf.fr/WARC/WARC_ISO_28500_version1_latestdraft.pdf${this.CRLF}`
    whc += `isPartOf:  ${isPartOf}${this.CRLF}description:  ${warcInfoDescription}${this.CRLF}`
    whc += `robots: ignore${this.CRLF}http-header-user-agent:  ${navigator.userAgent}${this.CRLF}`
    whc += `http-header-from: development@threatpinch.com ${this.CRLF}${this.CRLF}`
    return whc
  },
  makeWarcHeader (now, fileName, contentLen) {
    var wh = `WARC/1.0${this.CRLF}WARC-Type: warcinfo${this.CRLF}WARC-Date: ${now}${this.CRLF}`
    wh += `WARC-Filename: ${fileName}${this.CRLF}WARC-Record-ID: ${this.guidGenerator()}${this.CRLF}`
    wh += `Content-Type: application/warc-fields${this.CRLF}Content-Length: ${contentLen}${this.CRLF}`
    return wh
  },
  makeWarcMetadataHeader (initURI, now, warcMetadataLen) {
    var wmh = `WARC/1.0${this.CRLF}WARC-Type: metadata${this.CRLF}WARC-Target-URI: ${initURI}${this.CRLF}WARC-Date: ${now}${this.CRLF}`
    wmh += `WARC-Concurrent-To: <urn:uuid:dddc4ba2-c1e1-459b-8d0d-a98a20b87e96>${this.CRLF}WARC-Record-ID: <urn:uuid:6fef2a49-a9ba-4b40-9f4a-5ca5db1fd5c6>${this.CRLF}`
    wmh += `Content-Type: application/warc-fields${this.CRLF}Content-Length: ${warcMetadataLen}${this.CRLF}`
    return wmh
  },
  makeWarcRequestHeaderWith (targetURI, now, warcConcurrentTo, warcRequest) {
    var wrh = `WARC/1.0${this.CRLF}WARC-Type: request${this.CRLF}WARC-Target-URI: ${targetURI}${this.CRLF}`
    wrh += `WARC-Date: ${now}${this.CRLF}WARC-Concurrent-To: ${warcConcurrentTo}${this.CRLF}`
    wrh += `WARC-Record-ID: ${this.guidGenerator()}${this.CRLF}Content-Type: application/http; msgtype=request${this.CRLF}`
    if(warcRequest.length) wrh += `Content-Length: ${warcRequest.length + 2}${this.CRLF}${this.CRLF}${warcRequest}${this.CRLF}${this.CRLF}`
    return wrh
  },
  makeWarcResponseHeaderWith (targetURI, now, warcConcurrentTo, resp, additionalContentLength) {
    var httpHeader = resp.substring(0, resp.indexOf('\r\n\r\n'))
    if (httpHeader === '') {
      httpHeader = resp
    }
    // var countCorrect = httpHeader.match(/\r\n/g).length // Number of lines in xx below
    var contentLength = lengthInUtf8Bytes(resp)
    if (additionalContentLength) {
      contentLength += additionalContentLength
    }
    var wrh = `WARC/1.0${this.CRLF}WARC-Type: response${this.CRLF}WARC-Target-URI: ${targetURI}${this.CRLF}`
    wrh += `WARC-Date: ${now}${this.CRLF}WARC-Record-ID: ${this.guidGenerator()}${this.CRLF}`
    wrh += `WARC-Digest: ${responseDigests[targetURI].digest}${this.CRLF}`
    wrh += `Content-Type: application/http; msgtype=response${this.CRLF}Content-Length: ${contentLength}${this.CRLF}`
    return wrh
  },
  _s4 () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1)
  },
  genUUID () {
    return `${this._s4()}${this._s4()}-${this._s4()}-${this._s4()}-${this._s4()}-${this._s4()}${this._s4()}${this._s4()}`
  },
  guidGenerator () {
    // from http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
    return `<urn:uuid:${this.genUUID()}>`
  },
  touchUpInitURIHeaders (initURIHeaders, docHtml) {
    // targetURI
    // DUCTTAPE
    var newInitURIHeaders = initURIHeaders
    if (newInitURIHeaders.indexOf('twitter.com') > -1) {
      newInitURIHeaders = newInitURIHeaders.replace('text/javascript', 'text/html')
    }
    // DUCTTAPE to fix bug #53
    newInitURIHeaders = newInitURIHeaders.replace('HTTP/1.1 304 Not Modified', 'HTTP/1.1 200 OK')

    // DUCTTAPE to fix bug #62
    // - fix the content length to be representative of the un-zipped text content
    // added \r\n instead of \n here to address warc indexing issues #17 and #78
    var fixContentLength = `Content-Length: ${lengthInUtf8Bytes(docHtml)}${this.CRLF}`
    newInitURIHeaders = newInitURIHeaders.replace(this.contentLengthRe, fixContentLength)

    // - remove reference to GZip HTML (or text) body, as we're querying the DOM, not getting the raw feed
    newInitURIHeaders = newInitURIHeaders.replace(this.contentEncodingGZRe, '')
    return newInitURIHeaders
  }
}

/* ************** END WARC CONTENT CREATOR UTILITY OBJECT **************  */

/* ************** BEGING FEROSS-STANDARD STYLE CONFORMITY HELPERS **************  */

var helperREs = {
  jsregexp: new RegExp('content-type:[ ]*(text|application)/(javascript|js)', 'i'),
  imgregexp: new RegExp('content-type:[ ]*image/', 'i'),
  cssregexp: new RegExp('content-type:[ ]*text/(css|stylesheet)', 'i'),
  fontregexp: new RegExp('content-type:[ ]*font/', 'i'),
  whileMyArrayRe: /\r\n(.*)\r\n----------------/g
}

function asynchronouslyFetchImageData (rh, now, warcConcurrentTo, arrayBuffers, responsesToConcatenate, fileName, saveFileName) {
  chrome.storage.local.get(rh, function (result) {
    var rawImageDataAsBytes = result[rh]

    if (rawImageDataAsBytes) { // we have the data in chrome.storage.local
      // var imgRawString = ''
      var byteCount = result[rh].length
      // var imagesAsObjectsFromJSON = rawImageDataAsBytes // redundant of above but testing

      var hexValueArrayBuffer = new ArrayBuffer(byteCount)
      var hexValueInt8Ary = new Int8Array(hexValueArrayBuffer)
      var ixx = 0
      var index = 0
      // var sstr = ''
      for (; index < byteCount; index++) {
        hexValueInt8Ary.set([result[rh][index]], ixx)
        ixx++
      }

      var rhsWithCRLF = `${responseHeaders[rh]}${WARCEntryCreator.CRLF}`
      var hexValueInt8AryPlusRecordSep = hexValueInt8Ary.length + WARCEntryCreator.warcRecordSeparator.length
      var rhsTemp = WARCEntryCreator.makeWarcResponseHeaderWith(rh, now, warcConcurrentTo, rhsWithCRLF, hexValueInt8AryPlusRecordSep)
      var responseHeaderString = `${rhsTemp}${WARCEntryCreator.CRLF}`

      arrayBuffers.push(str2ab(responseHeaderString))
      arrayBuffers.push(str2ab(`${responseHeaders[rh]}${WARCEntryCreator.CRLF}`))
      arrayBuffers.push(hexValueInt8Ary.buffer) // Now, add the image data
      arrayBuffers.push(str2ab(`${WARCEntryCreator.warcRecordSeparator}${WARCEntryCreator.warcRecordSeparator}`))

      delete responsesToConcatenate[rh]
    } else {
      // if we don't have the image data in localstorage, remove it anyway
      console.error('We do not have ' + rh + '\'s data in cache.')
      delete responsesToConcatenate[rh]
    }

    if (Object.keys(responsesToConcatenate).length === 0) {
      if (!localStorage['uploadTo'] || localStorage['uploadTo'].length === 0) {
        if(saveFileName && saveFileName != "" && typeof saveFileName != "object") fileName = saveFileName + ".warc";
        var sigBuffer = [];
        console.log(pastkoSig);
        sigBuffer.push(str2ab(JSON.stringify(pastkoSig, null, 2)));

        console.log("SaveAs Filename: " + fileName)
        saveAs(new Blob(arrayBuffers), fileName)
        saveAs(new Blob(sigBuffer), fileName + ".json");
      } else {
        //uploadWarc(arrayBuffers)
      }
    } else {
      // console.log(('Still have to process URIs:'+Object.keys(responsesToConcatenate).join(' '))
    }
  })
}

function doDigestRequest(url, filename, baseInitDomain){
  var promise = new Promise(function (resolve, reject) {
    if(!url.includes("//" + baseInitDomain.hostname)){
      console.log("Out of scope: " + url + " for domain: " + baseInitDomain.hostname);
      return resolve({
        status: "OUT_OF_SCOPE",
        statusText: "ERROR"
      });
    }
    var xhr = new XMLHttpRequest();
    xhr.open("GET",url, true);
    xhr.responseType = "arraybuffer";
    xhr.addEventListener('readystatechange', function(e) {
      if( this.readyState === 4 ) {
        var blob = new Blob([xhr.response]);
        var text = xhr.response
        if(text) {
          var shaObj = sha256(text);
          console.log("URL: " + url);
          console.log("readystate sha256: " + shaObj);
          var uint = new Uint8Array(text);
          var contextHash = ssdeep.digest(uint);
          //var contextHash = ssdeep.fuzzy_hash_file(uint);
          //BinaryToStrings(uint);
          var sha1raw = sha1.create();
          sha1raw.update(uint);

          var sha1hash = sha1(uint);
          var sha1digest = sha1raw.digest();
          var base32sha1 = base32.encode(sha1digest);
          console.log("SHA1: " + sha1raw.hex());
          console.log("Base32: " + base32sha1);
          console.log("Context Hash:", contextHash);
          var hostName = ExtractHostname(url).hostname;
          confirmedUrls[url] = url;
          var urlPath = url.split(hostName)

          pastkoSig[base32sha1] = {
            "name": filename + " - " + urlPath[1],
            "path": urlPath[1],
            "digest": base32sha1,
            "status": xhr.status,
            "sha2": shaObj,
            "ssdeep": contextHash
          }
          var obj = {
            sha2: shaObj,
            digest: base32sha1,
            status: xhr.status,
            ssdeep: contextHash
          };
          responseDigests[url] = obj;
          resolve(obj);
        } else {
          var obj = {
            sha2: "REQUEST_FAILED",
            digest: "REQUEST_FAILED",
            status: xhr.status,
            ssdeep: "REQUEST_FAILED"
          };
          responseDigests[url] = "Request Failed";
          resolve({
            status: xhr.status,
            statusText: xhr.statusText
          });
        }

      }
    });
    xhr.onerror = function () {
      var obj = {
        sha2: "REQUEST_FAILED",
        digest: "REQUEST_FAILED",
        status: xhr.status,
        ssdeep: "REQUEST_FAILED"
      };
      responseDigests[url] = "Request Failed";
      resolve({
        status: xhr.status,
        statusText: xhr.statusText
      });
    };
    xhr.send();
  });
  return promise;
}


function updateDigests(currentTabId, saveFileName, baseInitDomain, initURI){
  var promiseArray = [];
  for (var requestHeader in requestHeaders[currentTabId]) {
    promiseArray.push(doDigestRequest(requestHeader,saveFileName, baseInitDomain));
  }
  promiseArray.push(doDigestRequest(initURI,saveFileName, baseInitDomain));
  return Promise.all(promiseArray);
}

/* ************** END FEROSS-STANDARD STYLE CONFORMITY HELPERS **************  */

function generateWarc (oRequest, oSender, fCallback) {
  if (oRequest.method !== 'generateWarc') {
    return
  }
  pastkoSig = {}; //RESET
  confirmedUrls = {};
  console.log('Executing generateWARC() with...')
  console.log(oRequest)
  var now = new Date().toISOString()
  now = now.substr(0, now.indexOf('.')) + 'Z'

  var fileName = oRequest.file
  var initURI = oRequest.url
  var currentTabId = oRequest.currentTabId;
  var saveFileName = oRequest.fileName;
  var baseInitDomain = ExtractHostname(initURI)

  updateDigests(currentTabId, saveFileName, baseInitDomain, initURI).then(function(results){
    /*
    var i = 0;
    for (var requestHeader in requestHeaders[currentTabId]) {
      responseDigests[requestHeader] = results[i];
      i++;
    }
    */
    if(currentTabId && initURI && requestHeaders[currentTabId] && requestHeaders[currentTabId][initURI] && confirmedUrls[initURI]){
      //continue
    } else {
      console.log("Error: Current TabId = " + currentTabId + " INIT_URL = " + initURI + " requestHeaders = " + requestHeaders);
      console.log("Confirmed URLs: " + JSON.stringify(confirmedUrls));
      return false;
    }
    var warcInfoDescription = 'Crawl initiated from the WARCPinch Google Chrome extension'
    var isPartOf = 'basic'
    if (localStorage.getItem('collectionId') || localStorage.getItem('collectionName')) {
      warcInfoDescription = `collectionId=${localStorage.getItem('collectionId')}, collectionName="${localStorage.getItem('collectionName')}"`
      isPartOf = localStorage.getItem('collectionId')
    }

    var warcHeaderContent = WARCEntryCreator.makeWarcHeaderContent(version, isPartOf, warcInfoDescription)
    var warcHeader = WARCEntryCreator.makeWarcHeader(now, fileName, warcHeaderContent.length)
    var warcRequest = requestHeaders[currentTabId][initURI]
    var warcConcurrentTo = WARCEntryCreator.guidGenerator()
    var warcRequestHeader = WARCEntryCreator.makeWarcRequestHeaderWith(initURI, now, warcConcurrentTo, warcRequest)
    var outlinks = oRequest.outlinks
    var outlinkStr = ''
    for (var outlink in outlinks) {
      var href = outlinks[outlink]
      try{
        if (href.substr(0, 1) !== 'h') {
          href = `${initURI}${href}` // resolve fragment and internal links
        }
        href = `${href.substr(0, 8)}${href.substr(8).replace(/\/\//g, '/')}` // replace double slashes outside of scheme
        // Sanitize ../'s
        var parts = href.split(' ')
        parts[0] = (new URL(parts[0])).href
        href = parts.join(' ')
        console.log(href)

        outlinkStr += `outlink: ${href}${WARCEntryCreator.CRLF}`
      } catch(err){
        console.log(err);
      }
      if (href.indexOf('mailto:') > -1) {
        continue
      }
    }

    // includes initial URI var warcMetadata = "outlink: "+ initURI + CRLF + outlinkStr
    var warcMetadata = outlinkStr
    var warcMetadataHeader = WARCEntryCreator.makeWarcMetadataHeader(initURI, now, warcMetadata.length)

    responseHeaders[currentTabId][initURI] = WARCEntryCreator.touchUpInitURIHeaders(responseHeaders[currentTabId][initURI], oRequest.docHtml)

    var warcResponse = `${responseHeaders[currentTabId][initURI]}${WARCEntryCreator.CRLF}${oRequest.docHtml}${WARCEntryCreator.CRLF}`
    var warcResponseHeader = WARCEntryCreator.makeWarcResponseHeaderWith(initURI, now, warcConcurrentTo, warcResponse, 0)
    var myArray = helperREs.whileMyArrayRe.exec(oRequest.headers)
    var str = '' // eslint-disable-line no-unused-vars
    while (myArray !== null) {
      str += myArray[1]
      myArray = helperREs.whileMyArrayRe.exec(oRequest.headers)
    }


    var arrayBuffers = [] // Load data in order in the arrayBuffers array then combine with the file blob to write out

    arrayBuffers.push(str2ab(`${warcHeader}${WARCEntryCreator.CRLF}`))
    arrayBuffers.push(str2ab(`${warcHeaderContent}${WARCEntryCreator.warcRecordSeparator}`))
    arrayBuffers.push(str2ab(`${warcRequestHeader}${WARCEntryCreator.CRLF}`))
    arrayBuffers.push(str2ab(`${warcMetadataHeader}${WARCEntryCreator.CRLF}`))
    arrayBuffers.push(str2ab(`${warcMetadata}${WARCEntryCreator.warcRecordSeparator}`))
    arrayBuffers.push(str2ab(`${warcResponseHeader}${WARCEntryCreator.CRLF}`))
    arrayBuffers.push(str2ab(`${warcResponse}${WARCEntryCreator.warcRecordSeparator}`))

    var cssURIs = oRequest.css.uris
    var cssData = oRequest.css.data
    var jsURIs = oRequest.js.uris
    var jsData = oRequest.js.data

    console.log(oRequest)
    //return

    // var seedURL = true
    var responsesToConcatenate = []

    for (var requestHeader in requestHeaders[currentTabId]) {
      if (requestHeader === initURI || !confirmedUrls[requestHeader]) {
        continue // the 'seed' will not have a body, we handle this above, skip
      }
      var rhsTemp = WARCEntryCreator.makeWarcRequestHeaderWith(requestHeader, now, warcConcurrentTo, requestHeaders[currentTabId][requestHeader])
      var requestHeaderString = `${rhsTemp}${WARCEntryCreator.CRLF}`
      arrayBuffers.push(str2ab(requestHeaderString))

      if (
        responseHeaders[currentTabId][requestHeader] &&
        helperREs.imgregexp.exec(responseHeaders[currentTabId][requestHeader]) !== null &&
        responseHeaders[currentTabId][requestHeader].indexOf('icon') === -1) {
        responsesToConcatenate[requestHeader] = 'pending'
        asynchronouslyFetchImageData(requestHeader, now, warcConcurrentTo, arrayBuffers, responsesToConcatenate, fileName, saveFileName)
      } else if (
        responseHeaders[currentTabId][requestHeader] &&
        helperREs.cssregexp.exec(responseHeaders[currentTabId][requestHeader]) !== null) {
        if (!cssURIs) {
          break
        }
        responsesToConcatenate[requestHeader] = 'pending'
        console.log(requestHeader + ' is a CSS file')
        var respHeader = `${responseHeaders[currentTabId][requestHeader]}${WARCEntryCreator.warcRecordSeparator}`
        var respContent
        var cc = 0
        var cssURIsLen = cssURIs.length
        for (; cc < cssURIsLen; cc++) {
          if (requestHeader === cssURIs[cc]) {
            respContent = `${cssData[cssURIs.indexOf(requestHeader)]}${WARCEntryCreator.warcRecordSeparator}`
            break
          }
        }
        var cssRHSTemp = WARCEntryCreator.makeWarcResponseHeaderWith(requestHeader, now, warcConcurrentTo, respHeader + respContent)
        var cssResponseHeaderString = `${cssRHSTemp}${WARCEntryCreator.CRLF}`
        arrayBuffers.push(str2ab(cssResponseHeaderString))

        arrayBuffers.push(str2ab(`${respHeader}${respContent}${WARCEntryCreator.warcRecordSeparator}`))
        delete responsesToConcatenate[requestHeader]
      } else if (responseHeaders[currentTabId][requestHeader] && helperREs.jsregexp.exec(responseHeaders[currentTabId][requestHeader]) !== null) {
        var jsRespHeader = `${responseHeaders[currentTabId][requestHeader]}${WARCEntryCreator.warcRecordSeparator}`
        var jsRespContent
        var jsIdx = 0
        var jsURIsLen = jsURIs.length
        for (; jsIdx < jsURIsLen; jsIdx++) {
          if (requestHeader === jsURIs[jsIdx]) {
            jsRespContent = `${jsData[jsURIs.indexOf(requestHeader)]}${WARCEntryCreator.warcRecordSeparator}`
            break
          }
        }
        var jsRHSTemp = WARCEntryCreator.makeWarcResponseHeaderWith(requestHeader, now, warcConcurrentTo, jsRespHeader + jsRespContent)
        var jsResponseHeaderString = `${jsRHSTemp}${WARCEntryCreator.CRLF}`
        arrayBuffers.push(str2ab(jsResponseHeaderString))

        arrayBuffers.push(str2ab(`${jsRespHeader}${jsRespContent}${WARCEntryCreator.warcRecordSeparator}`))
        delete responsesToConcatenate[requestHeader]
      } else {
        var jsRespHeader = `${WARCEntryCreator.warcRecordSeparator}`
        var jsRespContent = "";
        var jsIdx = 0
        var jsRHSTemp = WARCEntryCreator.makeWarcResponseHeaderWith(requestHeader, now, warcConcurrentTo, jsRespHeader + jsRespContent)
        var jsResponseHeaderString = `${jsRHSTemp}${WARCEntryCreator.CRLF}`
        arrayBuffers.push(str2ab(jsResponseHeaderString))

        arrayBuffers.push(str2ab(`${jsRespHeader}${jsRespContent}${WARCEntryCreator.warcRecordSeparator}`))
        delete responsesToConcatenate[requestHeader]
      }
    }

    if (Object.keys(responsesToConcatenate).length === 0) {
      if(saveFileName && saveFileName != "") fileName = saveFileName + ".warc";
      var sigBuffer = [];
      console.log(pastkoSig);
      sigBuffer.push(str2ab(JSON.stringify(pastkoSig, null, 2)));

      console.log("SaveAs Filename: " + fileName)
      saveAs(new Blob(arrayBuffers), fileName)
      saveAs(new Blob(sigBuffer), fileName + ".json");
    } else {
      console.log(document.getElementById('generateWarc'))
      console.log(document)
      console.log('Still have to process URIs:' + Object.keys(responsesToConcatenate).join(' '))
    }
  });
}

/* ************************************************************

 UTILITY FUNCTIONS

 ************************************************************ */

// from https://developer.mozilla.org/en-US/docs/Web/API/window.btoa
function utf8_to_b64 (str) {
  return window.btoa(unescape(encodeURIComponent(str)))
}

function b64_to_utf8 (str) {
  return decodeURIComponent(escape(window.atob(str)))
}

function getVersion (callback) {
  var xmlhttp = new XMLHttpRequest()
  xmlhttp.open('GET', '../manifest.json')
  xmlhttp.onload = function (e) {
    var manifest = JSON.parse(xmlhttp.responseText)
    callback(manifest.version)
  }
  xmlhttp.send(null)
}

function uploadWarc (abArray) {
  var blobFromArrayBuffers = new Blob(abArray)
  console.log('Uploading WARC to ' + localStorage['uploadTo'])

  var ajaxRequest = new XMLHttpRequest()

  var progressObj = {
    type: 'progress',
    title: 'WARC Uploading',
    message: ajaxRequest.responseText,
    iconUrl: '../icons/icon-128.png'
  }
  progressObj.progress = 0
  chrome.notifications.create('id1', progressObj, function () {})
  chrome.notifications.onButtonClicked.addListener(function (id, buttonIndex) {
    chrome.tabs.create({url: warcfileURI})
  })

  function updateNotification (perc) {
    progressObj.progress = perc
    chrome.notifications.update('id1', progressObj, function () {})
  }

  ajaxRequest.open('POST', localStorage['uploadTo'], true)

  ajaxRequest.onreadystatechange = function () {
    updateNotification(25 * ajaxRequest.readyState)
    if (ajaxRequest.readyState === 4) {
      progressObj.message = ajaxRequest.responseText
      progressObj.iconUrl = '../icons/icon-check-128.png'
      progressObj.title = 'WARC Uploaded'
      progressObj.buttons = [{title: 'View WARC file', iconUrl: '../icons/icon-viewing.png'}]
      setTimeout(function () { updateNotification(100) }, 500)
      if (ajaxRequest.status === 201 && ajaxRequest.responseText.length > 0) {
        warcfileURI = ajaxRequest.responseText
      } else {
        alert('The server accepted the WARC.')
      }
    }
  }
  ajaxRequest.send(blobFromArrayBuffers)
}
var warcfileURI = '' // The Chrome notifications API isn't mature enough to surface data, even via buttons

var version
getVersion(function (ver) { version = ver })

/* ************************************************************

 INITIAL RUNTIME EXECUTION

 ************************************************************ */

chrome.runtime.onMessage.addListener(generateWarc)

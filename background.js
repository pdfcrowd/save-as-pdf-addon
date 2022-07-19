var canvas;
var canvasContext;
var image;
// var animation = new ConvertingAnimation();
var animation = new ConversionIndicator();
var loggedIn = false;
var restricted = false;
var error = '';
var pendingStatusRequest = false;



// https://developer.chrome.com/docs/extensions/reference/action/
// https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/api/action/demo/index.js


// TBD - dev.pdfcrowd.com -> pdfcrowd.com (tady a manifest)
// check that there is an ongoin conversion
// asi pop-up se spinnerem
// aby byla po installu defaultne pinned

function json(response) {
    return response.json();
}


function ConversionIndicator() {
    this.isRunning_ = false;
}

ConversionIndicator.prototype.start = function() {
    this.isRunning_ = true;
    chrome.action.setTitle({title: 'converting'});
    chrome.action.setBadgeText({text: '...'});
    chrome.action.setBadgeBackgroundColor({color:"#ff0"});
}


ConversionIndicator.prototype.stop = function() {
    this.isRunning_ = false;
}

ConversionIndicator.prototype.isRunning = function() {
    return this.isRunning_;
}




function showStaticIcon() {
    if (animation.isRunning()) return;
    canvasContext.drawImage(image, 0, 0);
    drawLoggedIn();
    chrome.action.setIcon({imageData: canvasContext.getImageData(0, 0, canvas.width, canvas.height)});
}


function updateBadgeAndTitle() {
    if (error) {
        chrome.action.setTitle({title: error});
        chrome.action.setBadgeText({text: 'ERR'});
        chrome.action.setBadgeBackgroundColor({color:"#f00"});
    } else {
        var title = "Save as PDF - by pdfcrowd.com"
        chrome.action.setTitle({title: title});
        chrome.action.setBadgeBackgroundColor({color:[0, 0, 0, 0]});
        chrome.action.setBadgeText({text: ''});
    }
}


function showError(msg) {
    error = msg;
    updateBadgeAndTitle();
}


function clearError() {
    error = '';
    updateBadgeAndTitle();
}


function drawLoggedIn() {
    if (loggedIn && !restricted)
        return;
   
    canvasContext.save();
    canvasContext.fillStyle = "red";
    canvasContext.arc(15, 4, 2, 0, 2*Math.PI);
    canvasContext.fill();
    canvasContext.restore();
}


function updateLoggedIn(user) {
    loggedIn = user.authenticated;
    if (loggedIn)
        restricted = user.restricted;
    updateBadgeAndTitle();
    showStaticIcon();
}


// function onDataReady(xhr, callbacks) {
//     return function(data) {
//         if (xhr.readyState == 4) {
//             if (xhr.status == 200) {
//                 if (callbacks.onSuccess) {
//                     try {
//                         var data = JSON.parse(xhr.responseText);
//                         callbacks.onSuccess(data);
//                     } catch (e) {
//                         showError("Conversion failed.");
//                     }
//                 }
//             } else {
//                 if (callbacks.onError)
//                     callbacks.onError(xhr.responseText)
//             }
//             if (callbacks.onComplete)
//                 callbacks.onComplete();
//         }
//     };
// }


function canRunConversion(tab) {
    var rex = /^((?:chrome|file|chrome-extension|about|moz-extension|wyciwyg):.*$)/i;
    var result = rex.exec(tab.url);
    if (result) {
        showError("Conversion of local URLs is not supported (" + result[1] + ").");
        return false;
    }
    // is there an ongoing conversion?
    if (animation.isRunning()) return false;

    return true;
}

function createPdf(tab, apiUrl) {
    
    fetch(apiUrl, {
        method: 'post',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "src=" + escape(tab.url),
        credentials: 'include',
    })
        .then(json)
        .then(function(data) {
            if (data.status === 'ok') {
                chrome.tabs.update(tab.id, {url: data.url});
	        } else if (data.status === 'error') {
                showError(data.message);
            } else if (data.status === 'redirect') {
                // tbd
            }
            animation.stop();
            if (data.user) {
                updateLoggedIn(data.user);
            }
        })
        .catch(function(err) {
            showError(err.message)
            animation.stop();
        });
    
    // var xhr = new XMLHttpRequest();
    // xhr.onreadystatechange = onDataReady(xhr, {
    //     onSuccess: function(data) {
    //         if (data.status === 'ok') {
    //             chrome.tabs.update(tab.id, {url: data.url});
	//         } else if (data.status === 'error') {
    //             showError(data.message);
    //         } else if (data.status === 'redirect') {
    //                   // tbd
    //         }
    //         updateLoggedIn(data.user);
    //     },
    //     
    //     onError: function(responseText) {
    //         try {
    //             var data = JSON.parse(xhr.responseText);
    //             var error = data.error || "Conversion failed."
    //             showError(error);
    //         } catch (e) {
    //             showError("Conversion failed.");
    //         }
    //     },
    // 
    //     onComplete: function() { 
    //         animation.stop(); 
    //     }
    // });
    // 
    // xhr.open('POST', apiUrl, true);
    // xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    // xhr.send("src=" + escape(tab.url));
};


function init() {
    // var version = "1.13";
    // //Show updated page first load
    // if(false && localStorage.updatedToVersion && localStorage.updatedToVersion != version) {
    //     chrome.tabs.create( {url:"updated.html"} );
    // }
    // localStorage.updatedToVersion = version;
}

var baseUrl = 'https://dev.pdfcrowd.com'
var apiUrls = {
    1: baseUrl + '/session/json/convert/uri/',
    2: baseUrl + '/session/json/convert/uri/v2/'
}

var apiVersionUrl = baseUrl + '/session/api-version/'



function status(response) {
    if (response.status >= 200 && response.status < 300) {
        return Promise.resolve(response);
    } else {
        return Promise.reject(new Error("Try again later."));
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    if (!canRunConversion(tab)) {
        return;
    }

    var iconFile = "icons/icon19.png";
    var response = await fetch(chrome.runtime.getURL(iconFile));
    var blob = await response.blob()
    image = await createImageBitmap(blob);
    canvas = new OffscreenCanvas(image.width, image.height);
    canvasContext = canvas.getContext("2d");
    canvasContext.drawImage(image, 0, 0);
    updateBadgeAndTitle();

    clearError();
    animation.start();

    // find out the api version for the current user
    fetch(apiVersionUrl)
        .then(status)
        .then(json)
        .then(function(data){
            var apiUrl = apiUrls[data.api_version];
            if (apiUrl === undefined) {
                apiUrl = apiUrls[2];
            }
            createPdf(tab, apiUrl);
        })
        .catch(function(err){
            showError(err.message);
            animation.stop();
        });
});

init();

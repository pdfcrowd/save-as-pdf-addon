var canvas;
var canvasContext;
var image;
var animation = new ConvertingAnimation();
var loggedIn = false;
var restricted = false;
var error = '';
var pendingStatusRequest = false;

function ConvertingAnimation() {
    this.timerId_ = 0;
    this.imageXPos_ = 0;
}


ConvertingAnimation.prototype.paintFrame = function() {
    canvasContext.save();

    
    var imgHeight = canvas.height - 6;
    var imgWidth = canvas.width - this.imageXPos_;

    canvasContext.drawImage(image, 0, 0);
    canvasContext.drawImage(image, 0, 3, imgWidth, imgHeight, this.imageXPos_, 3, imgWidth, imgHeight);
    
    if (this.imageXPos_) {
        canvasContext.drawImage(
            image, 0, 3, canvas.width, imgHeight, -canvas.width + this.imageXPos_, 3, canvas.width, imgHeight);
    }
      
    canvasContext.restore();
    
    chrome.browserAction.setIcon({imageData: canvasContext.getImageData(0, 0, canvas.width, canvas.height)});
    this.imageXPos_ += 1;
    
    if (this.imageXPos_ >= canvas.width)
        this.imageXPos_ = 0;
}


ConvertingAnimation.prototype.start = function() {
    if (this.timerId_)
        return;
    
    var self = this;
    this.timerId_ = window.setInterval(function() {
        self.paintFrame();
    }, 100);
}


ConvertingAnimation.prototype.stop = function() {
    if (!this.timerId_)
        return;
    window.clearInterval(this.timerId_);
    this.timerId_ = 0;
    this.imageXPos_ = 0;
    showStaticIcon();
}


function showStaticIcon() {
    if (animation.timerId_ != 0) return;
    canvasContext.drawImage(image, 0, 0);
    drawLoggedIn();
    chrome.browserAction.setIcon({imageData: canvasContext.getImageData(0, 0, canvas.width, canvas.height)});
}


function updateBadgeAndTitle() {
    if (error) {
        chrome.browserAction.setTitle({title: error});
        chrome.browserAction.setBadgeText({text: 'ERR'});
        chrome.browserAction.setBadgeBackgroundColor({color:"#f00"});
    } else {
        var title = "Save as PDF - by pdfcrowd.com"
        chrome.browserAction.setTitle({title: title});
        chrome.browserAction.setBadgeText({text: ''});
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


function onDataReady(xhr, callbacks) {
    return function(data) {
        if (xhr.readyState == 4) {
            if (xhr.status == 200) {
                if (callbacks.onSuccess) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        callbacks.onSuccess(data);
                    } catch (e) {
                        showError("Conversion failed.");
                    }
                }
            } else {
                if (callbacks.onError)
                    callbacks.onError(xhr.responseText)
            }
            if (callbacks.onComplete)
                callbacks.onComplete();
        }
    };
}


function canRunConversion(tab) {
    var rex = /^((?:chrome|file|chrome-extension|about|moz-extension|wyciwyg):.*$)/i;
    var result = rex.exec(tab.url);
    if (result) {
        showError("Conversion of local URLs is not supported (" + result[1] + ").");
        return false;
    }
    // is there an ongoing conversion?
    if (animation.timerId_ != 0) return false;

    return true;
}

function createPdf(tab, apiUrl) {
    
    clearError();
    
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = onDataReady(xhr, {
        onSuccess: function(data) {
            if (data.status === 'ok') {
                chrome.tabs.update(tab.id, {url: data.url});
	        } else if (data.status === 'error') {
                showError(data.message);
            } else if (data.status === 'redirect') {
                      // tbd
            }
            updateLoggedIn(data.user);
        },
        
        onError: function(responseText) {
            try {
                var data = JSON.parse(xhr.responseText);
                var error = data.error || "Conversion failed."
                showError(error);
            } catch (e) {
                showError("Conversion failed.");
            }
        },

        onComplete: function() { 
            animation.stop(); 
        }
    });

    xhr.open('POST', apiUrl, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.send("src=" + escape(tab.url));
};


function init() {

    var version = "1.12";
    //Show updated page first load
    if(false && localStorage.updatedToVersion && localStorage.updatedToVersion != version) {
        chrome.tabs.create( {url:"updated.html"} );
    }
    localStorage.updatedToVersion = version;
    

    image = document.getElementById("standard_icon")
    canvas = document.getElementById("canvas");
    canvasContext = canvas.getContext("2d");
    updateBadgeAndTitle();
    //findOutUserStatus();
}

var baseUrl = 'https://pdfcrowd.com'
var apiUrls = {
    1: baseUrl + '/session/json/convert/uri/',
    2: baseUrl + '/session/json/convert/uri/v2/'
}

var apiVersionUrl = baseUrl + '/session/api-version/'


chrome.browserAction.onClicked.addListener(function(tab) {
    if (!canRunConversion(tab)) {
        return;
    }

    animation.start();

    // find out the api version for the current user
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = onDataReady(xhr, {
        onSuccess: function(data) {
            var apiUrl = apiUrls[data.api_version];
            if (apiUrl === undefined) {
                apiUrl = apiUrls[2];
            }
            // create pdf
            createPdf(tab, apiUrl);
        },
        onError: function(responseText) {
            showError("Can't connect to Pdfcrowd");
            animation.stop();
        },
    });
    xhr.open('GET', apiVersionUrl, true);
    xhr.send(null);
});

init();

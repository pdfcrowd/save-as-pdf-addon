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
        chrome.browserAction.setBadgeText({text: '!'});
        // TBD badge background color
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
                showError("Can't connect to Pdfcrowd")
            }
            if (callbacks.onComplete)
                callbacks.onComplete();
        }
    };
}


function createPdf(tab) {
    var rex = /^((?:chrome|file|chrome-extension|about):.*$)/i;
    var result = rex.exec(tab.url);
    if (result) {
        showError("Conversion of local URLs is not supported (" + result[1] + ").");
        return;
    }
    
    // is there an ongoing conversion?
    if (animation.timerId_ != 0) return;
    
    clearError();
    
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = onDataReady(xhr, {
        onSuccess: function(data) {
            if (data.status === 'ok') {
                try {
                    // create a new tab for the generated PDF
                    // fixes: http://pdfcrowd.com/forums/read.php?3,1220
		            chrome.tabs.create({url: data.url, active: false}, function(pdf_tab) {
                        // normally, Chrome closes that tab; however
                        // under certain circumstances (e.g. when the
                        // user cancels the Save As dialog) the tab
                        // may stay open; so we wait a couple of
                        // seconds and close tab if it still exists
                        setTimeout(function() {
                            chrome.tabs.get(pdf_tab.id, function(pdf_tab) {
                                if (pdf_tab.url === data.url && !pdf_tab.active) {
                                    chrome.tabs.remove(pdf_tab.id);
                                }});
                        }, 3000);
                    });
                } catch(e) {
                    // fallback for older versions that do not suppoort the 'active' property
                    // does not work for pinned tabs, see
                    // http://code.google.com/p/chromium/issues/detail?id=36791
                    chrome.tabs.update(tab.id, {url: data.url});
                }
	        } else if (data.status === 'error') {
                showError(data.message);
            } else if (data.status === 'redirect') {
                      // tbd
            }
            updateLoggedIn(data.user);
        },
        
        onComplete: function() { 
            animation.stop(); 
        }
    });
    
    var url = 'http://pdfcrowd.com/session/json/convert/uri/';
          xhr.open('POST', url, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.send("src="+escape(tab.url));
    animation.start();
};


function init() {

    var version = "1.7";
    //Show updated page first load
    if(localStorage.updatedToVersion && localStorage.updatedToVersion != version) {
        chrome.tabs.create( {url:"updated.html"} );
    }
    localStorage.updatedToVersion = version;
    

    image = document.getElementById("standard_icon")
    canvas = document.getElementById("canvas");
    canvasContext = canvas.getContext("2d");
    updateBadgeAndTitle();
    //findOutUserStatus();
}


chrome.browserAction.onClicked.addListener(function(tab) {
    createPdf(tab);
});

init();

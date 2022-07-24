"use strict";

// https://developer.chrome.com/docs/extensions/reference/action/
// https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/api/action/demo/index.js
// https://dev.to/anobjectisa/how-to-build-a-chrome-extension-new-manifest-v3-5edk

// TBD - dev.pdfcrowd.com -> pdfcrowd.com (tady a manifest)
// aby byla po installu defaultne pinned
// convCtx - timeout 1min na is runnin, pak set isRunning=False
// polish options page
// icon -> pdf
// context menu
// option to log in -> nejspis do options
// bug kdyz se to chvili necha stat tak background.js nedostava event
// non-instant mode - do not allow to convert page (about, chrome, local)

import {
    baseUrl, status, json,
    storageSet, storageGet
} from "./common.js";

var convCtx = new ConversionContext();
var loggedIn = false;
var restricted = false;
var resultCacheTimeout = 1000*60 * 5;
var conversionTimeout = 1000*63;

var apiUrls = {
    1: baseUrl + '/session/json/convert/uri/',
    2: baseUrl + '/session/json/convert/uri/v2/'
}

var apiVersionUrl = baseUrl + '/session/api-version/'




// ---------------------------------------------------------------------------

function ConversionContext() {
    this._isRunning = false;
    this.data = {};
    this.url = undefined;
}

ConversionContext.prototype.sendMessage = function(payload, url) {
    payload['url'] = url || this.url
    chrome.runtime.sendMessage(payload).catch(function() {
        // popup is closed
        // console.log('sendMessage failed');
    });
}


ConversionContext.prototype.saveData = function() {
    console.assert(!this._isRunning);
    if (this.url) {
        this.data['timestamp_saved'] = Date.now();
        var that = this;
        storageGet('result_cache', function(records) {
            var records = records || {};
            
            // remove expired cached entries
            let now = Date.now();
            for (let key in records) {
                if ((now-records[key].timestamp_saved) > resultCacheTimeout) {
                    console.log(`deleting expired ${key} from cache`);
                    delete records[key]
                }
            }

            // store to cache
            records[that.url] = that.data;
            storageSet('result_cache', records)
                .then(function() {
                    console.log(records);
                });
        });
    }
}

ConversionContext.prototype.start = function(url) {
    this._isRunning = true;
    updateBadge(this._isRunning);
    this.data = { 'timestamp_start': Date.now() }
    this.url = url;
    this.sendMessage({
        status: 'running'
    });
}


ConversionContext.prototype.canRun = function(url) {
    if (!this._isRunning) return true;

    // a conversion is running
    if (url == this.url)
    {
        let elapsed = Date.now() - this.data['timestamp_start']
        if (elapsed > conversionTimeout) {
            this.error("Conversion timeout");
        }
        
        this.sendConversionInfo();
    } else {
        // tbd send info, not error
        let payload = {
            status: "info",
            message: "Conversion is currently running in another tab.",
            can_retry: true,
        };
        this.sendMessage(payload, url);
    }
    
    return false;
}


ConversionContext.prototype.updateLicenseInfo = function(data) {
    this.sendMessage({
        status: 'license_info',
        data: data,
    });
    this.data['license_info'] = data;
}


ConversionContext.prototype.success = function(data) {
    this._isRunning = false;
    updateBadge(this._isRunning);
    this.sendMessage({
        status: 'success',
        data: data
    });
    this.data['success'] = data
    this.saveData();
}


ConversionContext.prototype.error = function(message, canRetry=true) {
    this._isRunning = false;
    updateBadge(this._isRunning);
    let payload = {
        status: "error",
        message: message,
        can_retry: canRetry,
    };
    this.sendMessage(payload);
    this.data['error'] = payload;
}


ConversionContext.prototype.sendConversionInfo = function() {
    console.assert(this._isRunning);
    this.sendMessage({
        status: 'running'
    });
    this.sendMessage({
        status: 'license_info',
        data: this.data['license_info'],
    });
}



// ---------------------------------------------------------------------------




function updateBadge(isRunning) {
    if (isRunning) {
        chrome.action.setBadgeText({text: 'C'});
        chrome.action.setBadgeBackgroundColor({color:"#ff0"});
    } else {
        chrome.action.setBadgeBackgroundColor({color:[0, 0, 0, 0]});
        chrome.action.setBadgeText({text: ''});
    }
}


function init() {
    // var version = "1.13";
    // //Show updated page first load
    // if(false && localStorage.updatedToVersion && localStorage.updatedToVersion != version) {
    //     chrome.tabs.create( {url:"updated.html"} );
    // }
    // localStorage.updatedToVersion = version;
}




async function createPdfEx(url, apiUrl) {
    return new Promise((resolve, reject) => {
        fetch(apiUrl, {
            method: 'post',
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "src=" + escape(url),
            credentials: 'include',
        })
            .then(json)
            .then(function(data) {
                if (data.status === 'ok') {
                    resolve(data)
	            } else if (data.status === 'error') {
                    reject(data.message)
                } else {
                    reject(`Unexpected status: ${data.status}.`)
                }
            })
            .catch(function(err) {
                reject(err.message)
            });        
    });
}




async function getUserInfo() {
    return new Promise((resolve, reject) => {
        fetch(apiVersionUrl)
            .then(status)
            .then(json)
            .then(function(data){
                resolve(data)
	        })
            .catch(function(err) {
                reject(err.message)
            });        
    });
}


function convertPage(url)
{
    convCtx.start(url);

    // fetch info about the user
    getUserInfo()
        .then((data) => {

            // determine the API version to use
            convCtx.updateLicenseInfo(data);
            var apiUrl = apiUrls[data.api_version];
            if (apiUrl === undefined) {
                apiUrl = apiUrls[2];
            }

            // convert to pdf
            createPdfEx(url, apiUrl)
                .then((data) => {
                    if (data.status === 'ok') {
                        convCtx.success(data)
	                } else if (data.status === 'error') {
                        convCtx.error(data.message)
                    } else {
                        convCtx.error(`Unexpected status: ${data.status}.`)
                    }
                })

                // pdf conversion error
                .catch((error) => {
                    convCtx.error(error);
                });
        })

        // user data fetch error
        .catch((error) => {
            convCtx.error(error);
        });
}




function getCached(url, callback) {
    storageGet('result_cache', function(result_cache) {
        if (result_cache) {
            var record = result_cache[url];
            if (record) {
                let elapsed = Date.now() - record.timestamp_saved;
                if (elapsed <= resultCacheTimeout) {
                    chrome.runtime.sendMessage({
                        status: 'cached_data',
                        data: record,
                        url: url,
                    });
                    callback(true);
                    return;
                } 
            }
        }
        callback(false);
    });
}



function convertUrl(url, force=false) {
    console.log(url);

    function tryConversion() {
        if (convCtx.canRun(url)) {
            convertPage(url);
        }
    }

    if (force) {
        tryConversion(url);
    } else {
        getCached(url, function(found) {
            if (!found) {
                tryConversion(url);
            }
        });
    }
}



// // ---------------------------------------------------------------------------
// //  listeners


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.message == 'convert_url') {
        convertUrl(request.url, request.force);
    }

    else if (request.message == 'fetch_from_cache') {
        getCached(request.url, function(isCached) {
            sendResponse({is_cached: isCached});
        });
        return true;
    }
});

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
    storageSet, storageGet,
    isFirefox, isManifestV2
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
const apiRoot = isFirefox ? 'browser' : 'chrome';




// ---------------------------------------------------------------------------

function ConversionContext() {
    this._isRunning = false;
    this.data = {};
    this.url = undefined;
}

ConversionContext.prototype.sendMessage = function(payload, url) {
    payload['url'] = url || this.url
    window[apiRoot].runtime.sendMessage(payload, (response) => {
        // prevents error message in the console
        chrome.runtime.lastError;
        // popup is closed
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
            storageSet('result_cache', records, () => {
                console.log(records);
            })
        });
    }
}

ConversionContext.prototype.removeFromCache = function(url) {
    storageGet('result_cache', function(records) {
        var records = records || {};
        delete records[url];
        storageSet('result_cache', records, () => {
            console.log(records);
        })
    });
}

ConversionContext.prototype.start = function(url) {
    this._isRunning = true;
    this.removeFromCache(url);
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

ConversionContext.prototype.isUrlRunning = function(url) {
    return this._isRunning && this.url===url;
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
    this.saveData();
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
    const action = isManifestV2 ? 'browserAction' : 'action';

    if (isRunning) {
        chrome[action].setBadgeText({text: '...'});
        chrome[action].setBadgeBackgroundColor({color:"#ff0"});
    } else {
        chrome[action].setBadgeBackgroundColor({color:[0, 0, 0, 0]});
        chrome[action].setBadgeText({text: ''});
    }

    console.log('badge')
}


function init() {
    // var version = "1.13";
    // //Show updated page first load
    // if(false && localStorage.updatedToVersion && localStorage.updatedToVersion != version) {
    //     chrome.tabs.create( {url:"updated.html"} );
    // }
    // localStorage.updatedToVersion = version;
}




function createPdfEx(ctx) {
    return new Promise((resolve, reject) => {
        fetch(ctx.apiUrl, {
            method: 'post',
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "src=" + escape(ctx.url),
            credentials: 'include',
        })
            .then(json)
            .then(function(data) {
                if (data.status === 'ok') {
                    data.ctx = ctx;
                    resolve(data);
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


function get_filename_from_url(url) {
    url = url.replace('#', '?').replace(/\:\d+/, '');
    url = url.split('?')[0];
    url = url.replace(/(\.html)?\/?$/i, '');
    name = url.replace(/^[^:]+:\/+([^\/]*?@)?/, '').replace(
        /[^\p{L}\p{N}]/gu, '_') + '.html';
    return name;
}


function createPdfFromContent(ctx) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        const blob = new Blob([ctx.content], {type: 'text/plain'});
        formData.append('src', blob, get_filename_from_url(ctx.url));
        formData.append('conversion_source', 'upload');
        formData.append('disable_javascript', '1');

        fetch(ctx.apiUrl, {
            method: 'post',
            body: formData,
            credentials: 'include',
        })
            .then(json)
            .then(function(data) {
                if (data.status === 'ok') {
                    delete ctx.content;
                    data.ctx = ctx;
                    resolve(data);
                } else if (data.status === 'error') {
                    reject(data.message)
                } else {
                    reject(`Unexpected status: ${data.status}.`)
                }
            })
            .catch(function(err) {
                console.log(err);
                reject(err.message)
            });
    });
}




function getUserInfo() {
    console.log('getUserInfo')
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


// define the content script to execute
const contentScript = function() {
    try {
        const dst_doc = document.implementation.createHTMLDocument("");
        const cloned = document.documentElement.cloneNode(true);
        dst_doc.documentElement.replaceWith(cloned);
        const head = dst_doc.head;

        // create a base element with the desired absolute URL
        let base = dst_doc.querySelector('base[href]');
        if(base) {
            // rewrite href, so it includes protocol too
            base.setAttribute('href', base.href);
        } else {
            base = dst_doc.createElement('base');
            const host = window.location.host;
            const protocol = window.location.protocol;
            base.href = protocol + '//' + host + '/';
            head.insertBefore(base, head.firstChild);
        }

        // // remove all scripts
        // let elements = dst_doc.getElementsByTagName('script');
        // for(let i = elements.length - 1; i >= 0; i--) {
        //     elements[i].remove();
        // }

        // remove all styles
        let elements = dst_doc.getElementsByTagName('style');
        for(let i = elements.length - 1; i >= 0; i--) {
            elements[i].remove();
        }

        // remove all noscript elements
        elements = dst_doc.getElementsByTagName('noscript');
        for(let i = elements.length - 1; i >= 0; i--) {
            elements[i].remove();
        }

        // preserve styles from src document
        const failed_styles = new Set();
        const styleSheets = document.styleSheets;
        for (var i = 0; i < styleSheets.length; i++) {
            var styleSheet = styleSheets[i];
            try {
                const rules = styleSheet.cssRules || styleSheet.rules;
                let styles = '';
                for(let j = 0; j < rules.length; j++) {
                    let rule = rules[j];
                    styles += rule.cssText;
                }

                if(styles) {
                    const style = dst_doc.createElement('style');
                    style.innerHTML = styles;
                    head.appendChild(style);
                }
            } catch(error) {
                failed_styles.add(styleSheet.href);
            }
        }

        const links = dst_doc.getElementsByTagName('link');
        for(let i = links.length - 1; i >= 0; i--) {
            const link = links[i];
            if(link.rel === 'stylesheet' || link.as === 'style') {
                if(!failed_styles.has(link.href)) {
                    link.remove();
                }
            }
        }

        // write input field values into element properties
        // so all values are stored in outerHTML
        const src_inputs = document.querySelectorAll('input, select, textarea');
        const dst_inputs = dst_doc.querySelectorAll('input, select, textarea');

        if(src_inputs.length === dst_inputs.length) {
            // Loop through all form elements
            for(let i = 0; i < src_inputs.length; i++) {
                const src_element = src_inputs[i];
                const dst_element = dst_inputs[i];
                if(src_element.type == 'checkbox' ||
                   src_element.type == 'radio') {
                    if(src_element.checked) {
                        dst_element.setAttribute('checked', 'checked');
                    } else {
                        dst_element.removeAttribute('checked');
                    }
                } else if(src_element.type == 'textarea') {
                    dst_element.innerHTML = src_element.value;
                } else if(src_element.tagName === 'SELECT') {
                    const src_options = src_element.querySelectorAll('option');
                    const dst_options = dst_element.querySelectorAll('option');
                    if(src_options.length === dst_options.length) {
                        for(let j = 0; j < src_options.length; j++) {
                            const src_option = src_options[j];
                            const dst_option = dst_options[j];
                            if(src_option.selected) {
                                dst_option.setAttribute('selected', 'selected');
                            } else {
                                dst_option.removeAttribute('selected');
                            }
                        }
                    }
                } else {
                    dst_element.setAttribute('value', src_element.value);
                }
            }
        }
        return dst_doc.documentElement.outerHTML;
    } catch(error) {
        console.error(`Pdfcrowd error: ${error}`);
        return '';
    }
}

function convertPageFn(ctx) {
    const fn = ctx.conversionMode === 'content'
          ? createPdfFromContent : createPdfEx;
    fn(ctx)
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
}

function convertPage(url, conversionMode, isAlternate)
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

            const ctx = {
                url: url,
                conversionMode: conversionMode,
                apiUrl: apiUrl,
                domain: new URL(url).hostname,
                isAlternate: isAlternate
            };

            // convertPageFn(ctx);

            if(conversionMode === 'content') {
                chrome.tabs.executeScript({
                    code: '(' + contentScript + ')();'
                }, function(content) {
                    if(!content[0]) {
                        convCtx.error('Internal error');
                    } else {
                        ctx.content = content;
                        convertPageFn(ctx);
                    }
                });
            } else {
                convertPageFn(ctx);
            }
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
                    window[apiRoot].runtime.sendMessage({
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



function convertUrl(url, conversionMode, isAlternate, force=false) {
    console.log(url);

    function tryConversion() {
        if (convCtx.canRun(url)) {
            convertPage(url, conversionMode, isAlternate);
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



window[apiRoot].runtime.onMessage.addListener((request, sender, sendResponse) => {

    try {
        if(request.message == 'convert_url') {
            convertUrl(request.url,
                       request.conversionMode,
                       request.isAlternate,
                       request.force);
        }

        else if (request.message == 'get_url_info') {
            let isUrlRunning = convCtx.isUrlRunning(request.url);
            getCached(request.url, function(isCached) {
                sendResponse({
                    is_cached: isCached,
                    is_url_running: isUrlRunning,
                });
            });
            return true;
        }
    } catch (exc) {
        !isFirefox || console.error(exc);
        throw exc;
    }
});

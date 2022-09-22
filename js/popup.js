"use strict";

import getOptions from './options.js';
import { show, hide, expandLinks, setHTML, isFirefox } from './common.js';

const apiRoot = isFirefox ? 'browser' : 'chrome';

function isUrlOk(url) {
    if (!url) return false;
    var rex = /^((?:chrome|file|chrome-extension|about|moz-extension|wyciwyg):.*$)/i;
    return rex.exec(url) ? false : true;
}


function getTab(callback) {
    let queryOptions = {
        active: true,
        currentWindow: true,
        //lastFocusedWindow: true
    };
    chrome.tabs.query(queryOptions, (tabs) => {
        callback(tabs[0]);
    });
}


const dateVars = {
    Y: (d) => { return d.getFullYear() },
    M: (d) => { return d.getMonth()+1 },
    D: (d) => { return d.getDate() },
    h: (d) => { return d.getHours() },
    m: (d) => { return d.getMinutes() },
    s: (d) => { return d.getSeconds() },
}

function expandDownloadPrefix(options) {
    let now = new Date()
    function expand(str) {
        return str.replaceAll(/\$[YMDhms]/g, (match) => {
            let val = dateVars[match[1]](now)
            return String(val).padStart(2, '0');
        });
    }
    
    let subdir = expand(options.downloadsSubfolder || '');
    let prefix = expand(options.filenamePrefix || '');

    let rv = subdir
        ? `${subdir}/${prefix}`
        : prefix;
    
    return rv;
}



window.addEventListener("load",function(event) {
    //console.log("popup opened");

    var thisUrl;
    var thisOptions;

    expandLinks();
    
    getTab((tab) => {
        thisUrl = tab.url;

        if (!isUrlOk(thisUrl)) {
            hideAll();
            show('.nothing-to-do');
            return;
        }
        
        getOptions((options) => {
            thisOptions = options;
            
            // instant conversion
            if (options.instantConversion) {
                chrome.runtime.sendMessage({
                        message: "convert_url",
                        url: thisUrl,
                });
            }
            
            // button or fetch from cache
            else
            {
                let payload = {
                    message: "get_url_info",
                    url: thisUrl,
                };
                chrome.runtime.sendMessage(payload, (response) => {
                    if (response) {
                        if (response.is_url_running) {
                            hideAll();
                            setInProgress(true);
                        } else if (!response.is_cached) {
                            hideAll();
                            show(".convert");
                        }
                    } else {
                        console.error(chrome.runtime.lastError);
                    }
                });
            }
        });

    });

    // refresh button
    document.querySelectorAll('.retry, .convert').forEach((item) => {
        item.addEventListener("click", function(event) {
            setRetry(false);
            event.preventDefault();
            chrome.runtime.sendMessage({
                message: "convert_url",
                url: thisUrl,
                force: true,
            });
        });
    });

    // options button
    document.querySelector('.settings').addEventListener("click", function(event) {
        event.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    // download button
    let downloadButton = document.querySelector(".download");
    downloadButton.addEventListener("click", (event) => {
        event.preventDefault();
        let prefix = expandDownloadPrefix(thisOptions);
        window[apiRoot].downloads.download({
            filename: prefix + downloadButton.getAttribute('data-filename'),
            url: downloadButton.getAttribute('data-url'),
            saveAs: false
        }, (downloadId) => {
            if (downloadId != undefined) {
                // OK
            } else {
                console.error("download failed"); // the message is in runtime.lastError
            }
        });
    });
    

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

        if (request.url && request.url != thisUrl) {
            return;
        }

        //document.querySelector(".message").textContent = `${response.status}: ${response.message}`;
        
        if (request.status == 'running') {
            hideAll();
            setInProgress(true);
        }

        else if (request.status == 'error') {
            hideAll();
            setError(request);
        }

        else if (request.status == 'success')
        {
            hideAll();
            setSuccess(request.data);
        }

        else if (request.status == 'info')
        {
            hideAll();
            document.querySelector(".info p").textContent = request.message;
            show(".info");
            setRetry(request.can_retry ? "Retry" : false);
        }

        else if (request.status == 'license_info')
        {
            setLicenseInfo(request.data);
        }

        else if (request.status == 'cached_data')
        {
            hideAll();
            var data = request.data;
            setLicenseInfo(data.license_info);
            setInProgress(false);
            setSuccess(data.success);
            setError(data.error);
        }

        
        else {
            //console.info("Unknown message")
        }
    });

    function hideAll() {
        let selector = ".in-progress, .success, .error, .info, .retry, .convert, .nothing-to-do";
        document.querySelectorAll(selector).forEach(function(item) {
            item.style.display = 'none';
        });
    }

    

    
    function setLicenseInfo(data) {
        if (data.license) {
            show('.lic-pro');
            hide('.lic-free');
        } else {
            show('.lic-free');
            hide('.lic-pro');
        }
    }

    
    function setError(data) {
        if (data) {
            setHTML(".error .message", data.message)
            show(".error");
            setRetry(data.can_retry ? "Retry" : false);
        } else {
            hide(".error");
        }
    }

    
    function setInProgress(val) {
        document.querySelector(".in-progress").style.display = val ? 'block' : 'none';
    }

    
    function setSuccess(data) {
        if (data) {
            //document.querySelector(".download").href = data.url;
            document.querySelector(".open").href = data.url_inline;
            document.querySelector(".download").setAttribute("data-filename", data.file_name);
            document.querySelector(".download").setAttribute("data-url", data.url);
            show(".success");
            setRetry("Refresh");
        } else {
            hide(".success");
        }
    }


    function setRetry(val) {
        document.querySelector(".retry").style.display = val ? 'inline-block' : 'none';
    }
});


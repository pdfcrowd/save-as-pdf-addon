"use strict";

import getOptions from './options.js';
import { show, hide, expandLinks, setHTML } from './common.js';

async function getTab() {
    let queryOptions = {
        active: true,
        currentWindow: true,
        //lastFocusedWindow: true
    };
    let tabs = await chrome.tabs.query(queryOptions);
    return tabs[0];
}


function isUrlOk(url) {
    if (!url) return false;
    var rex = /^((?:chrome|file|chrome-extension|about|moz-extension|wyciwyg):.*$)/i;
    return rex.exec(url) ? false : true;
}




window.addEventListener("load",function(event) {
    console.log("popup opened");

    var thisUrl;
    var thisOptions;

    expandLinks();
    
    getTab().then(tab => {
        thisUrl = tab.url;

        if (!isUrlOk(thisUrl)) {
            hideAll();
            setError({
                status: "error",
                message: "This page can't be converted.",
                can_retry: false,
            });
            
            // chrome.runtime.sendMessage({
            //     status: "error",
            //     message: "1Can't convert this page.",
            //     can_retry: false,
            // });
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
                    message: "fetch_from_cache",
                    url: thisUrl,
                };
                chrome.runtime.sendMessage(payload, (response) => {
                    if (!response.is_cached) {
                        hideAll();
                        show(".convert");
                    }
                });
            }
        });

    });

    // refresh button
    document.querySelectorAll('.retry, .convert').forEach((item) => {
        item.addEventListener("click", function(event) {
            console.log('clicked');
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

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log(request);

        if (request.url && request.url != thisUrl) {
            console.log(`popup ${thisUrl} ignores ${request.url}`);
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
            console.log(request.data);
            var data = request.data;
            setLicenseInfo(data.license_info);
            setInProgress(false);
            setSuccess(data.success);
            setError(data.error);
        }

        
        else {
            console.info("Unknown message")
        }
    });

    function hideAll() {
        let selector = ".in-progress, .success, .error, .info, .retry, .convert";
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
            document.querySelector(".download").href = data.url;
            document.querySelector(".open").href = data.url_inline;
            show(".success");
            setRetry("Refresh");
        } else {
            hide(".success");
        }
    }


    function setRetry(val) {
        document.querySelector(".retry").title = val
        document.querySelector(".retry").style.display = val ? 'inline-block' : 'none';
    }
});


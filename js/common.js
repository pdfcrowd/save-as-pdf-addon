
const manifestData = chrome.runtime.getManifest();

export const isManifestV2 = manifestData.manifest_version == 2;
export const isFirefox = navigator.userAgent.indexOf("Chrome") == -1

export const baseUrl = (isManifestV2
                        ? manifestData.permissions[0]
                        : manifestData.host_permissions[0]).replace(/\/+$/, '');

if (!baseUrl.startsWith('https://')) {
    throw("The server URL must be the first item in the permissions or host_permissions array")
}

const linkLogIn = baseUrl + '/user/sign_in/?ref=plugin'
const linkBuyLicense = baseUrl + '/pricing/license/?ref=plugin'
const linkConversionSettings = baseUrl + '/html-to-pdf/?ref=plugin#convert_by_url+with_options'
const linkPluginHome = baseUrl + '/save-as-pdf-addon/?ref=plugin'
const linkHtmlToPdfApi = baseUrl + '/api/html-to-pdf-api/?ref=plugin'
const linkSaveAsPdfWP = baseUrl + '/save-as-pdf-wordpress-plugin/?ref=plugin'
const linkSaveChatGPTasPDF = baseUrl + '/save-chatgpt-as-pdf/'
const linkAccountLicense = baseUrl + '/user/account/browser-license/?ref=plugin'

const linkToCssMapping = {
    '.link-log-in': linkLogIn,
    '.link-buy-license': linkBuyLicense,
    '.link-conversion-settings': linkConversionSettings,
    '.link-plugin-home': linkPluginHome,
    '.link-html-to-pdf-api': linkHtmlToPdfApi,
    '.link-save-as-pdf-wp': linkSaveAsPdfWP,
    '.link-account-license': linkAccountLicense,
    '.link-save-chat-gpt-as-pdf': linkSaveChatGPTasPDF,
};


export function expandLinks(onClick, options) {
    options = Object.assign({
        blankTarget: true
    }, options||{});
    for (let selector in linkToCssMapping) {
        document.querySelectorAll(selector).forEach(function(item) {
            item.setAttribute('href', linkToCssMapping[selector]);
            
            if (options.blankTarget) {
                item.setAttribute('target', "_blank");
            }

            if (onClick) {
                item.addEventListener("click", function(event) {
                    onClick(event);
                });
            }
        });
    }
}





// ---------------------------------------------------------------------------
// fetch promise helpers

export function status(response, errorMessage) {
    if (response.status >= 200 && response.status < 300) {
        return Promise.resolve(response);
    } else {
        return Promise.reject(new Error(errorMessage || "An error occurred.<br>Please try again later."));
    }
}


export function json(response) {
    return response.json();
}





// ---------------------------------------------------------------------------
// DOM manipulation helpers

export function show(selector, display) {
    display = display || "block";
    document.querySelectorAll(selector).forEach(function(item) {
        item.style.display = display;
    });
}

export function hide(selector) {
    document.querySelectorAll(selector).forEach(function(item) {
        item.style.display = 'none';
    });
}

export function setText(selector, text) {
    document.querySelector(selector).textContent = text;
}

export function setHTML(selector, html) {
    document.querySelector(selector).innerHTML = html;
}




// ---------------------------------------------------------------------------
//  local storage

export function storageSet(key, value, callback) {
    let obj = {}
    obj[key] = value;
    chrome.storage.local.set(obj, function() {
        if (callback) {
            callback(key, value)
        }
    });
}

export function storageGet(key, callback) {
    chrome.storage.local.get(key, function(obj) {
        let val = obj[key];
        callback(val);
    });
}








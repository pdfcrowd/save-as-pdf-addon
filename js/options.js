"use strict";

import {
    baseUrl, status, json,
    show, hide, setText, setHTML,
    expandLinks,
    storageSet, storageGet,
} from "./common.js";


const sessionInfoUrl = baseUrl + '/session/info/'

let defaultOptions = {
    instantConversion: false,
    downloadsSubfolder: "",
    filenamePrefix: "",
}


// load options from storage
function getOptions(callback) {
    storageGet('options', (saved) => {
        let rv = {};
        Object.assign(rv, defaultOptions);
        if (saved) {
            Object.assign(rv, saved);
        }
        callback(rv);
    });
}

function saveOptions(options) {
    ['downloadsSubfolder', 'filenamePrefix'].forEach((item) => {
        let val = options[item] || "";
        val = val.replace(/^\.+/, '');
        val = val.replace(/^\/+/, '');
        val = val.replaceAll(/[^0-9a-z_ $-]/ig, '');
        options[item] = val;
    });
    storageSet("options", options);
    return options;
}


const sessionInfoTimeout = 1000*10; // session info cache expiration
function fetchSessionInfo(callback) {
    
    let now = Date.now()
    storageGet('session_info', function(cached) {

        if (cached && (now-cached.timestamp)<=sessionInfoTimeout) {
            callback(undefined, cached.data);
            return;
        }

        fetch(sessionInfoUrl)
            .then((resp) => { return status(resp, "The information is not available at the moment.<br>Please try again later."); })
            .then(json)
            .then(function(data){
                storageSet('session_info', {data: data, timestamp: now});
                callback(undefined, data);
	        })
            .catch(function(err) {
                callback(err);
            });        
    });
}


function initForm(options) {
    function init(options) {
        document.querySelectorAll('form .option').forEach(function(item) {
            let val = options[item.name];
            if (item.type == "checkbox") {
                item.checked = val ? true : false
            } else {
                item.value = val;
            }
        });
    }

    if (options) {
        init(options)
    } else {    
        getOptions(function(options) {
            init(options);
        });
    }
        

}



window.addEventListener("load",function(event) {
    
    expandLinks();

    // quit if the script was not loaded by options.html
    let saveButton = document.querySelector('button.save');
    if (!saveButton)
        return;
    
    initForm();
 
    // save options button handler
    saveButton.addEventListener("click", function(event) {
        event.preventDefault();
        saveButton.disabled = true;
        
        let options = {};
        document.querySelectorAll('form .option').forEach((item) => {
            if (item.type == "checkbox") {
                options[item.name] = item.checked;
            } else {
                options[item.name] = item.value;
            }
        });
        let saved = saveOptions(options);
        initForm(saved);
        //window.close();
    });

    // help toggle
    document.querySelector('.toggle-help').addEventListener("click", (event) => {
        event.preventDefault();
        document.querySelectorAll('.help-row').forEach((item) => {
            let isVisible = getComputedStyle(item)['display'] != 'none';
            item.style.display = isVisible ? "none" : "table-row";
        });
    });

    document.querySelectorAll('form.options input').forEach((item) => {
        item.addEventListener("change", (event) => {
            saveButton.disabled = false;
        });
        item.addEventListener("input", (event) => {
            saveButton.disabled = false;
        });
        
    });


    // fetch license info
    showError();
    fetchSessionInfo((err, data) => {
        hide(".in-progress");
        if (data) {
            showLicenseInfo(data);
            showError();
        } else {
            showLicenseInfo();
            showError(err.message);
        }
    });


    // debug
    document.querySelector(".lic-refresh").addEventListener("click", function(event) {
        event.preventDefault();
        fetchSessionInfo((err, data) => {});    
    });
    


});

function showLicenseInfo(data) {
    if (data) {
        hide('.lic-info > div');
        if (!data.username) {
            show('.not-logged-in');
        } else {
            show('.logged-in');
            setText(".username", data.username);
            if (data.license) {
                let now = Date.now()
                let expires = parseInt(data.expires)
                let expires_in = Math.floor((expires-now) / 1000 / 60 / 60 / 24);
                let expires_in_str;
                if (expires_in < 1) {
                    expires_in_str = "less than one day";
                } else if (expires_in < 2) {
                    expires_in_str = "1 day";
                } else {
                    expires_in_str = `${expires_in} days`;
                }

                if (expires_in < 7) {
                    show('span.is-time-to-renew', 'inline')
                }

                setText(".expires-in", `in ${expires_in_str}`);
            }
        }
        
        if (!data.license) {
            show('.lic-not-active');
            show('span.lic-not-active', 'inline');
            hide('.lic-active');
        } else {
            hide('.lic-not-active');
            show('span.lic-active', 'inline');
            show('.lic-active');
            show('tr.lic-active', 'table-row');
        }
        show('.lic-info');
    } else {
        hide('.lic-info');
    }
}

function showError(err) {
    if (err) {
        setHTML('.error', err);
        show('.error');
    } else {
        hide('.error');
    }
}


export { getOptions as default };

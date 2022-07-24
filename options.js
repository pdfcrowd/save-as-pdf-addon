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
}


function getOptions(callback) {
    storageGet('options', (item) => {
        callback(item || defaultOptions);
    });
}


const sessionInfoTimeout = 1000*10; // session info cache expiration
function fetchSessionInfo(callback) {
    
    let now = Date.now()
    storageGet('session_info', function(cached) {

        console.log(cached);
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


function initForm() {
    getOptions(function(options) {
        document.querySelectorAll('form .option').forEach(function(item) {
            if (item.type == "checkbox") {
                item.checked = options[item.name] ? true : false
            } else {
                item.value = options[item.name];
            }
        });
    });

}



window.addEventListener("load",function(event) {
    
    expandLinks((onClickEvent) => {
        window.close();
    });

    // quit if the script was not loaded by options.html
    let saveButton = document.querySelector('button.save');
    if (!saveButton)
        return;
    
    initForm();
 
    // save button handler to save the options
    saveButton.addEventListener("click", function(event) {
        event.preventDefault();

        let options = {};
        document.querySelectorAll('form .option').forEach(function(item) {
            if (item.type == "checkbox") {
                options[item.name] = item.checked;
            } else {
                options[item.name] = item.value;
            }
        });
        
        //console.log(options);
        storageSet("options", options);

        window.close();
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
    

    // fetch


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

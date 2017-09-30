#!/bin/bash

SDIR=/tmp/addon-secrets/

if [ "$1" == 'encrypt' ] ; then
    rm -f secrets.7z
    7z a secrets.7z ../save-as-pdf-addon.pem -p
elif [ "$1" == 'decrypt' ] ; then
    7z x secrets.7z
    mv save-as-pdf-addon.pem ./../
    echo "extracted to ./../save-as-pdf-addon.pem"
else
    >&2 echo "Usage: $0 <encrypt,decrypt>"
fi

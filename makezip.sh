#!/bin/bash

set -e

ZIP_FILE=save-as-pdf.zip

find . -type f ! -path './.git*' ! -name '*~' ! -name '*.zip' | zip $ZIP_FILE -@
unzip -t $ZIP_FILE
help:
	cat makefile

build: check-version build-firefox build-chrome 
	true

check-version:
	@tools/check-version.sh

build-firefox: copyfiles
	rm -rf $(CURDIR)/save-as-pdf-firefox.zip
	cp manifest_firefox.json /tmp/save-as-pdf-addon/manifest.json
	cd /tmp/save-as-pdf-addon/ && zip -r $(CURDIR)/save-as-pdf-firefox.zip .

build-chrome: copyfiles
	rm -rf $(CURDIR)/save-as-pdf-chrome.zip
	cp manifest_chrome.json /tmp/save-as-pdf-addon/manifest.json
	cd /tmp/save-as-pdf-addon/ && zip -r $(CURDIR)/save-as-pdf-chrome.zip .

copyfiles:
	rm -rf /tmp/save-as-pdf-addon/
	mkdir /tmp/save-as-pdf-addon/
	rsync -q -av --exclude-from=exclude.txt . /tmp/save-as-pdf-addon/

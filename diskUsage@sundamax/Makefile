# Disk Usage Desklet - build and install

LOCALE_DIR = $(HOME)/.local/share/locale
DESKLET_DIR = $(HOME)/.local/share/cinnamon/desklets/diskUsage@sundamax
UUID = diskUsage@sundamax

.PHONY: locale install

locale:
	msgfmt -o po/uk.mo po/uk.po
	mkdir -p $(LOCALE_DIR)/uk/LC_MESSAGES
	cp po/uk.mo $(LOCALE_DIR)/uk/LC_MESSAGES/$(UUID).mo

install: locale
	mkdir -p $(DESKLET_DIR)
	cp desklet.js metadata.json settings-schema.json stylesheet.css icon.png $(DESKLET_DIR)/
	cp -r po $(DESKLET_DIR)/
	@echo "Desklet installed. Add via: Right-click desktop -> Add Desklets"

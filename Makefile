TARGET := iphone:clang:latest:16.0
ARCHS  := arm64

# Plain dylib, NO CydiaSubstrate — loads on sideload / TrollStore / jailbreak.
THEOS_PACKAGE_SCHEME := rootless

include $(THEOS)/makefiles/common.mk

LIBRARY_NAME := libayCORD
libayCORD_FILES := Sources/ayCORD/Loader.m
libayCORD_CFLAGS := -fobjc-arc -Wno-deprecated-declarations
libayCORD_FRAMEWORKS := Foundation UIKit
libayCORD_INSTALL_PATH := /Library/MobileSubstrate/DynamicLibraries

include $(THEOS_MAKE_PATH)/library.mk

# Rebuild the JS payload before compiling the dylib.
before-all::
	@echo "[ayCORD] building JS payload..."
	@cd js && npm run build --silent || echo "[ayCORD] WARN: js build skipped (run 'cd js && npm i' first)"

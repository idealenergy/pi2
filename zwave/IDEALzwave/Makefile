#
# Makefile for OpenzWave Control Panel application
# Greg Satz

# GNU make only

.SUFFIXES:	.cpp .o .a .s

CC     := $(CROSS_COMPILE)gcc
CXX    := $(CROSS_COMPILE)g++
LD     := $(CROSS_COMPILE)g++
AR     := $(CROSS_COMPILE)ar rc
RANLIB := $(CROSS_COMPILE)ranlib

# DEBUG_CFLAGS    := -Wall -Wno-unknown-pragmas -Wno-inline -Werror -Wno-format -g -DDEBUG -ggdb -O0
# RELEASE_CFLAGS  := -Wall -Wno-unknown-pragmas -Werror -Wno-format -O3 -DNDEBUG
DEBUG_CFLAGS    := -Wall -Wno-unknown-pragmas -Wno-inline -Wno-format -g -DDEBUG -ggdb -O0 -std=c++14
RELEASE_CFLAGS  := -Wall -Wno-unknown-pragmas -Wno-format -O3 -DNDEBUG -std=c++14

DEBUG_LDFLAGS	:= -g

# Change for DEBUG or RELEASE
CFLAGS	:= -c $(DEBUG_CFLAGS)
LDFLAGS	:= $(DEBUG_LDFLAGS)

OPENZWAVE := ../open-zwave-master
JSONCPP := .
# LIBMICROHTTPD := -lmicrohttpd

INCLUDES := -I $(OPENZWAVE)/cpp/src -I $(OPENZWAVE)/cpp/src/command_classes/ \
	-I $(OPENZWAVE)/cpp/src/value_classes/ -I $(OPENZWAVE)/cpp/src/platform/ \
	-I $(OPENZWAVE)/cpp/src/platform/unix -I $(OPENZWAVE)/cpp/tinyxml/ \
	-I $(JSONCPP)/include
# 	-I ../libmicrohttpd/src/include

# Remove comment below for gnutls support
# GNUTLS := -lgnutls

# for Linux uncomment out next three lines
LIBZWAVE := $(wildcard $(OPENZWAVE)/*.a)
LIBUSB := -ludev
# LIBS := $(LIBZWAVE) $(GNUTLS) $(LIBMICROHTTPD) -pthread $(LIBUSB)
LIBS := $(LIBZWAVE) $(GNUTLS) -pthread $(LIBUSB)

# for Mac OS X comment out above 2 lines and uncomment next 5 lines
# ARCH := -arch i386 -arch x86_64
# ARCH := -arch x86_64
# CFLAGS += $(ARCH)
# LIBZWAVE := $(wildcard $(OPENZWAVE)/cpp/lib/mac/*.a)
# LIBUSB := -framework IOKit -framework CoreFoundation
# LIBS := $(LIBZWAVE) $(GNUTLS) $(LIBMICROHTTPD) -pthread $(LIBUSB) $(ARCH)
# LIBS := $(LIBZWAVE) $(GNUTLS) -pthread $(LIBUSB) $(ARCH)

%.o : %.cpp
	$(CXX) $(CFLAGS) $(INCLUDES) -o $@ $<

%.o : %.c
	$(CC) $(CFLAGS) $(INCLUDES) -o $@ $<

# all: defs ozwcp
all: defs idealoz


defs:
ifeq ($(LIBZWAVE),)
	@echo Please edit the Makefile to avoid this error message.
	@exit 1
endif

jsoncpp.o: $(JSONCPP)/json/json.h $(JSONCPP)/json/json-forwards.h

idealoz.o: idealoz.h $(OPENZWAVE)/cpp/src/Options.h $(OPENZWAVE)/cpp/src/Manager.h \
	$(OPENZWAVE)/cpp/src/Node.h $(OPENZWAVE)/cpp/src/Group.h \
	$(OPENZWAVE)/cpp/src/Notification.h $(OPENZWAVE)/cpp/src/platform/Log.h

idealoz: idealoz.o zwavelib.o jsoncpp.o $(LIBZWAVE)
	$(LD) -o $@ $(LDFLAGS) idealoz.o zwavelib.o jsoncpp.o $(LIBS)

# dist:	ozwcp
# 	rm -f ozwcp.tar.gz
# 	tar -c --exclude=".svn" -hvzf ozwcp.tar.gz ozwcp config/ cp.html cp.js openzwavetinyicon.png README

dist:	idealoz
	rm -f idealoz.tar.gz
	tar -c --exclude=".svn" -hvzf idealoz.tar.gz idealoz config/ cp.html cp.js openzwavetinyicon.png README

# clean:
# 	rm -f ozwcp *.o
clean:
	rm -f idealoz *.o

PATH := ./node_modules/.bin/:$(PATH)

all: build

clean:
	rm -rf dist/

run:
	@echo ">> To compile the ReScript run in another shell 'make rescript'"
	@echo
	esbuild lib/js/src/examples/index.js --bundle --outdir=www/js --servedir=www --serve=1234

rescript:
	rescript build -w

build: install
	rescript build
	esbuild lib/js/src/examples/index.js --bundle --outdir=www/js

install:
	yarn install

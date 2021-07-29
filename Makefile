PATH := ./node_modules/.bin/:$(PATH)

all: build

clean:
	rm -rf dist/
	touch package.json

run:
	@echo ">> To compile the ReScript run in another shell 'make rescript'"
	@echo
	esbuild lib/js/src/examples/index.js --bundle --outdir=www/js --servedir=www --serve=1234

compile: install
	rescript build

keep-compiling: install
	rescript build -w

build: install compile
	cp src/transaction.js lib/js/src/

install: package.json bsconfig.json
	yarn install

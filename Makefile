PATH := ./node_modules/.bin/:$(PATH)

all: build

clean:
	rm -rf lib/
	touch package.json

test: compile
	@echo ">> To compile the ReScript run in another shell 'make rescript'"
	@echo
	esbuild lib/js/tests/index.js --bundle --outdir=www --servedir=www --serve=1234

compile: install
	rescript build

keep-compiling: install
	rescript build -w

install: package.json bsconfig.json
	yarn install

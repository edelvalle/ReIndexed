
all: build

clean:
	rm -rf dist/

run:
	@echo ">> To compile the ReScript run in another shell 'make rescript'"
	@echo
	esbuild lib/js/src/index.js --bundle --outdir=www/js --servedir=www --serve=1234

rescript:
	rescript build -w

build:
	rescript build
	esbuild lib/js/src/index.js --build --outdir=www/js

install:
	yarn install



clean:
	rm -rf dist/

run:
	esbuild lib/js/src/index.js --bundle --outdir=www/js --servedir=www --serve=1234

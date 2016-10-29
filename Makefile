ESLINT = node_modules/.bin/eslint --config node_modules/sanctuary-style/eslint-es6.json --env es6
ISTANBUL = node_modules/.bin/istanbul
NPM = npm

SRC = $(.)
TEST = $(shell find test -name '*.js' | sort)


.PHONY: all
all: LICENSE

.PHONY: LICENSE
LICENSE:
	cp -- '$@' '$@.orig'
	sed 's/Copyright (c) .* Sanctuary/Copyright (c) $(shell git log --date=format:%Y --pretty=format:%ad | sort -r | head -n 1) Sanctuary/' '$@.orig' >'$@'
	rm -- '$@.orig'


.PHONY: lint
lint:
	$(ESLINT) --env node index.js test/test.js


.PHONY: setup
setup:
	$(NPM) install


.PHONY: test
test:
	$(ISTANBUL) cover "test/test.js" -- --recursive
	$(ISTANBUL) check-coverage --branches 98

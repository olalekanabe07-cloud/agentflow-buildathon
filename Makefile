.PHONY: install dev build test check run

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm test

check:
	npm run check

run:
	npm start

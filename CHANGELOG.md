# [2.0.0](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.5.0...v2.0.0) (2025-03-11)


* feat!: replace node-fetch with native fetch (#15) ([a0db863](https://github.com/soliantconsulting/fm-data-api-client/commit/a0db863e8e893def866839cf1800b480ec4c49c1)), closes [#15](https://github.com/soliantconsulting/fm-data-api-client/issues/15)


### BREAKING CHANGES

* requires node 18. The type for ContainerDownload.buffer has changed

# [1.5.0](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.4.0...v1.5.0) (2025-01-16)


### Features

* include dataInfo in find responses ([27817b9](https://github.com/soliantconsulting/fm-data-api-client/commit/27817b9d41c778386ef3603d64252a608919cbe5))

# [1.4.0](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.3.1...v1.4.0) (2024-05-31)


### Features

* **Client:** add client.requestContainer to download secure containers ([d67d967](https://github.com/soliantconsulting/fm-data-api-client/commit/d67d9677eaae46d88b1146689782fc38b3cff08c))
* **Layout:** add executeScript to layout ([5c729a4](https://github.com/soliantconsulting/fm-data-api-client/commit/5c729a4ac8e17b4451e5bfdb02a4952f02f8b0bd))

## [1.3.1](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.3.0...v1.3.1) (2024-05-03)


### Bug Fixes

* **Layout:** convert boolean true/false for omits to string ([#12](https://github.com/soliantconsulting/fm-data-api-client/issues/12)) ([89c9f3f](https://github.com/soliantconsulting/fm-data-api-client/commit/89c9f3ff5969178e729b98284d034fe75bda0892))

# [1.3.0](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.2.2...v1.3.0) (2022-08-17)


### Features

* add ESM support ([8483860](https://github.com/soliantconsulting/fm-data-api-client/commit/84838604099db5a2f31f991b88545bb2694999db))

## [1.2.2](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.2.1...v1.2.2) (2022-07-08)


### Bug Fixes

* **Layout:** fix type of GenericPortalData ([4c7fc00](https://github.com/soliantconsulting/fm-data-api-client/commit/4c7fc0086cbfe50c89679c12c3a62e615d5e090c))

## [1.2.1](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.2.0...v1.2.1) (2022-04-17)


### Bug Fixes

* **Client:** retry once with new token if FileMaker reporst invalid token ([ef9b348](https://github.com/soliantconsulting/fm-data-api-client/commit/ef9b348ab7273e4c7a7b60840bb4a141d1557b43))

# [1.2.0](https://github.com/soliantconsulting/fm-data-api-client/compare/v1.1.1...v1.2.0) (2022-04-17)


### Features

* **dependencies:** make node-fetch a standard dependency ([e5631c2](https://github.com/soliantconsulting/fm-data-api-client/commit/e5631c296eb1c431047f2e734778a2e9d1fcdb23))

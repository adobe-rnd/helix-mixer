# [1.4.0](https://github.com/adobe-rnd/helix-mixer/compare/v1.3.2...v1.4.0) (2025-11-14)


### Bug Fixes

* **ci:** resolve helix-deploy peer conflict (use helix-deploy ^13, plugin-edge ^1.1.6, add plugin-webpack) ([f31120a](https://github.com/adobe-rnd/helix-mixer/commit/f31120af8e93eb9b614893ed89c8778e77dc8a70))
* **dns:** use dynamic backends ([0c6d4fb](https://github.com/adobe-rnd/helix-mixer/commit/0c6d4fb4fbb526aaba9c26cccdf0e0ce0693475d))
* exclude compression tests from main test suite ([3352a3c](https://github.com/adobe-rnd/helix-mixer/commit/3352a3c9928a955bf5590ade33aa4f3b1aa6abba))
* handle Node.js fetch auto-decompression in compression tests ([97d9906](https://github.com/adobe-rnd/helix-mixer/commit/97d9906a58e4bb6973450bb111031d49980e8678))
* **index:** remove debug logging that may interfere with edge runtime ([7b094f1](https://github.com/adobe-rnd/helix-mixer/commit/7b094f1cfc32f27ad7aa8b2b5f0c673a4d419f41))
* **post-deploy:** distinguish between release and ci ([cc4854e](https://github.com/adobe-rnd/helix-mixer/commit/cc4854e0060fec659e0c46aaf7217cf7397e2090))
* prevent brotli cache poisoning by excluding it globally ([b6b8c3a](https://github.com/adobe-rnd/helix-mixer/commit/b6b8c3a0150e92c8a103728d51e75b088ff81de4))
* prevent brotli encoding issues on Fastly runtime ([b5d12bf](https://github.com/adobe-rnd/helix-mixer/commit/b5d12bfba0876b7d797d07c8ef708f3283ab8d26))
* remove manual compression in favor of CDN transparent compression ([402a1ed](https://github.com/adobe-rnd/helix-mixer/commit/402a1ed94046b74e94326960a29ba122f7eb1014))
* resolve body already read error in compression tests ([5651767](https://github.com/adobe-rnd/helix-mixer/commit/56517676324d50d1260f6f9a630a5817bc2fb10f))
* simplify compression tests and fix recompression logic ([dfc6bb9](https://github.com/adobe-rnd/helix-mixer/commit/dfc6bb97c2aedd25ff2b4fdead46d4021a897e2f))
* **test:** remove flaky x-error header assertion in post-deploy test ([3ef3765](https://github.com/adobe-rnd/helix-mixer/commit/3ef3765fda99cf3a5ca063c08f5cda1b5ed38809))
* tweaks ([45f5a24](https://github.com/adobe-rnd/helix-mixer/commit/45f5a24dcc435da54675a1a2839c42be6b4f3c85))


### Features

* add compression ratio verification to tests ([b47f6cb](https://github.com/adobe-rnd/helix-mixer/commit/b47f6cbdef976e749b30647b556f2480120f341c))
* add proper decompression support for compressed responses ([42374e7](https://github.com/adobe-rnd/helix-mixer/commit/42374e7a1054eb881ea29bc49969af142429f62c))
* add response recompression after HTML inlining ([8e04fdc](https://github.com/adobe-rnd/helix-mixer/commit/8e04fdcae68f65f8ca5d17c2002e1ab0d1552d56))
* add x-compress-hint header for Fastly transparent compression ([26cfafd](https://github.com/adobe-rnd/helix-mixer/commit/26cfafd5f308ca470f1944a671a77a2eadaaed00))
* **dns:** allow specifying dns provider ([c78a0fb](https://github.com/adobe-rnd/helix-mixer/commit/c78a0fb3b7698c1c583516cf78d54bea2299947d))
* **index:** allow overriding the effective domain using ([3c05f33](https://github.com/adobe-rnd/helix-mixer/commit/3c05f336f4044f4ea7ecdfd45b6e208041a06e9d))

## [1.3.2](https://github.com/adobe-rnd/helix-mixer/compare/v1.3.1...v1.3.2) (2025-11-10)


### Bug Fixes

* minor tweak and tests ([fe6bd3b](https://github.com/adobe-rnd/helix-mixer/commit/fe6bd3b248856aa6921647b48d0f95e5357681a7))

## [1.3.1](https://github.com/adobe-rnd/helix-mixer/compare/v1.3.0...v1.3.1) (2025-11-10)


### Bug Fixes

* handle more cache keys ([2a41192](https://github.com/adobe-rnd/helix-mixer/commit/2a411925bb7661e4aaf77b0e47c7cc2bc7f70c3a))

# [1.3.0](https://github.com/adobe-rnd/helix-mixer/compare/v1.2.3...v1.3.0) (2025-11-07)


### Bug Fixes

* indentation, minor tweaks ([ccb570b](https://github.com/adobe-rnd/helix-mixer/commit/ccb570b094c78798340b5ee71fcdf6ba47ff831d))


### Features

* inline nav/footer ([d6d4ffd](https://github.com/adobe-rnd/helix-mixer/commit/d6d4ffdd3858002e9d5a263eda3ef39d9c1617fe))

## [1.2.3](https://github.com/adobe-rnd/helix-mixer/compare/v1.2.2...v1.2.3) (2025-10-01)


### Bug Fixes

* change path to pathprefix ([#30](https://github.com/adobe-rnd/helix-mixer/issues/30)) ([390d8ef](https://github.com/adobe-rnd/helix-mixer/commit/390d8efe2662f249fb03abab004a3b1e8d63b98f))

## [1.2.2](https://github.com/adobe-rnd/helix-mixer/compare/v1.2.1...v1.2.2) (2025-09-09)


### Bug Fixes

* update config tests to work in CI environment ([5c30a49](https://github.com/adobe-rnd/helix-mixer/commit/5c30a498b7884f618f9813ec544e55d88b5fec62))

## [1.2.1](https://github.com/adobe-rnd/helix-mixer/compare/v1.2.0...v1.2.1) (2025-09-04)


### Bug Fixes

* force deploy ([779a5f6](https://github.com/adobe-rnd/helix-mixer/commit/779a5f6a6a73f50554022ecb8973f28d5397b312))

# [1.2.0](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.20...v1.2.0) (2025-09-04)


### Features

* add isCustomDomain utility function with tests ([20b5531](https://github.com/adobe-rnd/helix-mixer/commit/20b5531a335b26b7b102a057b85746ef54ad630e))
* add resolveCustomDomain function with DNS lookup ([784cbf7](https://github.com/adobe-rnd/helix-mixer/commit/784cbf782db9e3908b07784e71bf0edfbb48fde6))

## [1.1.20](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.19...v1.1.20) (2025-07-31)


### Bug Fixes

* use aem.live for config, upgrade deps ([#25](https://github.com/adobe-rnd/helix-mixer/issues/25)) ([61b7909](https://github.com/adobe-rnd/helix-mixer/commit/61b7909bf8fd141a372ad252246a150919a95f5f))

## [1.1.19](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.18...v1.1.19) (2025-07-31)


### Bug Fixes

* log error, cleanup ([#24](https://github.com/adobe-rnd/helix-mixer/issues/24)) ([d5d30b1](https://github.com/adobe-rnd/helix-mixer/commit/d5d30b1d6e78203de9e12e1f8923b6ef2d1ee491))

## [1.1.18](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.17...v1.1.18) (2025-07-10)


### Bug Fixes

* re-add no caching object ([#23](https://github.com/adobe-rnd/helix-mixer/issues/23)) ([1fa4548](https://github.com/adobe-rnd/helix-mixer/commit/1fa4548e4f0e88173f004643f03c77d74f450a92))

## [1.1.17](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.16...v1.1.17) (2025-07-10)


### Bug Fixes

* remove cf object from be fetch ([25a44d7](https://github.com/adobe-rnd/helix-mixer/commit/25a44d788a97b50a779cf4c324ea454a75f5aa4d))

## [1.1.16](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.15...v1.1.16) (2025-07-09)


### Bug Fixes

* logging tweak ([866e99d](https://github.com/adobe-rnd/helix-mixer/commit/866e99d27056583625ae653f788e9576268fba0f))

## [1.1.15](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.14...v1.1.15) (2025-07-09)


### Bug Fixes

* tweak logging ([0ca09ec](https://github.com/adobe-rnd/helix-mixer/commit/0ca09ec8b5a224eb18e31e057dbd95d3129551a4))

## [1.1.14](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.13...v1.1.14) (2025-07-09)


### Bug Fixes

* enable 10% logging ([df09629](https://github.com/adobe-rnd/helix-mixer/commit/df096296f5cfa4e720f018503ea6eeb1e96faa08))

## [1.1.13](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.12...v1.1.13) (2025-07-07)


### Bug Fixes

* manual redirects ([d953e65](https://github.com/adobe-rnd/helix-mixer/commit/d953e65c5a4fab2b549ca8655e4eed6b4a2f308d))

## [1.1.12](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.11...v1.1.12) (2025-06-27)


### Bug Fixes

* conditionally include x-robots-tag based on xfa ([70c9f34](https://github.com/adobe-rnd/helix-mixer/commit/70c9f345e4432a32053f1645ae09806995ae9d71))

## [1.1.11](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.10...v1.1.11) (2025-06-16)


### Bug Fixes

* allow protocol ([dfdba8b](https://github.com/adobe-rnd/helix-mixer/commit/dfdba8b9b9e79bc4de1c3d5f08427256be8f02a2))

## [1.1.10](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.9...v1.1.10) (2025-06-05)


### Bug Fixes

* allow methods ([836b010](https://github.com/adobe-rnd/helix-mixer/commit/836b010dc9f448ff44d1f8feb14b8d9718acf546))

## [1.1.9](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.8...v1.1.9) (2025-06-04)


### Bug Fixes

* allow method and body ([4aff6c5](https://github.com/adobe-rnd/helix-mixer/commit/4aff6c54fb2b6fcb9ecacdd0ee840d2b3652cae7))
* pass token to pipeline ([60e50fe](https://github.com/adobe-rnd/helix-mixer/commit/60e50fe998bc8609a54303b46cb517f2ef4f0a45))

## [1.1.8](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.7...v1.1.8) (2025-05-23)


### Bug Fixes

* better default ([c19a070](https://github.com/adobe-rnd/helix-mixer/commit/c19a07040663b7537c77e5a160f9e725f802fc43))
* override x-robots-tag temporarily ([4fd0f33](https://github.com/adobe-rnd/helix-mixer/commit/4fd0f33cffade601a2d240ea0c4db310cc0c7e89))

## [1.1.7](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.6...v1.1.7) (2025-05-23)


### Bug Fixes

* log headers ([c1c0190](https://github.com/adobe-rnd/helix-mixer/commit/c1c01900a116528e0a1a62b1259f415070c7a9c7))

## [1.1.6](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.5...v1.1.6) (2025-05-22)


### Bug Fixes

* regex tweak ([ff75d28](https://github.com/adobe-rnd/helix-mixer/commit/ff75d28f1ca52901d46f3cfd237a78087c984f07))

## [1.1.5](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.4...v1.1.5) (2025-05-22)


### Bug Fixes

* path resolve tweaks ([266b6d8](https://github.com/adobe-rnd/helix-mixer/commit/266b6d82b544fde2184cf6dd0f5815f044e793f5))
* tweaks ([1d89042](https://github.com/adobe-rnd/helix-mixer/commit/1d89042f291f0ae0803c2f16f2802874c37cf937))

## [1.1.4](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.3...v1.1.4) (2025-05-22)


### Bug Fixes

* allow paths in backend config ([8373368](https://github.com/adobe-rnd/helix-mixer/commit/8373368f84a63af3798372ccc956b4de4c57e53b))

## [1.1.3](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.2...v1.1.3) (2025-05-21)


### Bug Fixes

* disable caching ([263ae92](https://github.com/adobe-rnd/helix-mixer/commit/263ae924147a3a0b5b1cde013e4c34f51019bc8a))

## [1.1.2](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.1...v1.1.2) (2025-05-21)


### Bug Fixes

* dont mutate execution contexT ([262e7b9](https://github.com/adobe-rnd/helix-mixer/commit/262e7b9f270006d0cec0671a5e9574f91a08d301))

## [1.1.1](https://github.com/adobe-rnd/helix-mixer/compare/v1.1.0...v1.1.1) (2025-05-19)


### Bug Fixes

* allow missing config ([2227740](https://github.com/adobe-rnd/helix-mixer/commit/22277407ad96ffd3fef2e5b55e7ad0c8c35ade90))

# [1.1.0](https://github.com/adobe-rnd/helix-mixer/compare/v1.0.2...v1.1.0) (2025-05-19)


### Bug Fixes

* fallback to aem.live ([7a46ec7](https://github.com/adobe-rnd/helix-mixer/commit/7a46ec78f03ce9e11ca0529ce7439b656b91ba71))


### Features

* public config ([c5c8b85](https://github.com/adobe-rnd/helix-mixer/commit/c5c8b858cad1110b319e8b6dcce5b1da7daa1774))

# [1.1.0](https://github.com/adobe-rnd/helix-mixer/compare/v1.0.2...v1.1.0) (2025-02-19)


### Features

* public config ([c5c8b85](https://github.com/adobe-rnd/helix-mixer/commit/c5c8b858cad1110b319e8b6dcce5b1da7daa1774))

## [1.0.2](https://github.com/adobe-rnd/helix-mixer/compare/v1.0.1...v1.0.2) (2025-01-15)


### Bug Fixes

* better globs ([b69f737](https://github.com/adobe-rnd/helix-mixer/commit/b69f73746f08b8b9400e9a4e312f392d529c355e))
* require property in type ([43b2133](https://github.com/adobe-rnd/helix-mixer/commit/43b21339b73650a425acbbc9b506e0e711f9527b))

## [1.0.1](https://github.com/adobe-rnd/helix-mixer/compare/v1.0.0...v1.0.1) (2025-01-13)


### Bug Fixes

* handle errors ([f668ba9](https://github.com/adobe-rnd/helix-mixer/commit/f668ba901b79a29f60b69f0bb763213b56ca661f))
* support public confifg ([7c0f95a](https://github.com/adobe-rnd/helix-mixer/commit/7c0f95a7dc558a14de01b1c813ba1a5766ea4c57))

# 1.0.0 (2024-12-09)


### Bug Fixes

* deploy ([2459048](https://github.com/adobe-rnd/helix-mixer/commit/2459048ad8681513029f1009095357281b3faad5))
* deploy ([950b696](https://github.com/adobe-rnd/helix-mixer/commit/950b696793ac731b811c943ddde90790be9f3f8e))

# 1.0.0 (2024-12-09)


### Bug Fixes

* deploy ([950b696](https://github.com/adobe-rnd/helix-mixer/commit/950b696793ac731b811c943ddde90790be9f3f8e))

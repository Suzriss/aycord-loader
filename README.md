# ayCORD — loader (build)

Substrate-free loader for an enhanced Discord (React Native / Hermes) client.
This repository holds **only the loader source and its build workflow** — no app
binaries. Each build publishes `libayCORD.dylib` + `aycord.js` to the `loader`
release.

- `Sources/ayCORD/Loader.m` — plain dylib, injects `aycord.js` after Discord's
  RN bundle via an ObjC-runtime swizzle (no CydiaSubstrate dependency).
- `js/` — TypeScript runtime (patcher, Metro module finder, MMKV storage, plugins),
  bundled by esbuild into `aycord.js`.

Build runs free on GitHub-hosted runners (public repository).

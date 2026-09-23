<div align="center">

# Edgecase Theatre

**Put a component on stage and audition the data that usually breaks it.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2f6f4e?style=flat-square)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-%3E%3D22-43853d?style=flat-square&logo=node.js&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-555?style=flat-square)

</div>

Components get built with tidy sample data. Then production sends a missing logo, a thirty-character airport name, a cancelled flight with zero delay and a route written in Arabic. Edgecase Theatre renders every one of those cases across viewport, colour scheme and text direction, so the failures sit side by side on one contact sheet.

## What it does

- Expands a scene file into named hostile fixtures, like "Missing airline logo" or "Thirty-character airport name"
- Validates hand-written cases down to the exact property path
- Plans a repeatable matrix of viewport, colour scheme and text direction
- Renders each case in its own isolated frame, so one crash doesn't take down the rest
- Flags overflow and missing image text
- Exports the cases you pick as readable JSON

## Quick start

Requires Node.js 22 or newer. No `npm install` needed.

```sh
git clone https://github.com/REllwood/EdgecaseTheatre.git
cd EdgecaseTheatre
npm start
```

Open http://127.0.0.1:4174, choose fixtures and dimensions, then press **Render matrix**.

Scene files can also be checked from the command line:

```sh
node src/check-scenes.js examples/flight-status.scene.json
```

## Status

v0.1 renders a built-in flight status card with a small framework-neutral renderer. Next up are a React package that renders your own components, screenshot comparison and a runner for CI.

## Development

```sh
npm test        # case engine tests
npm run check   # tests, syntax checks and scene validation
```

## License

[MIT](LICENSE)

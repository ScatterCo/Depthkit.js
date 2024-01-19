# Depthkit Three.js Draco Meshsequence Player

Example Three.js scene capable of playing back Draco compressed mesh sequences + video texture.

## Installation

1. Clone this repo
    - Note you will need to have git LFS installed to fetch the demo assets in the `static` folder
3. Install dependencies: `npm install`

## Development

Run `npm run dev`, which is an alias for `npx vite --host`. For more advanced options, use `npx vite --help`.

This should result in running a local webserver, which you can navigate to in the browser to view the example.

## Build

To package up the example, run `npm run build`, which is an alias for `npx vite build --base ./`. If you need to specify other options, use `npx vite build` directly.

This will result in a `dist` folder that, along with the `static` assets, can be directly uploaded to any web server, including AWS S3.

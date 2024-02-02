const path = require('path')
const { defineConfig } = require('vite')

module.exports = defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'lib/main.js'),
      name: 'depthkit-three-meshsequence-player',
      fileName: (format) => `depthkit-three-meshsequence-player.${format}.js`
    }
  }
});
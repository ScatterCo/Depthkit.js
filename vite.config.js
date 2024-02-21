import path from 'path'

export default {
  build: {
    lib: {
      entry: path.resolve(__dirname, 'lib/main.js'),
      name: 'depthkit',
      fileName: (format) => `depthkit.${format}.js`
    },
    rollupOptions: {
      external: [
        'three'
      ],
      output: {
        globals: {
          three: 'THREE'
        }
      }
    }
  }
}
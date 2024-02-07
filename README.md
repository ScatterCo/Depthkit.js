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

To build the module, run `npm run build`, which is an alias for `npx vite build`. If you need to specify other options, use `npx vite build` directly. This will result in both UMD and ES modules in the `dist` folder.

## Usage

The mesh sequence player expects both a video and a sequence of draco compressed meshes, which you can export directly from Depthkit using the WebXR preset of the Texture Mesh Sequence export type.

Depthkit will export the assets in the following folder structure:

```
- Clip_Name.mp4
- Clip_Name/
  |- mesh-f00001.drc
  |- mesh-f00002.drc
    - ...
```

### Import the module

```
import * as Depthkit from 'depthkit-meshsequence-player.es.js'
```

### Loading a mesh sequence

Lets imagine you have an asset hosted relative to your script in a folder called `clips`, such that the video is at `./clips/Clip_Name.mp4` and the first mesh frame is at `clips/Clip_Name/mesh-f00001.drc`.

There are a few different ways you can load the sequence:

```js
const clipPath = './clips/Clip_Name';

// Load the clip after object instantiation.
// This will not auto-play the clip, but will create the video, and preload some of the mesh sequence.
const depthkit = new Depthkit.DracoMeshSequencePlayer();

// If you want the clip to auto-play, you can configure that prior to loading the clip
depthkit.video.autoplay = true;
depthkit.video.muted = true;

// To be notified when the clip is ready to be shown, provide a callback.
// the readyState property follows the HTMLMediaElement.readyState logic
// (see: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState)
// depthkit.readyState is the lesser of depthkit.video.readyState and depthkit.meshReadyState
let addedToScene = false;
depthkit.readyStateChangeCallback = () => {
	if (!addedToScene && depthkit.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
		depthkit.mesh.castShadow = true;
		depthkit.material.wireframe = showWireframe;
		scene.add(depthkit);
		addedToScene = true;
	}
};

// Now we're ready to acutally load the clip!
depthkit.loadClip(clipPath);

```

```js
// Load the clip at instantiation time, along with other configuration options
const depthkit = new Depthkit.DracoMeshSequencePlayer({
    clip: clipPath,
    autoplay: true, // this automatically sets muted to true on the video
    loop: true,
    readyStateChangeCallback: () => {
        if (!addedToScene && depthkit.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            depthkit.mesh.castShadow = true;
            depthkit.material.wireframe = showWireframe;
            scene.add(depthkit);
            addedToScene = true;
        }
    }
});
```

### Controlling playback
The mesh sequence playback is tied to the video playback, so use the video element directly to control playback:
```js
depthkit.video.play();
depthkit.video.pause();
```

See the [example app](./example-app.js) for more details.
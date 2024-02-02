import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

import 'rvfc-polyfill';

const urlParams = new URLSearchParams(window.location.search);

// Instantiate a loader
const dracoLoader = new DRACOLoader();

// Specify path to a folder containing WASM/JS decoding libraries.
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

// Optional: Pre-fetch Draco WASM/JS module.
dracoLoader.preload();

const video = document.createElement('video');
const baseURL = './static';
let clipName = '3T02';

if (urlParams.get('c') != undefined) {
	// clip name override via 'c' query parameter
	clipName = urlParams.get('c');
}

video.crossOrigin = 'anonymous';
video.setAttribute('crossorigin', 'anonymous');
video.setAttribute('visibility', 'hidden');
video.setAttribute('webkit-playsinline', '');
video.setAttribute('playsInline', '');
video.setAttribute('muted', '');
video.setAttribute('autoplay', '');
// video.setAttribute('controls', '');
video.muted = true;
video.loop = true;
video.autoplay = true;
video.playsInline = true;
video.disablePictureInPicture = true;
video.src = `${baseURL}/${clipName}.mp4`;

const videoTex = new THREE.VideoTexture(video);
videoTex.minFilter = THREE.NearestFilter;
videoTex.magFilter = THREE.LinearFilter;
videoTex.format = THREE.RGBAFormat;
videoTex.colorSpace = THREE.SRGBColorSpace;
videoTex.generateMipmaps = false;

const geometries = {};
let currentFrame = 0;
let previousFrame = -1;

let mesh = null;

let lastRequestedFrame = -1;

let maxFrames = 999999;

const framesToBuffer = 30;

// use query parameter 'wireframe' to enable wireframe preview
const showWireframe = (urlParams.get('wireframe') != undefined);

const updateMesh = (frame) => {
	if (mesh == null) {
		const material = new THREE.MeshBasicMaterial( { color: 0xffffff, map: videoTex, wireframe: showWireframe } );
		mesh = new THREE.Mesh( geometries[frame], material );
		mesh.castShadow = true;
		scene.add( mesh );
	} else {
		mesh.geometry = geometries[frame];
	}

	const currentKeys = Object.keys(geometries);
	currentKeys.forEach(key => {
		const f = parseInt(key, 10);
		if (f !== NaN && f < frame) {
			// console.log(`cleaninig up unused frame: ${key}`);
			delete geometries[key];
		}
	});

};

const hasBufferedGeometry = (frame, bufferSize) => {
	for (let index = frame; index < frame + bufferSize; index++) {
		if (index >= maxFrames) continue;
		if (!geometries.hasOwnProperty(index)) return false;
	}
	return true;
}

const loadMesh = (frame) => {
	// Load a Draco geometry
	const frameStr = ('00000' + (frame + 1)).slice(-5);
	const meshFileName = `${baseURL}/${clipName}/mesh-f${frameStr}.drc`;
	// console.log(`Requesting frame ${meshFileName}`);
	lastRequestedFrame = frame;

	if (frame >= maxFrames) {
		return;
	}

	// console.log(`requesting frame ${frame}`);

	dracoLoader.load(
		// resource URL
		meshFileName,
		// called when the resource is loaded
		function ( geometry ) {

			// console.log(`loaded frame ${frame}`);
			
			geometries[frame] = geometry;

			if(video.paused && hasBufferedGeometry(currentFrame, 1)) {
				console.log("Unpausing video");
				updateMesh(currentFrame);
				video.play();
			}
	
		},
		// called as loading progresses
		function ( xhr ) {
	
			// console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
			// console.log(xhr);
	
		},
		// called when loading has errors
		function ( error ) {
	
			// console.log( 'An error happened' );
			// console.log(error);

			maxFrames = Math.min(maxFrames, frame);
	
			// we looped
			if (video.paused && currentFrame >= maxFrames) {
				console.log("Unpausing video");
				video.play();
			}
		}
	);

};


for (let index = 0; index < framesToBuffer; index++) {
	loadMesh(index);
}


if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
	const onNewVideoFrame = (now, metadata) => {
		// Do something with the frame.
		// compute the frame number
		const frameNumber = Math.round(metadata.mediaTime * 30.0);
		previousFrame = currentFrame;
		currentFrame = frameNumber;

		// console.log(`video frame: ${frameNumber}`);
		if (currentFrame == previousFrame) {
			console.log("duplicate frame");
			console.log(now, metadata);
		}
		else{
			if (geometries.hasOwnProperty(currentFrame)) {
				updateMesh(currentFrame);
			}
			if (!hasBufferedGeometry(currentFrame, framesToBuffer))
			{
				console.log("Waiting for mesh sequence loading to catch up, BUFFERING...");
				video.pause();
			}
			
			// this can happen if the tab loses focus.
			if (lastRequestedFrame < currentFrame) {
				console.log("regained focus");
				lastRequestedFrame = currentFrame - 1;
			}

			if (currentFrame < previousFrame) {
				// looped or seeked
				lastRequestedFrame = -1;
			}
	
			if (lastRequestedFrame - currentFrame < framesToBuffer) {
				const requestStart = lastRequestedFrame + 1;
				const requestUpTo = requestStart + framesToBuffer;
				for (let index = requestStart; index < requestUpTo; index++) {
					loadMesh(index);
				}
			}
		}

		// Re-register the callback to be notified about the next frame.
		video.requestVideoFrameCallback(onNewVideoFrame);
	};
	// Initially register the callback to be notified about the first frame.
	video.requestVideoFrameCallback(onNewVideoFrame);
}
else {
	alert("requestVideoFrameCallback is not supported on this browser.");
}


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.physicallyCorrectLights = true;

// blend the background into the floor
renderer.setClearColor(0x202020);
scene.add(new THREE.AmbientLight(0xffffff, 1.3))  // Add soft white light to the scene.

renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const geometry = new THREE.PlaneGeometry(2000, 2000);
geometry.rotateX(-Math.PI / 2)

const material = new THREE.MeshStandardMaterial( { color: 0xa0a0a0, metalness: 0.9, roughness: 0.7 } );
const base = new THREE.Mesh( geometry, material );
base.receiveShadow = true;
scene.add( base );

// add some nice lighting
let directionalLight = new THREE.SpotLight(0xffaaee, 50, 0, 0.7, 0.1);
directionalLight.position.set(2, 6, 2);
directionalLight.target.position.set(0,1.0,0);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

directionalLight = new THREE.SpotLight(0xeeffaa, 50, 0, 0.5, 0.1);
directionalLight.position.set(0.5, 5, -4);
directionalLight.target.position.set(0,1.0,0);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

directionalLight = new THREE.SpotLight(0xaaeeff, 50, 0, 0.9, 0.1);
directionalLight.position.set(-2, 4, -2);
directionalLight.target.position.set(0,1.0,0);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

camera.position.z = 3;
camera.position.y = 1.5;

const controls = new OrbitControls( camera, renderer.domElement );
controls.target.y = 1.0;
controls.update();

function animate() {
	requestAnimationFrame( animate );

	renderer.render( scene, camera );
}

animate();
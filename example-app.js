import 'rvfc-polyfill';

import * as THREE from 'three';
import * as Depthkit from './lib/main.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
let directionalLight = new THREE.SpotLight(0xffaaee, 60, 0, 0.7, 0.1);
directionalLight.position.set(2, 6, 2);
directionalLight.target.position.set(0,1.0,0);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

directionalLight = new THREE.SpotLight(0xeeffaa, 60, 0, 0.5, 0.1);
directionalLight.position.set(0.5, 5, -4);
directionalLight.target.position.set(0,1.0,0);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

directionalLight = new THREE.SpotLight(0xaaeeff, 60, 0, 0.9, 0.1);
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

// Add the depthkit object
const urlParams = new URLSearchParams(window.location.search);

const baseURL = './static';
let clipName = '3T02';

if (urlParams.get('c') != undefined) {
	// clip name override via 'c' query parameter
	clipName = urlParams.get('c');
}

const clipPath = `${baseURL}/${clipName}`;

// use query parameter 'wireframe' to enable wireframe preview
const showWireframe = (urlParams.get('wireframe') !== null);

Depthkit.setModuleConfig({debug: true});

let addedToScene = false;
const readyStateChangeCallback = () => {
	if (!addedToScene && depthkit.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
		depthkit.mesh.castShadow = true;
		depthkit.material.wireframe = showWireframe;
		scene.add(depthkit);
		addedToScene = true;
	}
};

const depthkit = new Depthkit.DracoMeshSequencePlayer({
    clip: clipPath,
    autoplay: true,
    loop: true,
	readyStateChangeCallback: readyStateChangeCallback
});

function animate() {
	requestAnimationFrame( animate );

    depthkit.updateReadyState();

	renderer.render( scene, camera );
}

animate();
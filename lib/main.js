import * as THREE from 'three';

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export default class DepthkitMeshSequencePlayer extends THREE.Object3D {
    constructor(parameters) {
        super();

        this.parameters = parameters;

        // Instantiate a loader
        if (parameters?.dracoLoader) {
            this.dracoLoader = parameters.dracoLoader;
        } else {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
            dracoLoader.preload();

            this.dracoLoader = dracoLoader;
        }

        if (parameters?.videoElement) {
            this.video = videoElement;
        } else {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.setAttribute('crossorigin', 'anonymous');
            video.setAttribute('visibility', 'hidden');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('playsInline', '');
            video.loop = parameters?.loop || false;
            video.autoplay = parameters?.autoplay || false;
            video.muted = video.autoplay ? true : (parameters?.muted || false);
            if (video.muted){
                video.setAttribute('muted', '');
            }
            if (video.autoplay) {
                video.setAttribute('autoplay', '');
            }
            video.playsInline = true;
            video.disablePictureInPicture = true;

            this.video = video;
        }

        const videoTex = new THREE.VideoTexture(this.video);
        videoTex.minFilter = THREE.NearestFilter;
        videoTex.magFilter = THREE.LinearFilter;
        videoTex.format = THREE.RGBAFormat;
        videoTex.colorSpace = THREE.SRGBColorSpace;
        videoTex.generateMipmaps = false;
        this.videoTex = videoTex;

        this.material = new THREE.MeshBasicMaterial( { color: 0xffffff, map: this.videoTex } );
        this.mesh = new THREE.Mesh( new THREE.BufferGeometry(), this.material );
        this.add( this.mesh );
        
        this.geometries = {};
        
        this.currentFrame = 0;
        this.previousFrame = -1;
        
        this.lastRequestedFrame = -1;
        this.maxFrames = parameters?.maxFrames || 999999;
        this.framesToBuffer = parameters?.framesToBuffer || 30;

        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            const onNewVideoFrame = (now, metadata) => {
                const frameNumber = Math.round(metadata.mediaTime * 30.0);
                this.previousFrame = this.currentFrame;
                this.currentFrame = frameNumber;
        
                if (this.currentFrame === this.previousFrame) {
                    console.debug("Duplicate video frame");
                    console.debug(now, metadata);
                }
                else {
                    if (this.geometries.hasOwnProperty(this.currentFrame)) {
                        this.#updateMesh(this.currentFrame);
                    }
                    if (!this.#hasBufferedGeometry(this.currentFrame, this.framesToBuffer))
                    {
                        console.debug("Waiting for mesh sequence loading to catch up, BUFFERING...");
                        this.video.pause();
                    }
                    
                    // this can happen if the tab loses focus.
                    if (this.lastRequestedFrame < this.currentFrame) {
                        console.debug("regained focus");
                        this.lastRequestedFrame = this.currentFrame - 1;
                    }
        
                    if (this.currentFrame < this.previousFrame) {
                        // looped or seeked
                        this.lastRequestedFrame = -1;
                    }
            
                    if (this.lastRequestedFrame - this.currentFrame < this.framesToBuffer) {
                        const requestStart = this.lastRequestedFrame + 1;
                        const requestUpTo = requestStart + this.framesToBuffer;
                        for (let index = requestStart; index < requestUpTo; index++) {
                            this.#loadMesh(index);
                        }
                    }
                }
        
                // Re-register the callback to be notified about the next frame.
                this.video.requestVideoFrameCallback(onNewVideoFrame);
            };
            // Initially register the callback to be notified about the first frame.
            this.video.requestVideoFrameCallback(onNewVideoFrame);
        }
        else {
            throw("RequestVideoFrameCallback is not supported on this browser. Consider using a polyfill");
        }

        if (parameters?.clip) {
            this.loadClip(parameters.clip);
        }
    }

    loadClip(clip) {

        if (typeof clip === 'string')
        {
            // assume this is a base URL for both the video and mesh sequence directory
            this.video.src = clip + '.mp4'
            this.meshSequencePath = clip;
            this.meshSequenceFilePrefix = 'mesh-f';
            this.meshSequenceFileSuffix = '.drc';
            this.meshSequenceZeroPadding = 5;
            this.meshSequenceStartFrame = 1;
        }

        // TODO: support for explicitly setting video URL and mesh sequence path separately

        for (let index = 0; index < this.framesToBuffer; index++) {
            this.#loadMesh(index);
        }
    }

    #updateMesh(frame) {
        this.mesh.geometry = this.geometries[frame];
    
        const currentKeys = Object.keys(this.geometries);
        currentKeys.forEach(key => {
            const f = parseInt(key, 10);
            if (f !== NaN && f < frame) {
                console.debug(`cleaninig up unused frame: ${key}`);
                delete this.geometries[key];
            }
        });
    }
    
    #hasBufferedGeometry(frame, bufferSize) {
        for (let index = frame; index < frame + bufferSize; index++) {
            if (index >= this.maxFrames) continue;
            if (!this.geometries.hasOwnProperty(index)) return false;
        }
        return true;
    }
    
    #loadMesh(frame) {
        // Load a Draco geometry
        const frameStr = (frame + 1).toString().padStart(this.meshSequenceZeroPadding, '0');
        const meshFileName = `${this.meshSequencePath}/${this.meshSequenceFilePrefix}${frameStr}${this.meshSequenceFileSuffix}`;
        this.lastRequestedFrame = frame;
        
        console.debug(`Requesting frame ${frame}: ${meshFileName}`);
        
        if (frame >= this.maxFrames) {
            return;
        }
    
        this.dracoLoader.load(
            // resource URL
            meshFileName,
            // called when the resource is loaded
            (geometry) => {
                this.geometries[frame] = geometry;
            
                if (this.video.paused && this.#hasBufferedGeometry(this.currentFrame, 1)) {
                    console.debug("Unpausing video");
                    this.#updateMesh(this.currentFrame);
                    this.video.play();
                }
            },
            // called as loading progresses
            (xhr) => {
                // console.debug( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
                // console.debug(xhr);
            },
            // called when loading has errors
            (error) => {
                // If the user does not specify max frames in the constructor,
                // we use this error handler to detect the end of the sequence

                this.maxFrames = Math.min(this.maxFrames, frame);
        
                // we looped
                if (this.video.paused && this.currentFrame >= this.maxFrames) {
                    console.debug("Unpausing video");
                    this.video.play();
                }
            }
        );
    
    }
}

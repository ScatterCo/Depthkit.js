import * as THREE from './imports.js';

let moduleConfig = {
    debug: false,
};

function setModuleConfig(config) {
    moduleConfig = config;
}

function log(msg) {
    if (moduleConfig.debug) {
        console.debug(msg);
    }
}


class DracoMeshSequencePlayer extends THREE.Object3D {
    constructor(parameters) {
        super();

        this.parameters = parameters;

        this.readyState = HTMLMediaElement.HAVE_NOTHING;
        this.meshReadyState = HTMLMediaElement.HAVE_NOTHING;

        this.bufferingMeshes = false;
        this.wasPlaying = false;

        // Instantiate a loader
        if (parameters?.dracoLoader) {
            this.dracoLoader = parameters.dracoLoader;
        } else {
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
            dracoLoader.preload();

            this.dracoLoader = dracoLoader;
        }

        if (parameters?.videoElement) {
            this.video = parameters.videoElement;
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
            if (video.muted) {
                video.setAttribute('muted', '');
            }
            if (video.autoplay) {
                video.setAttribute('autoplay', '');
            }
            video.playsInline = true;
            video.disablePictureInPicture = true;

            this.video = video;
        }

        this.video.addEventListener("loadeddata", () => {
            this.updateReadyState();
        });

        const videoTex = new THREE.VideoTexture(this.video);
        videoTex.minFilter = THREE.NearestFilter;
        videoTex.magFilter = THREE.LinearFilter;
        videoTex.format = THREE.RGBAFormat;
        videoTex.colorSpace = THREE.SRGBColorSpace;
        videoTex.generateMipmaps = false;
        this.videoTex = videoTex;

        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.videoTex });
        this.blankGeo = new THREE.BufferGeometry();
        this.mesh = new THREE.Mesh(this.blankGeo, this.material);
        this.add(this.mesh);

        this.transferSpeeds = [];
        this.transferSpeedWindowSize = 30;
        this.meshAvgTransferSpeed = 0;
        this.meshSizes = [];
        this.meshAvgSize = 0;
        this.avgMeshesPerSecond = 0;

        this.geometries = {};
        this.currentFrame = 0;
        this.previousFrame = -1;
        this.lastRequestedFrame = -1;
        this.maxFrames = parameters?.maxFrames || 999999;
        this.openMeshRequests = 0;

        this.framesToBuffer = parameters?.framesToBuffer || 30;

        this.maxConcurrentMeshRequests = parameters?.maxConcurrentMeshRequests || 15;

        this.readyStateChangeCallback = parameters?.readyStateChangeCallback || null;

        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            const onNewVideoFrame = (now, metadata) => {
                const frameNumber = Math.round(metadata.mediaTime * 30.0);
                this.previousFrame = this.currentFrame;
                this.currentFrame = frameNumber;

                if (this.currentFrame === this.previousFrame) {
                    log('duplicate video frame');
                } else {
                    if (this.geometries.hasOwnProperty(this.currentFrame)) {
                        this.updateMesh(this.currentFrame);
                    }
                    this.updateReadyState();
                    if (!this.bufferingMeshes && this.meshReadyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
                        log('not enough meshes buffered, pausing the video while meshes load.');
                        this.wasPlaying = !this.video.paused;
                        if (this.wasPlaying) {
                            this.video.pause();
                        }
                        this.bufferingMeshes = true;
                    }

                    // this can happen if the tab loses focus.
                    if (this.lastRequestedFrame < this.currentFrame) {
                        log('regained focus');
                        this.lastRequestedFrame = this.currentFrame - 1;
                    }

                    if (this.currentFrame < this.previousFrame) {
                        // looped or seeked
                        this.lastRequestedFrame = -1;
                    }

                    this.loadMoreMeshes();
                }

                // Re-register the callback to be notified about the next frame.
                this.video.requestVideoFrameCallback(onNewVideoFrame);
            }
            // Initially register the callback to be notified about the first frame.
            this.video.requestVideoFrameCallback(onNewVideoFrame);
        } else {
            throw new Error('requestVideoFrameCallback is not supported on this browser. Consider using a polyfill');
        }

        if (parameters?.clip) {
            this.loadClip(parameters.clip);
        }
    }

    loadClip(clip) {
        if (!this.video.paused) this.video.pause()

        if (typeof clip === 'string') {
            // assume this is a base URL for both the video and mesh sequence directory
            this.video.src = `${clip}.mp4`;
            this.meshSequencePath = clip;
            this.meshSequenceFilePrefix = 'mesh-f';
            this.meshSequenceFileSuffix = '.drc';
            this.meshSequenceZeroPadding = 5;
            this.meshSequenceStartFrame = 1;
        }

        // support for explicitly setting video URL and mesh sequence path separately
        if (clip !== null && typeof clip === 'object') {
            if (clip.name) {
                this.video.src = `${clip.name}.mp4`;
                this.meshSequencePath = clip.name;
            } else {
                if (clip.videoSrc) this.video.src = clip.videoSrc;
                this.meshSequencePath = clip.meshSequencePath || '';
            }

            this.meshSequenceFilePrefix = clip.meshSequenceFilePrefix || 'mesh-f';
            this.meshSequenceFileSuffix = clip.meshSequenceFileSuffix || '.drc';
            this.meshSequenceZeroPadding = clip.meshSequenceZeroPadding || 5;
            this.meshSequenceStartFrame = clip.meshSequenceStartFrame || 1;
        }

        this.video.load();
        this.bufferingMeshes = true;
        this.wasPlaying = this.video.autoplay;

        // reset internal mesh cache and other state variables
        this.readyState = HTMLMediaElement.HAVE_NOTHING;
        this.meshReadyState = HTMLMediaElement.HAVE_NOTHING;
        this.mesh.geometry = this.blankGeo

        const currentKeys = Object.keys(this.geometries);
        currentKeys.forEach((key) => {
            const f = parseInt(key, 10);
            if (f !== NaN && this.geometries[key] !== null &&
                typeof this.geometries[key] === 'object' &&
                typeof this.geometries[key].dispose === 'function') {
                this.geometries[key].dispose();
                delete this.geometries[key];
            }
        });

        this.currentFrame = 0;
        this.previousFrame = -1;
        this.lastRequestedFrame = -1;
        this.maxFrames = this.parameters?.maxFrames || 999999;
        this.openMeshRequests = 0;

        this.updateReadyState();
        this.loadMoreMeshes();
    }

    loadMoreMeshes() {
        if (this.numBufferedGeometryFrames(this.currentFrame) < 3 || (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.lastRequestedFrame - this.currentFrame < this.framesToBuffer)) {
            const requestStart = this.lastRequestedFrame + 1;
            let batchSize = Math.max(this.maxConcurrentMeshRequests - this.openMeshRequests, 0);
            log(`Requesting ${batchSize} more meshes`);
            const requestUpTo = requestStart + batchSize;
            for (let index = requestStart; index < requestUpTo; index++) {
                this.loadMesh(index);
            }
        }
    }

    updateMesh(frame) {
        this.mesh.geometry = this.geometries[frame];

        const currentKeys = Object.keys(this.geometries);
        currentKeys.forEach((key) => {
            const f = parseInt(key, 10);
            if (f !== NaN && f < frame) {
                this.geometries[key].dispose();
                delete this.geometries[key];
            }
        });
    }

    numBufferedGeometryFrames(frame) {
        let frames = 0;
        while (this.geometries.hasOwnProperty(frame++)) {
            frames++;
        }
        return frames;
    }

    hasBufferedGeometry(frame, bufferSize) {
        for (let index = frame; index < frame + bufferSize; index++) {
            if (index >= this.maxFrames) continue;
            if (!this.geometries.hasOwnProperty(index)) return false;
        }
        return true;
    }

    loadMesh(frame) {
        // Load a Draco geometry
        const frameStr = (frame + 1).toString().padStart(this.meshSequenceZeroPadding, '0');
        const meshFileName = `${this.meshSequencePath}/${this.meshSequenceFilePrefix}${frameStr}${this.meshSequenceFileSuffix}`;
        this.lastRequestedFrame = frame;

        if (frame >= this.maxFrames) {
            return;
        }

        this.openMeshRequests++;

        const transferStart = new Date().getTime();
        let transferEnd = new Date().getTime();
        let totalSize = 0;

        // cache the request path for comparison later
        let requestMeshSequencePath = this.meshSequencePath;

        this.dracoLoader.load(
            // resource URL
            meshFileName,
            // called when the resource is loaded
            (geometry) => {
                if (requestMeshSequencePath !== this.meshSequencePath) {
                    // This mesh is not for the current clip
                    geometry.dispose();
                    return;
                }

                this.geometries[frame] = geometry;

                this.openMeshRequests--;

                transferEnd = new Date().getTime();
                let transferSpeed = totalSize / ((transferEnd - transferStart) / 1000);

                if (this.transferSpeeds.push(transferSpeed) > this.transferSpeedWindowSize) {
                    this.transferSpeeds.shift();
                }

                let totalSpeeds = 0;
                this.transferSpeeds.forEach(speed => {
                    totalSpeeds += speed;
                });

                this.meshAvgTransferSpeed = totalSpeeds / this.transferSpeeds.length;

                if (this.meshSizes.push(totalSize) > this.transferSpeedWindowSize) {
                    this.meshSizes.shift();
                }

                let totalSizes = 0;
                this.meshSizes.forEach(size => {
                    totalSizes += size;
                });

                this.meshAvgSize = totalSizes / this.meshSizes.length;
                this.avgMeshesPerSecond = this.meshAvgTransferSpeed / this.meshAvgSize;

                log(`avg mesh transfer speed: ${this.meshAvgTransferSpeed}, avg mesh size: ${this.meshAvgSize}, avg meshes per second: ${this.avgMeshesPerSecond}`);

                this.updateReadyState();

                if (this.bufferingMeshes && this.meshReadyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
                    this.updateMesh(this.currentFrame);
                    if (this.wasPlaying && this.video.paused) {
                        log('buffering finished; unpausing video');
                        this.video.play();
                    }
                    this.bufferingMeshes = false;
                }

                this.loadMoreMeshes();
            },
            // called as loading progresses
            (xhr) => {
                totalSize = xhr.total;
            },
            // called when loading has errors
            (error) => {
                // If the user does not specify max frames in the constructor,
                // we use this error handler to detect the end of the sequence
                this.openMeshRequests--;

                this.maxFrames = Math.min(this.maxFrames, frame);
            }
        )
    }

    updateReadyState() {
        let videoReadyState = HTMLMediaElement.HAVE_NOTHING;

        if (this.video) {
            videoReadyState = this.video.readyState;
        }

        let meshReadyState = HTMLMediaElement.HAVE_NOTHING;

        const meshesLoaded = this.numBufferedGeometryFrames(this.currentFrame);
        if (meshesLoaded >= 1) {
            meshReadyState = HTMLMediaElement.HAVE_CURRENT_DATA;
        }
        if (meshesLoaded >= 3 || (this.maxFrames - this.currentFrame) <= meshesLoaded) {
            meshReadyState = HTMLMediaElement.HAVE_FUTURE_DATA;
        }
        if (this.avgMeshesPerSecond > 1.25 && (meshesLoaded >= 30 || (this.maxFrames - this.currentFrame) <= meshesLoaded)) {
            meshReadyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
        }
        log(`${meshesLoaded} buffered meshes`);

        const readyState = Math.min(meshReadyState, videoReadyState);
        if (readyState !== this.readyState || this.meshReadyState !== meshReadyState) {
            this.meshReadyState = meshReadyState;
            this.readyState = readyState;
            log(`new readyState: ${this.readyState} = min(meshReadyState=${meshReadyState}, videoReadyState=${videoReadyState})`);

            if (this.readyStateChangeCallback) this.readyStateChangeCallback();
        }
    }
}

export {
    DracoMeshSequencePlayer,
    setModuleConfig,
}

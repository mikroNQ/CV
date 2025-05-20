// js/detection.worker.js

// Import necessary scripts
self.importScripts('./libs/tf.min.js', './libs/face-api.min.js');

const FACE_API_MODEL_URL = '../models/face_api';
let modelsLoaded = false;
let workerPerformanceConfig = {
    lowEndDevice: false,
    useWasm: false
};

async function loadModelsInternal() {
    try {
        console.log('[Worker] Загрузка моделей Face API...');
        console.log('[Worker] Current performance config for model loading:', workerPerformanceConfig);

        if (self.tf && self.tf.setBackend) {
            if (workerPerformanceConfig.useWasm) {
                await self.tf.setBackend('wasm');
                console.log('[Worker] TensorFlow WASM backend set.');
            } else {
                await self.tf.setBackend('webgl');
                console.log('[Worker] TensorFlow WebGL backend set.');
            }
            await self.tf.ready();
            console.log('[Worker] TensorFlow backend ready.');
        } else {
            console.warn('[Worker] TensorFlow backend setup skipped.');
        }

        if (typeof self.faceapi === 'undefined') {
            throw new Error('face-api.js not loaded correctly in worker.');
        }

        await self.faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL);
        console.log('[Worker] Модель ssdMobilenetv1 загружена');

        await self.faceapi.nets.ageGenderNet.loadFromUri(FACE_API_MODEL_URL);
        console.log('[Worker] Модель ageGenderNet загружена');

        modelsLoaded = true;
        console.log('[Worker] Модели Face API успешно загружены');
        self.postMessage({ type: 'models_loaded' });

    } catch (error) {
        console.error('[Worker] Ошибка загрузки моделей Face API:', error);
        self.postMessage({ type: 'error', message: 'Worker: Model loading failed: ' + error.message + (error.stack ? '\n' + error.stack : '') });
        modelsLoaded = false;
    }
}

self.onmessage = async (event) => {
    const { type, imageData, config, videoFrameBitmap, id } = event.data; // Added id

    if (type === 'init') {
        console.log('[Worker] Initializing with config:', config);
        if (config) {
            workerPerformanceConfig = { ...workerPerformanceConfig, ...config };
        }
        if (!modelsLoaded) {
            await loadModelsInternal();
        } else {
            self.postMessage({ type: 'models_loaded' });
        }
    } else if (type === 'detect') {
        if (!modelsLoaded) {
            self.postMessage({ type: 'error', message: 'Worker: Models not loaded. Please send "init" message.', id: id });
            return;
        }
        if (!imageData && !videoFrameBitmap) {
            self.postMessage({ type: 'error', message: 'Worker: No image data or VideoFrameBitmap received.', id: id });
            return;
        }

        try {
            const inputForDetection = videoFrameBitmap || imageData;
            const detectionOptions = new self.faceapi.SsdMobilenetv1Options({
                minConfidence: workerPerformanceConfig.lowEndDevice ? 0.4 : 0.5,
                maxResults: 1
            });

            let processedInput = inputForDetection;
            let scaleFactor = 1;
            let inputWidth = inputForDetection.width;
            let inputHeight = inputForDetection.height;

            if (inputForDetection instanceof VideoFrameBitmap) {
                inputWidth = inputForDetection.displayWidth || inputForDetection.width;
                inputHeight = inputForDetection.displayHeight || inputForDetection.height;
            }

            if (workerPerformanceConfig.lowEndDevice) {
                const targetWidth = Math.floor(inputWidth / 2);
                const targetHeight = Math.floor(inputHeight / 2);
                scaleFactor = 2;
                const offscreenCanvas = new OffscreenCanvas(targetWidth, targetHeight);
                const ctx = offscreenCanvas.getContext('2d');
                if (inputForDetection instanceof VideoFrameBitmap) {
                    ctx.drawImage(inputForDetection, 0, 0, targetWidth, targetHeight);
                } else if (inputForDetection instanceof ImageData) {
                    const tempBitmap = await createImageBitmap(inputForDetection, 0, 0, inputWidth, inputHeight, { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: 'medium' });
                    ctx.drawImage(tempBitmap, 0, 0);
                    tempBitmap.close();
                }
                processedInput = offscreenCanvas;
            } else if (inputForDetection instanceof ImageData) {
                const offscreenCanvas = new OffscreenCanvas(inputWidth, inputHeight);
                const ctx = offscreenCanvas.getContext('2d');
                ctx.putImageData(inputForDetection, 0, 0);
                processedInput = offscreenCanvas;
            } else if (processedInput instanceof VideoFrameBitmap && !workerPerformanceConfig.lowEndDevice) {
                const offscreenCanvas = new OffscreenCanvas(inputWidth, inputHeight);
                const ctx = offscreenCanvas.getContext('2d');
                ctx.drawImage(processedInput, 0, 0, inputWidth, inputHeight);
                processedInput = offscreenCanvas;
            }
            
            console.time(`[Worker] detectionTime_frame_${id}`);
            const detections = await self.faceapi.detectAllFaces(processedInput, detectionOptions)
                .withAgeAndGender();
            console.timeEnd(`[Worker] detectionTime_frame_${id}`);

            if (scaleFactor > 1 && detections.length > 0) {
                detections.forEach(det => {
                    const box = det.detection.box;
                    box.x *= scaleFactor;
                    box.y *= scaleFactor;
                    box.width *= scaleFactor;
                    box.height *= scaleFactor;
                    if (det.landmarks && det.landmarks.positions) {
                        for (let i = 0; i < det.landmarks.positions.length; i++) {
                            det.landmarks.positions[i]._x *= scaleFactor;
                            det.landmarks.positions[i]._y *= scaleFactor;
                        }
                    }
                    if (det.landmarks && det.landmarks.unshiftedLandmarks && det.landmarks.unshiftedLandmarks.positions) {
                         for (let i = 0; i < det.landmarks.unshiftedLandmarks.positions.length; i++) {
                            det.landmarks.unshiftedLandmarks.positions[i]._x *= scaleFactor;
                            det.landmarks.unshiftedLandmarks.positions[i]._y *= scaleFactor;
                        }
                    }
                });
            }
            
            self.postMessage({ type: 'detection_result', detections, id: id }); // Added id

        } catch (error) {
            console.error('[Worker] Ошибка во время детекции (frame ' + id + '):', error);
            self.postMessage({ type: 'error', message: 'Worker: Detection error (frame ' + id + '): ' + error.message + (error.stack ? '\n' + error.stack : ''), id: id });
        }
    } else {
        console.warn('[Worker] Received unknown message type:', type);
    }
};

console.log('[Worker] Worker script loaded (with profiling). Waiting for "init" message.');

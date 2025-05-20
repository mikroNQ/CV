// app.js

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: true });
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const calibrateButton = document.getElementById('calibrateButton');
const confirmAgeButton = document.getElementById('confirmAgeButton');
const statusDisplay = document.getElementById('statusDisplay');
const averageAgeDisplay = document.getElementById('averageAge');
const ageVerdictDisplay = document.getElementById('ageVerdict');

const performanceConfig = {
    lowEndDevice: false,
    detectionInterval: 100,
    videoConstraints: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
    },
    useWasm: false,
    skipEffects: false,
    forceHighPerformance: false
};

let stream;
let detectionInterval; // For setInterval
let shouldUpdateAges = false;
let currentBestFaceId = null;
let isAgeStableForConfirmation = false;
// let statusUpdateCounter = 0; // Seemingly unused, commented out
let animationFrameId = null; // For startRenderLoop
let faceDetectionData = null; // Holds data for rendering

window.ageVerificationStatus = null;

const faceAgeHistory = new Map();
const AGE_HISTORY_LENGTH = 3;
let displayedAges = new Map();
const AGE_UPDATE_THRESHOLD = 1.0;
const AGE_VERIFICATION_THRESHOLD = 18;
// const LOCK_TIMER_DURATION_MS = 3000; // Seemingly unused
// const FACE_POSITION_TOLERANCE = 10; // Now used by getFaceId
const AGE_DETERMINATION_TIME = 2300;

// const FACE_API_MODEL_URL = 'models/face_api'; // No longer needed here, worker uses its own relative path

// Worker related variables
let detectionWorker;
let frameDetectId = 0; // For correlating profiling messages

function updatePerformanceModeUI() {
    let modeDisplay = document.getElementById('performanceModeDisplay');
    if (!modeDisplay) {
        modeDisplay = document.createElement('div');
        modeDisplay.id = 'performanceModeDisplay';
        modeDisplay.className = 'performance-mode-display';
        const statsElement = document.querySelector('.stats');
        if (statsElement) {
            statsElement.parentNode.insertBefore(modeDisplay, statsElement.nextSibling);
        } else {
            document.body.appendChild(modeDisplay);
        }
    }
    modeDisplay.textContent = performanceConfig.lowEndDevice ?
        '📱 Режим низкой производительности' : '🖥️ Режим высокой производительности';
    modeDisplay.className = performanceConfig.lowEndDevice ?
        'performance-mode-display low-mode' : 'performance-mode-display high-mode';
}

function checkDevicePerformance() {
    try {
        const savedMode = localStorage.getItem('age-verification-performance-mode');
        if (savedMode === 'high') {
            performanceConfig.forceHighPerformance = true;
        } else if (savedMode === 'low') {
            performanceConfig.forceHighPerformance = false;
            performanceConfig.lowEndDevice = true;
            document.body.classList.add('low-end');
            applyLowEndSettings(); // Apply settings if loaded from storage
            // No return here, let it flow to update UI and worker
        }
    } catch (e) {
        console.warn('[Main] Ошибка при чтении сохранённого режима:', e);
    }

    if (performanceConfig.forceHighPerformance && !performanceConfig.lowEndDevice) { // ensure lowEnd isn't true if high perf is forced
        performanceConfig.lowEndDevice = false;
        document.body.classList.remove('low-end');
        // Reset to high-performance defaults if they were changed by applyLowEndSettings
        performanceConfig.detectionInterval = 100;
        performanceConfig.videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" };
        performanceConfig.useWasm = false;
        performanceConfig.skipEffects = false;
    } else if (performanceConfig.lowEndDevice) { // This will be true if set by localStorage or by detection logic
         applyLowEndSettings(); // Apply settings if not already applied by localStorage path
    } else { // Auto-detect if no preference stored and not forced
        const canvasTest = document.createElement('canvas');
        const gl = canvasTest.getContext('webgl') || canvasTest.getContext('experimental-webgl');
        const hasStrongWebGL = gl && gl.getExtension('WEBGL_depth_texture');
        const cpuCores = navigator.hardwareConcurrency || 1;
        performanceConfig.lowEndDevice = !hasStrongWebGL && cpuCores <= 2;

        if (performanceConfig.lowEndDevice) {
            console.log('[Main] Обнаружено устройство с низкой производительностью, применяются оптимизации');
            applyLowEndSettings();
        } else {
            document.body.classList.remove('low-end');
             // Ensure high-performance defaults are set if auto-detecting high-end
            performanceConfig.detectionInterval = 100;
            performanceConfig.videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" };
            performanceConfig.useWasm = false;
            performanceConfig.skipEffects = false;
        }
    }
    
    console.log('[Main] Состояние устройства (после checkDevicePerformance):', performanceConfig);
    updatePerformanceModeUI();
    // Worker will be initialized/re-initialized by the caller of checkDevicePerformance (e.g. onload or togglePerformanceMode)
}

function applyLowEndSettings() {
    performanceConfig.detectionInterval = 300;
    performanceConfig.videoConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" };
    performanceConfig.useWasm = true;
    performanceConfig.skipEffects = true;
    document.body.classList.add('low-end');
}

function togglePerformanceMode() {
    performanceConfig.lowEndDevice = !performanceConfig.lowEndDevice; // Toggle the flag

    try {
        localStorage.setItem('age-verification-performance-mode',
            performanceConfig.lowEndDevice ? 'low' : 'high');
    } catch (e) {
        console.warn('[Main] Не удалось сохранить режим производительности:', e);
    }

    if (performanceConfig.lowEndDevice) {
        applyLowEndSettings();
        console.log('[Main] Включен режим низкой производительности');
    } else {
        // Reset to high-performance defaults
        performanceConfig.detectionInterval = 100;
        performanceConfig.videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" };
        performanceConfig.useWasm = false;
        performanceConfig.skipEffects = false;
        document.body.classList.remove('low-end');
        console.log('[Main] Включен режим высокой производительности');
    }
    
    updatePerformanceModeUI(); // Update UI text

    // Re-initialize worker and restart webcam if active
    if (stream) {
        stopWebcam(); // Terminates old worker & clears interval
        initializeWorker(); // Re-init worker with new performanceConfig
        setTimeout(() => {
            startWebcam(); // Starts with new settings
        }, 500);
    } else {
        // If stream not active, just ensure worker gets new config for next time
        initializeWorker();
    }
    alert('Переключено: ' + (performanceConfig.lowEndDevice ? 'Режим низкой производительности' : 'Режим высокой производительности'));
}


function initializeWorker() {
    if (detectionWorker) {
        detectionWorker.terminate();
        console.log('[Main] Previous worker terminated.');
    }
    detectionWorker = new Worker('js/detection.worker.js');
    console.log('[Main] Detection worker created.');

    // Send a copy of relevant config to worker.
    // performanceConfig might contain other UI related things not needed by worker.
    const workerConfig = {
        lowEndDevice: performanceConfig.lowEndDevice,
        useWasm: performanceConfig.useWasm
        // Add any other worker-specific config from performanceConfig here
    };
    detectionWorker.postMessage({ type: 'init', config: workerConfig });
    console.log('[Main] Sent init message to worker with config:', workerConfig);

    detectionWorker.onmessage = (event) => {
        const { type, detections, message, id } = event.data;
        // console.log('[Main] Received message from worker:', event.data); // For debugging

        if (type === 'models_loaded') {
            console.log('[Main] Worker reported models loaded.');
            statusDisplay.textContent = 'Модели загружены. Готово к работе!';
            statusDisplay.className = 'verified';
            startButton.disabled = false;
        } else if (type === 'detection_result') {
            if (id) { // End profiling timer for this frame
                console.timeEnd(`[Main] frameProcessingTime_${id}`);
            }

            if (!detections || detections.length === 0) {
                if (!isAgeStableForConfirmation) {
                    averageAgeDisplay.textContent = '-';
                    // Only update status if not showing a critical error or model loading message
                    if (statusDisplay.className !== 'error' && !startButton.disabled) {
                         // statusDisplay.textContent = 'Лицо не обнаружено. Посмотрите в камеру.';
                         // statusDisplay.className = 'error'; // This might be too aggressive
                    }
                    confirmAgeButton.disabled = true;
                    currentBestFaceId = null;
                }
                // Clear old box if no face for a while
                if (faceDetectionData && Date.now() - faceDetectionData.lastDetectionTime > 2000) { // Reduced time a bit
                    faceDetectionData.faceBox = null; 
                }
                return;
            }

            const bestDetection = getBestDetection(detections);
            if (!bestDetection) return;

            const faceId = getFaceId(bestDetection.detection.box); // Pass the box to getFaceId
            const processedAge = smoothAge(faceId, Math.round(bestDetection.age));
            const faceData = faceAgeHistory.get(faceId);

            if (!faceDetectionData) { // Initialize if null
                faceDetectionData = { lastDetectionTime: 0, faceBox: null, faceId: null, age: null, isStable: false };
            }

            faceDetectionData.lastDetectionTime = Date.now();
            faceDetectionData.faceBox = bestDetection.detection.box;
            faceDetectionData.faceId = faceId; // Store current faceId
            faceDetectionData.age = processedAge; // Store smoothed age for rendering
            faceDetectionData.isStable = faceData ? faceData.isStable : false;

            if (faceData && faceData.isStable) {
                currentBestFaceId = faceId;
                isAgeStableForConfirmation = true;
                confirmAgeButton.disabled = false;
                statusDisplay.textContent = 'Возраст определен. Нажмите "Подтвердить возраст"';
                statusDisplay.className = 'ready-for-confirmation';
                averageAgeDisplay.textContent = processedAge;
            } else if (!isAgeStableForConfirmation) {
                confirmAgeButton.disabled = true;
                currentBestFaceId = null; // Reset if current face not stable
                averageAgeDisplay.textContent = '-';
                if (statusDisplay.className !== 'error' && !startButton.disabled ) { // Check startButton to avoid overwriting model loading message
                    statusDisplay.textContent = 'Определение возраста...';
                    statusDisplay.className = 'scanning';
                }
            }
            cleanupAgeHistory();

        } else if (type === 'error') {
            console.error('[Main] Worker Error (frame ' + id + '):', message);
            statusDisplay.textContent = 'Ошибка в Worker: ' + message;
            statusDisplay.className = 'error';
            // startButton.disabled = true; // Maybe too disruptive for non-fatal worker errors
        }
    };

    detectionWorker.onerror = (error) => {
        console.error('[Main] Uncaught Worker Error:', error);
        statusDisplay.textContent = 'Критическая ошибка Worker. Обновите страницу.';
        statusDisplay.className = 'error';
        startButton.disabled = true;
        if (stream) {
            stopWebcam();
        }
    };
}


window.onload = async () => {
    console.log('[Main] Инициализация приложения...');
    statusDisplay.textContent = 'Анализ устройства и загрузка библиотек...'; // Initial status
    startButton.disabled = true;

    // Default to high-performance for non-mobile, can be overridden by checkDevicePerformance
    if (!/Mobi|Android/i.test(navigator.userAgent)) {
        performanceConfig.forceHighPerformance = true;
         console.log('[Main] По умолчанию установлен режим высокой производительности для десктопа.');
    }


    checkDevicePerformance(); // This will apply low-end settings if needed

    // TF.js and Face-API.js library checks (assuming they are loaded by index.html script tags)
    if (!tf) {
        console.error('TensorFlow.js не загружен!');
        statusDisplay.textContent = 'Ошибка TensorFlow.js';
        alert('Ошибка: не удалось загрузить библиотеку TensorFlow.js.');
        return;
    }
    console.log('[Main] TensorFlow.js загружен, версия:', tf.version);

    if (!faceapi) {
        console.error('Face-API.js не загружен!');
        statusDisplay.textContent = 'Ошибка Face-API.js';
        alert('Ошибка: не удалось загрузить библиотеку Face-API.js. Перезагрузите страницу.');
        return;
    }
    console.log('[Main] Face-API.js загружен');
    
    // Backend setup is now primarily handled by the worker based on its config.
    // Main thread might set a preferred backend if TF is used here for other things,
    // but for face-api in worker, worker's own setup is key.
    // We can still log the main thread's backend for info.
    try {
        if (performanceConfig.useWasm) {
            await tf.setBackend('wasm');
        } else {
            await tf.setBackend('webgl');
        }
        await tf.ready();
        console.log('[Main] TensorFlow бэкенд инициализирован на основной странице:', tf.getBackend());
    } catch (backendError) {
        console.error('[Main] Ошибка установки бэкенда на основной странице:', backendError);
    }

    initializeWorker(); // Initialize worker, it will load models and enable startButton

    updatePerformanceModeUI(); // Update UI for performance mode display

    // Add performance toggle button (already in original code)
    const toggleButton = document.createElement('button');
    toggleButton.id = 'togglePerformanceButton';
    toggleButton.textContent = 'Переключить режим производительности';
    toggleButton.className = 'performance-button';
    const controlsElement = document.querySelector('.controls');
    if (controlsElement) {
        controlsElement.appendChild(toggleButton);
    } else {
        document.body.appendChild(toggleButton);
    }
    toggleButton.addEventListener('click', () => {
        togglePerformanceMode();
    });
};


async function startWebcam() {
    if (startButton.disabled) {
        console.warn('[Main] Start button is disabled, worker might not be ready or models not loaded.');
        statusDisplay.textContent = 'Модели еще не загружены или Worker не готов. Пожалуйста, подождите.';
        if (!detectionWorker) {
            console.log('[Main] Worker not found, re-initializing.');
            initializeWorker(); // Attempt to re-init if worker is missing
        }
        return;
    }

    try {
        if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
            console.warn('[Main] Для доступа к веб-камере рекомендуется использовать HTTPS');
            // alert('Для доступа к веб-камере рекомендуется использовать HTTPS протокол.'); // Can be annoying
        }

        statusDisplay.textContent = 'Запуск камеры...';
        console.log('[Main] Запрос доступа к веб-камере с настройками:', performanceConfig.videoConstraints);

        const constraints = {
            audio: false,
            video: JSON.parse(JSON.stringify(performanceConfig.videoConstraints)) // Deep copy
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[Main] Доступ к веб-камере получен');

        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play().then(() => {
                console.log('[Main] Веб-камера запущена, разрешение:', video.videoWidth, 'x', video.videoHeight);
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                startButton.disabled = true;
                stopButton.disabled = false;
                calibrateButton.disabled = false;
                confirmAgeButton.disabled = true; // Reset on start
                currentBestFaceId = null;
                isAgeStableForConfirmation = false;
                
                statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
                statusDisplay.className = 'instructions';
                ageVerdictDisplay.textContent = 'Определение возраста..';
                ageVerdictDisplay.className = 'age-verdict waiting';
                
                faceDetectionData = { // Reset face data
                    lastDetectionTime: 0,
                    faceBox: null,
                    faceId: null,
                    age: null,
                    isStable: false
                };
                
                startRenderLoop(); // Start rendering loop

                if (detectionInterval) clearInterval(detectionInterval); // Clear any existing interval
                detectionInterval = setInterval(sendFrameToWorker, performanceConfig.detectionInterval);
                console.log('[Main] Interval set for sendFrameToWorker every', performanceConfig.detectionInterval, 'ms');

            }).catch(playError => {
                console.error('[Main] Ошибка воспроизведения видео:', playError);
                statusDisplay.textContent = 'Ошибка воспроизведения видео.';
                statusDisplay.className = 'error';
            });
        };
         video.onerror = (e) => {
            console.error('[Main] Ошибка элемента video:', e);
            statusDisplay.textContent = 'Ошибка камеры. Проверьте доступ и настройки.';
            statusDisplay.className = 'error';
        };

    } catch (error) {
        console.error('[Main] Ошибка доступа к веб-камере:', error);
        statusDisplay.textContent = 'Ошибка камеры: ' + error.message;
        statusDisplay.className = 'error';
        // alert('Не удалось получить доступ к веб-камере: ' + error.name + " - " + error.message);
    }
}

function stopWebcam() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
        console.log('[Main] Detection interval cleared.');
    }
    if (animationFrameId) { // Stop rendering loop
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (detectionWorker) {
        detectionWorker.terminate();
        detectionWorker = null;
        console.log('[Main] Detection worker terminated.');
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        console.log('[Main] Веб-камера остановлена');
    }
    
    startButton.disabled = false; // Allow restarting
    stopButton.disabled = true;
    calibrateButton.disabled = true;
    confirmAgeButton.disabled = true;
    
    currentBestFaceId = null;
    isAgeStableForConfirmation = false;
    
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceDetectionData = null; // Clear data
    
    statusDisplay.textContent = 'Камера остановлена';
    statusDisplay.className = '';
    averageAgeDisplay.textContent = '-';
    ageVerdictDisplay.textContent = '';
    ageVerdictDisplay.className = 'age-verdict';
}

function sendFrameToWorker() {
    if (!detectionWorker || !video || video.readyState < video.HAVE_METADATA || video.paused || video.ended) {
        return;
    }
    try {
        frameDetectId++; // Increment frame ID for profiling
        console.time(`[Main] frameProcessingTime_${frameDetectId}`);

        if (typeof createImageBitmap !== 'undefined') {
            createImageBitmap(video)
                .then(videoFrameBitmap => {
                    if (detectionWorker) { // Check worker again in async callback
                        detectionWorker.postMessage({ type: 'detect', videoFrameBitmap: videoFrameBitmap, id: frameDetectId }, [videoFrameBitmap]);
                    } else {
                        videoFrameBitmap.close(); // Clean up if worker disappeared
                        console.timeEnd(`[Main] frameProcessingTime_${frameDetectId}`); // End time if not sending
                    }
                })
                .catch(err => {
                    console.error('[Main] Error creating VideoFrameBitmap:', err);
                    console.timeEnd(`[Main] frameProcessingTime_${frameDetectId}`); // End time on error
                    sendFrameAsImageData(frameDetectId); // Fallback, pass ID
                });
        } else {
            sendFrameAsImageData(frameDetectId); // Fallback, pass ID
        }
    } catch (error) {
        console.error('[Main] Error in sendFrameToWorker:', error);
        console.timeEnd(`[Main] frameProcessingTime_${frameDetectId}`); // End time on error
        if (detectionWorker) {
            detectionWorker.postMessage({ type: 'error', message: '[Main] sendFrameToWorker Error: ' + error.message, id: frameDetectId });
        }
    }
}

function sendFrameAsImageData(currentFrameId) { // Accept frameId
    if (!detectionWorker || !video || video.readyState < video.HAVE_METADATA || video.paused || video.ended) {
        if (currentFrameId) console.timeEnd(`[Main] frameProcessingTime_${currentFrameId}`); // End time if not sending
        return;
    }
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const imageData = tempCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
        
        if (detectionWorker) {
            detectionWorker.postMessage({ type: 'detect', imageData: imageData, id: currentFrameId }, [imageData.data.buffer]);
        } else {
            if (currentFrameId) console.timeEnd(`[Main] frameProcessingTime_${currentFrameId}`);
        }
    } catch (imageDataError){
        console.error('[Main] Error in sendFrameAsImageData:', imageDataError);
        if (currentFrameId) console.timeEnd(`[Main] frameProcessingTime_${currentFrameId}`);
        if (detectionWorker) {
            detectionWorker.postMessage({ type: 'error', message: '[Main] sendFrameAsImageData Error: ' + imageDataError.message, id: currentFrameId });
        }
    }
}

function calibrateAge() {
    console.log('[Main] Перекалибровка возраста...');
    faceAgeHistory.clear();
    displayedAges.clear();
    shouldUpdateAges = true; // This flag seems to be used by smoothAge
    currentBestFaceId = null;
    isAgeStableForConfirmation = false;
    confirmAgeButton.disabled = true;
    
    statusDisplay.textContent = 'Калибровка! Смотрите прямо в камеру и не двигайтесь';
    statusDisplay.className = 'scanning instructions';
    ageVerdictDisplay.textContent = 'Идет калибровка...';
    ageVerdictDisplay.className = 'age-verdict waiting';
    
    calibrateButton.textContent = "Калибрую...";
    calibrateButton.classList.add('calibrating');
    
    setTimeout(() => {
        calibrateButton.textContent = "Перекалибровать возраст";
        calibrateButton.classList.remove('calibrating');
        if (shouldUpdateAges && statusDisplay.className.includes('scanning')) { // Check if still in calibration state
            statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
            statusDisplay.className = 'instructions';
        }
    }, 700); 
    // if (window.stableFaceBoxes) window.stableFaceBoxes.clear(); // This global var was not defined
}

function confirmAge() {
    console.log('[Main] Подтверждение возраста...');
    if (!isAgeStableForConfirmation || !currentBestFaceId) {
        console.warn('[Main] Попытка подтвердить возраст, когда он не стабилен или лицо не найдено.');
        statusDisplay.textContent = 'Возраст не зафиксирован. Попробуйте снова.';
        statusDisplay.className = 'error';
        confirmAgeButton.disabled = true;
        return;
    }

    const confirmedFaceData = faceAgeHistory.get(currentBestFaceId);
    if (!confirmedFaceData || confirmedFaceData.finalProcessedAge === null || typeof confirmedFaceData.finalProcessedAge === 'undefined') {
        console.error('[Main] Ошибка: нет данных для подтвержденного лица или возраст не обработан. FaceData:', confirmedFaceData);
        statusDisplay.textContent = 'Ошибка при получении данных о возрасте.';
        statusDisplay.className = 'error';
        // Reset state
        faceAgeHistory.clear();
        displayedAges.clear();
        currentBestFaceId = null;
        isAgeStableForConfirmation = false;
        confirmAgeButton.disabled = true;
        ageVerdictDisplay.textContent = 'Попробуйте снова';
        ageVerdictDisplay.className = 'age-verdict waiting';
        statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
        statusDisplay.className = 'instructions';
        return;
    }
    
    const finalAge = confirmedFaceData.finalProcessedAge;
    averageAgeDisplay.textContent = finalAge;
    console.log(`[Main] Возраст зафиксирован: ${finalAge} для лица ${currentBestFaceId}`);

    if (finalAge >= AGE_VERIFICATION_THRESHOLD) {
        ageVerdictDisplay.textContent = 'Продажа РАЗРЕШЕНА';
        ageVerdictDisplay.className = 'age-verdict allowed';
        statusDisplay.textContent = `Возраст: ${finalAge} - Продажа разрешена`;
        statusDisplay.className = 'verified';
        window.ageVerificationStatus = "18+";
    } else {
        ageVerdictDisplay.textContent = `Продажа ЗАПРЕЩЕНА (возраст < ${AGE_VERIFICATION_THRESHOLD})`;
        ageVerdictDisplay.className = 'age-verdict denied';
        statusDisplay.textContent = `Возраст: ${finalAge} - Продажа запрещена`;
        statusDisplay.className = 'denied';
        window.ageVerificationStatus = "Младше 18 лет";
    }
    updateAgeStatusElement(window.ageVerificationStatus); // Update the status element
    
    // Reset for next detection
    faceAgeHistory.clear();
    displayedAges.clear();
    currentBestFaceId = null;
    isAgeStableForConfirmation = false;
    confirmAgeButton.disabled = true;

    setTimeout(() => {
        if (!stopButton.disabled) { // Only reset if camera is still running
            statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
            statusDisplay.className = 'instructions';
            ageVerdictDisplay.textContent = 'Определение возраста..';
            ageVerdictDisplay.className = 'age-verdict waiting';
            averageAgeDisplay.textContent = '-';
        }
    }, 3000);
}

function updateAgeStatusElement(status) {
    let statusElement = document.getElementById('ageStatusData');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'ageStatusData';
        statusElement.style.padding = '10px';
        statusElement.style.marginTop = '10px';
        statusElement.style.border = '1px solid #ccc';
        statusElement.style.borderRadius = '4px';
        const container = document.querySelector('.stats') || document.body; // Place it within stats
        container.appendChild(statusElement);
    }
    statusElement.style.backgroundColor = status === "18+" ? '#dff0d8' : '#f2dede';
    statusElement.style.color = status === "18+" ? '#3c763d' : '#a94442';
    const timestamp = new Date().toLocaleTimeString();
    statusElement.innerHTML = `<strong>Статус проверки возраста:</strong> ${status}<br><small>Последнее обновление: ${timestamp}</small>`;
}

function smoothAge(faceId, age) {
    if (!faceAgeHistory.has(faceId)) {
        faceAgeHistory.set(faceId, {
            ages: shouldUpdateAges ? [age] : [], // Start with current age if calibrating
            lastSeen: Date.now(),
            isStable: !shouldUpdateAges, // If calibrating, not stable yet
            finalProcessedAge: shouldUpdateAges ? null : Math.round(age),
            updateCounter: 0
        });
        return Math.round(age); // Return current age immediately
    }

    const faceData = faceAgeHistory.get(faceId);
    faceData.lastSeen = Date.now();
    faceData.updateCounter = (faceData.updateCounter || 0) + 1;

    const shouldUpdateHistory = performanceConfig.lowEndDevice ? faceData.updateCounter % 3 === 0 : true;

    if ((shouldUpdateAges || faceData.ages.length < AGE_HISTORY_LENGTH) && shouldUpdateHistory) {
        faceData.ages.push(age);
        faceData.isStable = false; // Mark as not stable while collecting ages
        faceData.finalProcessedAge = null; // Reset processed age
        if (faceData.ages.length > AGE_HISTORY_LENGTH) {
            faceData.ages.shift();
        }
        if (faceData.ages.length >= AGE_HISTORY_LENGTH) {
            faceData.isStable = true; // Stable once enough ages collected
            // Check if all faces are stable to declare calibration complete
            let allFacesStable = true;
            for (const data of faceAgeHistory.values()) {
                if (!data.isStable) { allFacesStable = false; break; }
            }
            if (allFacesStable) {
                shouldUpdateAges = false; // Stop calibration mode
                console.log('[Main] Возраст стабилизирован, калибровка завершена');
                if (statusDisplay.className.includes('scanning')) { // Check if still in calibration state
                    statusDisplay.textContent = 'Возраст определен';
                    statusDisplay.className = 'verified';
                }
                if (calibrateButton.classList.contains('calibrating')) {
                    calibrateButton.textContent = "Перекалибровать возраст";
                    calibrateButton.classList.remove('calibrating');
                }
            }
        }
    } else if (!faceData.isStable && faceData.ages.length >= AGE_HISTORY_LENGTH) {
        faceData.isStable = true; // Already has enough data, mark as stable
    }

    if (faceData.ages.length > 0) {
        const smoothedAgeValue = faceData.ages.reduce((sum, val) => sum + val, 0) / faceData.ages.length;
        faceData.finalProcessedAge = Math.round(smoothedAgeValue);

        const updateDisplayThreshold = performanceConfig.lowEndDevice ? AGE_UPDATE_THRESHOLD * 2 : AGE_UPDATE_THRESHOLD;
        if (!displayedAges.has(faceId) || Math.abs(faceData.finalProcessedAge - displayedAges.get(faceId)) >= updateDisplayThreshold || (shouldUpdateAges && faceData.isStable)) {
            displayedAges.set(faceId, faceData.finalProcessedAge);
        }
        return faceData.finalProcessedAge;
    }
    
    // Fallback if ages array is empty for some reason but finalProcessedAge exists
    if (faceData.finalProcessedAge !== null) return faceData.finalProcessedAge;

    // Fallback to current age if no history
    faceData.finalProcessedAge = Math.round(age);
    return faceData.finalProcessedAge;
}

function cleanupAgeHistory() {
    const now = Date.now();
    const MAX_AGE_MS = 6000; // Keep history for faces seen in the last 6s
    for (const [faceId, faceData] of faceAgeHistory.entries()) {
        if (now - faceData.lastSeen > MAX_AGE_MS) {
            faceAgeHistory.delete(faceId);
            displayedAges.delete(faceId);
            // If the cleaned up face was the current best one, reset confirmation
            if (currentBestFaceId === faceId) {
                currentBestFaceId = null;
                isAgeStableForConfirmation = false;
                confirmAgeButton.disabled = true;
            }
        }
    }
}

function startRenderLoop() {
    let lastRenderTime = 0;
    function renderFrame(timestamp) {
        animationFrameId = requestAnimationFrame(renderFrame); // Request next frame first

        // const deltaTime = timestamp - lastRenderTime; // Unused
        // lastRenderTime = timestamp;

        if (!ctx) return; // Ensure canvas context is available

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (faceDetectionData && faceDetectionData.faceBox && video.readyState >= video.HAVE_CURRENT_DATA && !video.paused) {
            const box = faceDetectionData.faceBox;
            const x = Math.round(box.x);
            const y = Math.round(box.y);
            const width = Math.round(box.width);
            const height = Math.round(box.height);

            if (performanceConfig.skipEffects) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#0077ff';
                ctx.strokeRect(x, y, width, height);
            } else {
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
                ctx.strokeRect(x, y, width, height);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
            }

            if (faceDetectionData.age !== null) {
                const ageToDisplay = faceDetectionData.age; // Already smoothed
                const isStable = faceDetectionData.isStable;
                const textSize = performanceConfig.skipEffects ? 14 : Math.max(14, Math.min(Math.round(width) / 4, 20));
                ctx.font = `bold ${textSize}px Arial`;
                
                const textYPosition = y - 10 > 0 ? y - 10 : y + textSize + 15;
                const text = isStable ? `Возраст: ${ageToDisplay}` : 'Определение...';
                
                if (performanceConfig.skipEffects) {
                    ctx.fillStyle = isStable ? '#00FF00' : '#FFA500';
                    ctx.fillText(text, x + 5, textYPosition);
                } else {
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(x + 5, textYPosition - textSize - 2, textWidth + 10, textSize + 8);
                    ctx.fillStyle = isStable ? '#00FF00' : '#FFA500';
                    ctx.fillText(text, x + 10, textYPosition);
                }
            }
        }
    }
    if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel previous if any
    animationFrameId = requestAnimationFrame(renderFrame);
}

const FACE_POSITION_TOLERANCE = 10; // Define at global scope for getFaceId
function getFaceId(box) { // Takes a box object
    if (!box) return 'unknown';
    return `${Math.round(box.x / FACE_POSITION_TOLERANCE)}-${Math.round(box.y / FACE_POSITION_TOLERANCE)}`;
}

function getBestDetection(detections) {
    if (!detections || detections.length === 0) return null;
    return detections.reduce((best, current) => {
        const currentArea = current.detection.box.width * current.detection.box.height;
        const bestArea = best.detection.box.width * best.detection.box.height;
        return currentArea > bestArea ? current : best;
    }, detections[0]);
}

// Event Listeners for buttons
startButton.addEventListener('click', startWebcam);
stopButton.addEventListener('click', stopWebcam);
calibrateButton.addEventListener('click', calibrateAge);
confirmAgeButton.addEventListener('click', confirmAge);

console.log('[Main] Обработчики событий кнопок установлены');

// Styles for reload/load buttons are now in styles.css or removed if buttons aren't used
// The performance toggle button is added in window.onload

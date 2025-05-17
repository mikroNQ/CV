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

// Конфигурация производительности
const performanceConfig = {
    lowEndDevice: false,         // Флаг низкопроизводительного устройства
    detectionInterval: 100,      // Интервал детекции в мс (по умолчанию)  
    videoConstraints: {          // Настройки видео
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"       // Добавляем выбор фронтальной камеры
    },
    useWasm: false,              // Использовать WASM вместо WebGL
    skipEffects: false,          // Пропускать визуальные эффекты
    forceHighPerformance: false  // Принудительный режим высокой производительности
};

// Добавим отображение режима производительности в UI
function updatePerformanceModeUI() {
    // Находим или создаем элемент для отображения режима
    let modeDisplay = document.getElementById('performanceModeDisplay');
    if (!modeDisplay) {
        modeDisplay = document.createElement('div');
        modeDisplay.id = 'performanceModeDisplay';
        modeDisplay.className = 'performance-mode-display';
        
        // Добавляем после статистики
        const statsElement = document.querySelector('.stats');
        if (statsElement) {
            statsElement.parentNode.insertBefore(modeDisplay, statsElement.nextSibling);
        } else {
            document.body.appendChild(modeDisplay);
        }
    }
    
    // Обновляем текст и стиль
    modeDisplay.textContent = performanceConfig.lowEndDevice ? 
        '📱 Режим низкой производительности' : '🖥️ Режим высокой производительности';
    modeDisplay.className = performanceConfig.lowEndDevice ? 
        'performance-mode-display low-mode' : 'performance-mode-display high-mode';
}

// Проверка производительности устройства
function checkDevicePerformance() {
    // Проверяем, есть ли сохраненный режим в localStorage
    try {
        const savedMode = localStorage.getItem('age-verification-performance-mode');
        if (savedMode === 'high') {
            performanceConfig.forceHighPerformance = true;
            console.log('Использование сохранённого режима высокой производительности');
        } else if (savedMode === 'low') {
            performanceConfig.forceHighPerformance = false;
            performanceConfig.lowEndDevice = true;
            console.log('Использование сохранённого режима низкой производительности');
            document.body.classList.add('low-end');
            applyLowEndSettings();
            return performanceConfig;
        }
    } catch (e) {
        console.warn('Ошибка при чтении сохранённого режима:', e);
    }
    
    // Если принудительно включен режим высокой производительности, пропускаем проверку
    if (performanceConfig.forceHighPerformance) {
        performanceConfig.lowEndDevice = false;
        document.body.classList.remove('low-end');
        return performanceConfig;
    }
    
    // Проверка поддержки WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const hasStrongWebGL = gl && gl.getExtension('WEBGL_depth_texture');
    
    // Проверка количества логических процессоров
    const cpuCores = navigator.hardwareConcurrency || 1;
    
    // Более мягкие критерии для определения слабого устройства
    // Для ноутбуков требуем совпадения обоих факторов
    performanceConfig.lowEndDevice = !hasStrongWebGL && cpuCores <= 2;
    
    if (performanceConfig.lowEndDevice) {
        console.log('Обнаружено устройство с низкой производительностью, применяются оптимизации');
        applyLowEndSettings();
    } else {
        document.body.classList.remove('low-end');
    }
    
    // Добавляем отладочный вывод для проверки состояния
    console.log('Состояние устройства:', {
        forceHighPerformance: performanceConfig.forceHighPerformance,
        lowEndDevice: performanceConfig.lowEndDevice,
        useWasm: performanceConfig.useWasm,
        skipEffects: performanceConfig.skipEffects,
        detectionInterval: performanceConfig.detectionInterval,
        videoResolution: performanceConfig.videoConstraints
    });
    
    // Обновляем отображение режима в UI
    updatePerformanceModeUI();
    
    return performanceConfig;
}

// Выносим настройки режима низкой производительности в отдельную функцию
function applyLowEndSettings() {
    // Настраиваем оптимизации для слабых устройств
    performanceConfig.detectionInterval = 300;  // Реже проверяем лицо
    performanceConfig.videoConstraints = {
        width: { ideal: 320 },    // Уменьшаем разрешение видео
        height: { ideal: 240 },
        facingMode: "user"
    };
    performanceConfig.useWasm = true; // Используем WASM для слабых устройств
    performanceConfig.skipEffects = true; // Отключаем эффекты
    
    // Добавляем класс low-end к body для CSS оптимизаций
    document.body.classList.add('low-end');
}

// Функция переключения режима производительности
function togglePerformanceMode() {
    // Инвертируем режим
    performanceConfig.lowEndDevice = !performanceConfig.lowEndDevice;
    
    // Сохраняем выбор пользователя
    try {
        localStorage.setItem('age-verification-performance-mode', 
            performanceConfig.lowEndDevice ? 'low' : 'high');
    } catch (e) {
        console.warn('Не удалось сохранить режим производительности:', e);
    }
    
    if (performanceConfig.lowEndDevice) {
        // Применяем настройки для низкой производительности
        applyLowEndSettings();
        console.log('Включен режим низкой производительности');
    } else {
        // Возвращаем настройки для высокой производительности
        performanceConfig.detectionInterval = 100;
        performanceConfig.videoConstraints = {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
        };
        performanceConfig.useWasm = false;
        performanceConfig.skipEffects = false;
        document.body.classList.remove('low-end');
        console.log('Включен режим высокой производительности');
    }
    
    // Если камера уже запущена, перезапускаем её с новыми настройками
    if (stream) {
        // Останавливаем камеру
        stopWebcam();
        // И запускаем заново
        setTimeout(() => {
            startWebcam();
        }, 500);
    }
    
    // Обновляем отображение режима в UI
    updatePerformanceModeUI();
    
    return performanceConfig.lowEndDevice ? 'Режим низкой производительности' : 'Режим высокой производительности';
}

// Удаляем тестовые console.log и alert
let stream;
let detectionInterval;
let shouldUpdateAges = false;
let currentBestFaceId = null;
let isAgeStableForConfirmation = false;
let statusUpdateCounter = 0;
let animationFrameId = null;
let faceDetectionData = null;

// Добавляем переменную для хранения статуса возраста
window.ageVerificationStatus = null;

const faceAgeHistory = new Map();
const AGE_HISTORY_LENGTH = 3;
let displayedAges = new Map();
const AGE_UPDATE_THRESHOLD = 1.0;
const AGE_VERIFICATION_THRESHOLD = 18;
const LOCK_TIMER_DURATION_MS = 3000; // 3 секунды для фиксации
const FACE_POSITION_TOLERANCE = 10; // допустимое отклонение в пикселях
const AGE_DETERMINATION_TIME = 2300; // 2.3 секунды для определения возраста

const FACE_API_MODEL_URL = 'models/face_api';

// Добавляем глобальную переменную для отслеживания загруженности моделей
let modelsLoadedSuccessfully = false;

async function loadModels() {
    try {
        console.log('Загрузка локальных моделей Face API...');
        
        // Принудительно сбрасываем кэш для диагностики проблемы загрузки
        if (faceapi && faceapi.tf) {
            try {
                console.log('Попытка очистки кэша моделей faceapi');
                // Проверяем наличие метода перед вызовом
                if (faceapi.tf.engine && 
                    typeof faceapi.tf.engine === 'function' &&
                    faceapi.tf.engine().dispose && 
                    typeof faceapi.tf.engine().dispose === 'function') {
                    
                    faceapi.tf.engine().dispose();
                    console.log('Кэш TensorFlow очищен через dispose()');
                } else if (faceapi.tf.disposeVariables && 
                           typeof faceapi.tf.disposeVariables === 'function') {
                    
                    faceapi.tf.disposeVariables();
                    console.log('Кэш TensorFlow очищен через disposeVariables()');
                } else {
                    console.log('Методы очистки TensorFlow не найдены, пропускаем очистку кэша');
                }
            } catch (purgeError) {
                console.warn('Ошибка при очистке кэша:', purgeError);
            }
        }
        
        // Проверяем, есть ли модели в кэше
        const modelCacheKey = 'face-api-models-cache-v2';
        // Всегда загружаем модели для диагностики проблемы
        let shouldLoadModels = true;
        let useCachedModels = false;
        
        // Если модели были успешно загружены ранее, пропускаем проверку кэша
        if (!modelsLoadedSuccessfully) {
            try {
                // Проверяем, загружались ли модели ранее
                if (window.localStorage) {
                    const modelCache = localStorage.getItem(modelCacheKey);
                    if (modelCache) {
                        const { timestamp } = JSON.parse(modelCache);
                        // Используем кэш, если он не старше 1 дня
                        const oneDayMs = 24 * 60 * 60 * 1000;
                        shouldLoadModels = !timestamp || (Date.now() - timestamp > oneDayMs);
                        
                        if (!shouldLoadModels) {
                            console.log('Используем кэшированные модели Face API');
                            useCachedModels = true;
                        }
                    }
                }
            } catch (cacheError) {
                console.warn('Ошибка проверки кэша моделей:', cacheError);
                shouldLoadModels = true;
            }
        } else {
            console.log('Модели уже были успешно загружены');
        }
        
        // Всегда загружаем обе модели явно
        try {
            console.log('Загрузка ssdMobilenetv1...');
            console.log('Путь к модели:', FACE_API_MODEL_URL);
            
            // Проверяем доступность файлов модели через fetch
            const modelWeightUrl = `${FACE_API_MODEL_URL}/ssd_mobilenetv1_model-weights_manifest.json`;
            console.log('Проверка доступа к файлу модели:', modelWeightUrl);
            
            try {
                const checkResponse = await fetch(modelWeightUrl, {cache: 'no-store'});
                if (checkResponse.ok) {
                    console.log('Файл модели доступен, статус:', checkResponse.status);
                } else {
                    console.error('Файл модели недоступен, статус:', checkResponse.status);
                }
            } catch (fetchError) {
                console.error('Ошибка проверки доступа к файлу модели:', fetchError);
            }
            
            await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL);
            console.log('Модель ssdMobilenetv1 загружена');
        } catch (ssdError) {
            console.error('Ошибка загрузки модели ssdMobilenetv1:', ssdError);
            throw new Error('Не удалось загрузить модель распознавания лиц');
        }
        
        try {
            console.log('Загрузка ageGenderNet...');
            
            // Проверяем доступность файлов модели через fetch
            const ageModelWeightUrl = `${FACE_API_MODEL_URL}/age_gender_model-weights_manifest.json`;
            console.log('Проверка доступа к файлу модели возраста:', ageModelWeightUrl);
            
            try {
                const checkResponse = await fetch(ageModelWeightUrl, {cache: 'no-store'});
                if (checkResponse.ok) {
                    console.log('Файл модели возраста доступен, статус:', checkResponse.status);
                } else {
                    console.error('Файл модели возраста недоступен, статус:', checkResponse.status);
                }
            } catch (fetchError) {
                console.error('Ошибка проверки доступа к файлу модели возраста:', fetchError);
            }
            
            await faceapi.nets.ageGenderNet.loadFromUri(FACE_API_MODEL_URL);
            console.log('Модель ageGenderNet загружена');
        } catch (ageError) {
            console.error('Ошибка загрузки модели ageGenderNet:', ageError);
            throw new Error('Не удалось загрузить модель определения возраста');
        }
        
        // Проверяем загружены ли основные модели
        const isSsdModelLoaded = faceapi.nets.ssdMobilenetv1.isLoaded;
        const isAgeGenderModelLoaded = faceapi.nets.ageGenderNet.isLoaded;
        
        console.log('Статус загрузки моделей:', {
            ssdMobilenetv1: isSsdModelLoaded ? 'Загружена' : 'НЕ загружена',
            ageGenderNet: isAgeGenderModelLoaded ? 'Загружена' : 'НЕ загружена'
        });
        
        if (!isSsdModelLoaded) {
            throw new Error('Модель SsdMobilenetv1 не загружена');
        }
        
        if (!isAgeGenderModelLoaded) {
            throw new Error('Модель AgeGenderNet не загружена');
        }
        
        // Сохраняем метку времени в кэш при успешной загрузке
        try {
            if (window.localStorage) {
                localStorage.setItem(modelCacheKey, JSON.stringify({ 
                    timestamp: Date.now() 
                }));
            }
        } catch (setCacheError) {
            console.warn('Не удалось сохранить метку кэша моделей:', setCacheError);
        }
        
        // Устанавливаем флаг успешной загрузки моделей
        modelsLoadedSuccessfully = true;
        
        console.log('Модели Face API успешно загружены');
        startButton.disabled = false;
    } catch (error) {
        // При ошибке загрузки моделей сбрасываем флаг
        modelsLoadedSuccessfully = false;
        
        console.error('Ошибка загрузки моделей Face API:', error);
        statusDisplay.textContent = 'Ошибка загрузки моделей';
        alert('Не удалось загрузить модели для распознавания: ' + error.message);
        throw error;
    }
}

// Функция для принудительной перезагрузки моделей
async function forceReloadModels() {
    try {
        statusDisplay.textContent = 'Принудительная перезагрузка моделей...';
        
        // Очищаем кэш
        if (window.localStorage) {
            localStorage.removeItem('face-api-models-cache-v2');
        }
        
        // Принудительно очищаем кэш моделей
        if (faceapi && faceapi.tf) {
            faceapi.tf.engine().purgeUnusedBackends();
        }
        
        // Перезагружаем модели
        await loadModels();
        
        statusDisplay.textContent = 'Модели успешно перезагружены';
        return true;
    } catch (error) {
        console.error('Ошибка при принудительной перезагрузке моделей:', error);
        statusDisplay.textContent = 'Ошибка перезагрузки моделей';
        return false;
    }
}

// Обновляем функцию window.onload для обработки ошибок и добавления кнопки перезагрузки моделей
window.onload = async () => {
    console.log('Инициализация приложения...');
    console.log('ТЕСТ КОНСОЛИ: Проверка вывода в консоль');
    statusDisplay.textContent = 'Загрузка моделей...';
    startButton.disabled = true;

    // Для мощных ноутбуков установим режим высокой производительности по умолчанию
    if (navigator.userAgent.indexOf('Mac') !== -1 || 
        navigator.userAgent.indexOf('Win') !== -1) {
        performanceConfig.forceHighPerformance = true;
        console.log('Обнаружен ноутбук/десктоп, установлен режим высокой производительности по умолчанию');
    }

    // Проверка производительности устройства
    checkDevicePerformance();

    if (tf) {
        console.log('TensorFlow.js загружен, версия:', tf.version);
        
        // Настраиваем бэкенд TensorFlow в зависимости от устройства
        if (performanceConfig.useWasm) {
            console.log('Используем WASM бэкенд для TensorFlow');
            await tf.setBackend('wasm');
        } else {
            await tf.setBackend('webgl');
            console.log('TensorFlow бэкенд инициализирован:', tf.getBackend());
            
            // Оптимизируем настройки WebGL
            if (performanceConfig.lowEndDevice) {
                tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
                tf.env().set('WEBGL_PACK_DEPTHWISECONV', false);
            } else {
                tf.env().set('WEBGL_CPU_FORWARD', false);
                tf.env().set('WEBGL_PACK', false);
            }
        }
    } else {
        console.error('TensorFlow.js не загружен!');
        statusDisplay.textContent = 'Ошибка TensorFlow.js';
        alert('Ошибка: не удалось загрузить библиотеку TensorFlow.js.');
        return;
    }

    if (faceapi) {
        console.log('Face-API.js загружен');
    } else {
        console.error('Face-API.js не загружен!');
        statusDisplay.textContent = 'Ошибка Face-API.js';
        // Добавляем кнопку для перезагрузки страницы
        const reloadButton = document.createElement('button');
        reloadButton.textContent = 'Перезагрузить страницу';
        reloadButton.className = 'reload-button';
        reloadButton.onclick = () => window.location.reload();
        document.body.appendChild(reloadButton);
        
        alert('Ошибка: не удалось загрузить библиотеку Face-API.js. Перезагрузите страницу.');
        return;
    }

    try {
        await loadModels();
        statusDisplay.textContent = 'Готово к работе';
        console.log('Все модели успешно загружены, приложение готово к работе');
    } catch (error) {
        console.error('Ошибка при инициализации:', error);
        statusDisplay.textContent = 'Ошибка инициализации моделей';
        
        // Добавляем кнопку для принудительной перезагрузки моделей
        const reloadModelsButton = document.createElement('button');
        reloadModelsButton.textContent = 'Перезагрузить модели';
        reloadModelsButton.className = 'reload-button';
        reloadModelsButton.onclick = async () => {
            reloadModelsButton.disabled = true;
            reloadModelsButton.textContent = 'Перезагрузка...';
            const success = await forceReloadModels();
            
            if (success) {
                reloadModelsButton.textContent = 'Готово!';
                setTimeout(() => {
                    reloadModelsButton.remove();
                }, 2000);
            } else {
                reloadModelsButton.textContent = 'Ошибка! Попробуйте еще раз';
                reloadModelsButton.disabled = false;
            }
        };
        
        // Находим подходящее место для вставки кнопки
        const controls = document.querySelector('.controls');
        if (controls) {
            controls.prepend(reloadModelsButton);
        } else {
            document.body.prepend(reloadModelsButton);
        }
    }

    // Отображаем изначальный режим производительности
    updatePerformanceModeUI();
    
    // Добавляем кнопку для ручной загрузки моделей
    const loadModelsButton = document.createElement('button');
    loadModelsButton.textContent = 'Загрузить модели';
    loadModelsButton.className = 'load-models-button';
    loadModelsButton.style.backgroundColor = '#3498db';
    loadModelsButton.style.color = 'white';
    loadModelsButton.style.padding = '12px 20px';
    loadModelsButton.style.margin = '10px auto';
    loadModelsButton.style.display = 'block';
    loadModelsButton.style.border = 'none';
    loadModelsButton.style.borderRadius = '5px';
    loadModelsButton.style.fontWeight = 'bold';
    loadModelsButton.style.cursor = 'pointer';
    
    loadModelsButton.onclick = async () => {
        loadModelsButton.disabled = true;
        loadModelsButton.textContent = 'Загрузка моделей...';
        statusDisplay.textContent = 'Загрузка моделей...';
        
        try {
            await loadModels();
            loadModelsButton.textContent = 'Модели загружены';
            loadModelsButton.style.backgroundColor = '#27ae60';
            statusDisplay.textContent = 'Модели загружены. Можно запускать камеру';
            startButton.disabled = false;
        } catch (error) {
            console.error('Ошибка при загрузке моделей:', error);
            loadModelsButton.textContent = 'Ошибка загрузки';
            loadModelsButton.style.backgroundColor = '#e74c3c';
            loadModelsButton.disabled = false;
            statusDisplay.textContent = 'Ошибка загрузки моделей';
        }
    };
    
    // Размещаем кнопку перед кнопкой старта
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.prepend(loadModelsButton);
    } else {
        document.body.prepend(loadModelsButton);
    }
};

// Добавляем стили для кнопки перезагрузки моделей
window.addEventListener('DOMContentLoaded', function() {
    // Добавляем стили для кнопки перезагрузки
    const style = document.createElement('style');
    style.textContent = `
        .reload-button {
            background-color: #e74c3c;
            color: white;
            padding: 12px 20px;
            margin: 10px auto;
            display: block;
            border: none;
            border-radius: 5px;
            font-weight: bold;
            cursor: pointer;
        }
        
        .reload-button:hover {
            background-color: #c0392b;
        }
        
        .reload-button:disabled {
            background-color: #95a5a6;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);
});

async function startWebcam() {
    try {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            console.warn('Для доступа к веб-камере рекомендуется использовать HTTPS');
            alert('Для доступа к веб-камере рекомендуется использовать HTTPS протокол.');
        }
        
        // Сначала проверим, загружены ли модели
        if (!modelsLoadedSuccessfully || 
            !faceapi.nets.ssdMobilenetv1.isLoaded || 
            !faceapi.nets.ageGenderNet.isLoaded) {
            
            console.log('Модели не загружены, загружаем их сейчас...');
            statusDisplay.textContent = 'Загрузка моделей перед запуском камеры...';
            
            try {
                await loadModels();
                console.log('Модели успешно загружены');
            } catch (modelError) {
                console.error('Ошибка загрузки моделей:', modelError);
                statusDisplay.textContent = 'Ошибка загрузки моделей';
                alert('Не удалось загрузить модели для определения возраста. Пожалуйста, обновите страницу и попробуйте снова.');
                return;
            }
        }
        
        statusDisplay.textContent = 'Запуск камеры...';
        console.log('Запрос доступа к веб-камере...');

        // Используем настройки из конфигурации производительности
        const constraints = {
            audio: false,
            video: performanceConfig.videoConstraints
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Доступ к веб-камере получен');
        
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            startButton.disabled = true;
            stopButton.disabled = false;
            calibrateButton.disabled = false;
            confirmAgeButton.disabled = true;
            currentBestFaceId = null;
            isAgeStableForConfirmation = false;
            statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
            statusDisplay.className = 'instructions';
            ageVerdictDisplay.textContent = 'Определение возраста..';
            ageVerdictDisplay.className = 'age-verdict waiting';
            console.log('Веб-камера запущена, разрешение:', video.videoWidth, 'x', video.videoHeight);
            
            // Запускаем отдельно детекцию и рендеринг
            faceDetectionData = {
                lastDetectionTime: 0,
                faceBox: null,
                faceId: null,
                age: null,
                isStable: false
            };
            
            // Запускаем анимацию для плавного рендеринга
            startRenderLoop();
            
            // Запускаем детекцию лица в отдельном интервале с частотой, зависящей от производительности
            detectionInterval = setInterval(detectAgeAndGender, performanceConfig.detectionInterval);
        };
    } catch (error) {
        console.error('Ошибка доступа к веб-камере:', error);
        statusDisplay.textContent = 'Ошибка камеры';
        alert('Не удалось получить доступ к веб-камере.');
    }
}

function stopWebcam() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        startButton.disabled = false;
        stopButton.disabled = true;
        calibrateButton.disabled = true;
        confirmAgeButton.disabled = true;
        currentBestFaceId = null;
        isAgeStableForConfirmation = false;
        clearInterval(detectionInterval);
        
        // Останавливаем анимацию
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        faceDetectionData = null;
        
        statusDisplay.textContent = 'Камера остановлена';
        averageAgeDisplay.textContent = '-';
        ageVerdictDisplay.textContent = '';
        ageVerdictDisplay.className = 'age-verdict';
        console.log('Веб-камера остановлена');
    }
}

function calibrateAge() {
    console.log('Перекалибровка возраста...');
    faceAgeHistory.clear();
    displayedAges.clear();
    shouldUpdateAges = true;
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
        if (shouldUpdateAges) {
            statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
            statusDisplay.className = 'instructions';
        }
    }, 700); // Сокращено время калибровки
    if (window.stableFaceBoxes) {
        window.stableFaceBoxes.clear();
    }
}

function confirmAge() {
    // Убираем отладочный alert
    console.log('Подтверждение возраста...');
    if (!isAgeStableForConfirmation || !currentBestFaceId) {
        console.warn('Попытка подтвердить возраст, когда он не стабилен или лицо не найдено.');
        statusDisplay.textContent = 'Возраст не зафиксирован. Попробуйте снова.';
        statusDisplay.className = 'error';
        confirmAgeButton.disabled = true;
        return;
    }

    const confirmedFaceData = faceAgeHistory.get(currentBestFaceId);
    if (!confirmedFaceData || !confirmedFaceData.finalProcessedAge) {
        console.error('Ошибка: нет данных для подтвержденного лица или возраст не обработан.');
        statusDisplay.textContent = 'Ошибка при получении данных о возрасте.';
        statusDisplay.className = 'error';
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

    console.log(`Возраст зафиксирован: ${finalAge} для лица ${currentBestFaceId}`);

    try {
        if (finalAge >= AGE_VERIFICATION_THRESHOLD) {
            ageVerdictDisplay.textContent = 'Продажа РАЗРЕШЕНА';
            ageVerdictDisplay.className = 'age-verdict allowed';
            statusDisplay.textContent = `Возраст: ${finalAge} - Продажа разрешена`;
            statusDisplay.className = 'verified';
            
            // Сохраняем статус в глобальных переменных
            window.ageStatus = "18+";
            window.ageVerificationStatus = "18+";
            
            // Создаем или обновляем скрытый элемент для хранения статуса
            updateAgeStatusElement("18+");
            
            console.log("СТАТУС: 18+");
        } else {
            ageVerdictDisplay.textContent = `Продажа ЗАПРЕЩЕНА (возраст < ${AGE_VERIFICATION_THRESHOLD})`;
            ageVerdictDisplay.className = 'age-verdict denied';
            statusDisplay.textContent = `Возраст: ${finalAge} - Продажа запрещена`;
            statusDisplay.className = 'denied';
            
            // Сохраняем статус в глобальных переменных
            window.ageStatus = "Младше 18 лет";
            window.ageVerificationStatus = "Младше 18 лет";
            
            // Создаем или обновляем скрытый элемент для хранения статуса
            updateAgeStatusElement("Младше 18 лет");
            
            console.log("СТАТУС: Младше 18 лет");
        }
    } catch(e) {
        console.error("Ошибка при выводе статуса возраста:", e);
    }
    
    faceAgeHistory.clear();
    displayedAges.clear();
    currentBestFaceId = null;
    isAgeStableForConfirmation = false;
    confirmAgeButton.disabled = true;

    setTimeout(() => {
        statusDisplay.textContent = 'Посмотрите прямо в камеру для определения возраста';
        statusDisplay.className = 'instructions';
        ageVerdictDisplay.textContent = 'Определение возраста..';
        ageVerdictDisplay.className = 'age-verdict waiting';
        averageAgeDisplay.textContent = '-';
    }, 3000);
}

// Добавляем функцию для обновления элемента статуса возраста
function updateAgeStatusElement(status) {
    let statusElement = document.getElementById('ageStatusData');
    
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'ageStatusData';
        statusElement.style.padding = '10px';
        statusElement.style.marginTop = '10px';
        statusElement.style.border = '1px solid #ccc';
        statusElement.style.borderRadius = '4px';
        
        // Находим подходящее место для вставки элемента
        const container = document.querySelector('.age-verification-container') || document.body;
        container.appendChild(statusElement);
    }
    
    // Устанавливаем цвет фона в зависимости от статуса
    if (status === "18+") {
        statusElement.style.backgroundColor = '#dff0d8';
        statusElement.style.color = '#3c763d';
    } else {
        statusElement.style.backgroundColor = '#f2dede';
        statusElement.style.color = '#a94442';
    }
    
    // Добавляем текущую дату и время
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    
    statusElement.innerHTML = `
        <strong>Статус проверки возраста:</strong> ${status}<br>
        <small>Последнее обновление: ${timestamp}</small>
    `;
}

function smoothAge(faceId, age) {
    if (!faceAgeHistory.has(faceId)) {
        faceAgeHistory.set(faceId, {
            ages: shouldUpdateAges ? [age] : [],
            lastSeen: Date.now(),
            isStable: !shouldUpdateAges,
            finalProcessedAge: null,
            lockTimerStart: null,
            isLocked: false,
            lockedAge: null,
            lockedVerdictText: '',
            lockedVerdictClass: '',
            // Добавляем счетчик обновлений для оптимизации
            updateCounter: 0
        });
        return Math.round(age);
    }

    const faceData = faceAgeHistory.get(faceId);
    faceData.lastSeen = Date.now();
    
    // Увеличиваем счетчик обновлений
    faceData.updateCounter = (faceData.updateCounter || 0) + 1;
    
    // Для низкопроизводительных устройств обновляем данные реже
    const shouldUpdateHistory = performanceConfig.lowEndDevice ? 
        faceData.updateCounter % 3 === 0 : true;
    
    if ((shouldUpdateAges || faceData.ages.length < AGE_HISTORY_LENGTH) && shouldUpdateHistory) {
        faceData.ages.push(age);
        faceData.isStable = false;
        faceData.finalProcessedAge = null;
        faceData.lockTimerStart = null;
        faceData.isLocked = false;
        if (faceData.ages.length > AGE_HISTORY_LENGTH) {
            faceData.ages.shift();
        }
        if (faceData.ages.length >= AGE_HISTORY_LENGTH) {
            faceData.isStable = true;
            let allFacesStable = true;
            for (const data of faceAgeHistory.values()) {
                if (!data.isStable) {
                    allFacesStable = false;
                    break;
                }
            }
            if (allFacesStable) {
                shouldUpdateAges = false;
                console.log('Возраст стабилизирован, калибровка завершена');
                statusDisplay.textContent = 'Возраст определен';
                statusDisplay.className = 'verified';
                calibrateButton.textContent = "Перекалибровать возраст";
                calibrateButton.classList.remove('calibrating');
            }
        }
    } else if (!faceData.isStable && faceData.ages.length >= AGE_HISTORY_LENGTH) {
        faceData.isStable = true;
    }

    if (faceData.ages.length > 0) {
        // Для слабых устройств используем простое среднее вместо взвешенного
        const smoothedAge = faceData.ages.reduce((sum, val) => sum + val, 0) / faceData.ages.length;
        const finalAge = Math.round(smoothedAge);
        faceData.finalProcessedAge = finalAge;
        
        // На слабых устройствах обновляем отображаемый возраст реже
        const updateThreshold = performanceConfig.lowEndDevice ? AGE_UPDATE_THRESHOLD * 2 : AGE_UPDATE_THRESHOLD;
        
        if (!displayedAges.has(faceId) || 
            Math.abs(finalAge - displayedAges.get(faceId)) >= updateThreshold || 
            (shouldUpdateAges && faceData.isStable)) {
            displayedAges.set(faceId, finalAge);
        }
        return faceData.finalProcessedAge;
    }
    
    if (displayedAges.has(faceId)) {
        faceData.finalProcessedAge = displayedAges.get(faceId);
        return faceData.finalProcessedAge;
    }
    
    faceData.finalProcessedAge = Math.round(age);
    return faceData.finalProcessedAge;
}

function cleanupAgeHistory() {
    const now = Date.now();
    const MAX_AGE_MS = 6000;
    for (const [faceId, faceData] of faceAgeHistory.entries()) {
        if (now - faceData.lastSeen > MAX_AGE_MS) {
            faceAgeHistory.delete(faceId);
            displayedAges.delete(faceId);
        }
    }
}

// Функция для плавной отрисовки, независимая от детекции
function startRenderLoop() {
    // Для отслеживания времени между кадрами
    let lastRenderTime = 0;
    
    function renderFrame(timestamp) {
        // Рассчитываем дельту времени для плавной анимации
        const deltaTime = timestamp - lastRenderTime;
        lastRenderTime = timestamp;
        
        if (!faceDetectionData) {
            animationFrameId = requestAnimationFrame(renderFrame);
            return;
        }
        
        // Очищаем канвас ОДИН раз за кадр
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Если есть данные о лице и оно было замечено не более 2 секунд назад
        if (faceDetectionData && faceDetectionData.faceBox && 
            Date.now() - faceDetectionData.lastDetectionTime < 2000) {
            
            // Рисуем рамку
            const box = faceDetectionData.faceBox;
            
            // Для слабых устройств используем простую отрисовку
            if (performanceConfig.skipEffects) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#0077ff';
                
                // Округляем координаты для стабильности пикселей
                const x = Math.round(box.x);
                const y = Math.round(box.y);
                const width = Math.round(box.width);
                const height = Math.round(box.height);
                
                // Отрисовка рамки
                ctx.strokeRect(x, y, width, height);
            } else {
                // Предотвращение резких движений рамки
                // Используем более толстую линию с прозрачностью для визуальной стабильности
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
                
                // Округляем координаты для стабильности пикселей
                const x = Math.round(box.x);
                const y = Math.round(box.y);
                const width = Math.round(box.width);
                const height = Math.round(box.height);
                
                // Отрисовка рамки - делаем её более заметной
                ctx.strokeRect(x, y, width, height);
                
                // Добавляем внутреннюю рамку для более четкого вида
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
            }
            
            // Отображаем информацию о возрасте
            if (faceDetectionData.age !== null) {
                const textSize = performanceConfig.skipEffects ? 
                      14 : Math.max(14, Math.min(Math.round(box.width) / 4, 20));
                ctx.font = `${textSize}px Arial`;
                
                // Сохраняем ссылки на x и y, которые могли быть объявлены выше в блоке if/else
                const x = Math.round(box.x);
                const y = Math.round(box.y);
                const textYPosition = y - 10 > 0 ? y - 10 : y + textSize + 15;
                
                // Для слабых устройств упрощаем отображение
                if (performanceConfig.skipEffects) {
                    const text = faceDetectionData.isStable ? 
                        `Возраст: ${faceDetectionData.age}` : 'Определение...';
                        
                    ctx.fillStyle = faceDetectionData.isStable ? '#00FF00' : '#FFA500';
                    ctx.fillText(text, x + 10, textYPosition);
                } else {
                    // Добавляем фон для текста для лучшей видимости
                    const text = faceDetectionData.isStable ? 
                        `Возраст: ${faceDetectionData.age}` : 'Определение...';
                    const textWidth = ctx.measureText(text).width;
                    
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(x + 5, textYPosition - textSize, textWidth + 10, textSize + 6);
                    
                    if (faceDetectionData.isStable) {
                        ctx.fillStyle = '#00FF00';
                        ctx.fillText(`Возраст: ${faceDetectionData.age}`, x + 10, textYPosition);
                    } else {
                        ctx.fillStyle = '#FFA500';
                        ctx.fillText('Определение...', x + 10, textYPosition);
                    }
                }
            }
        }
        
        // Запрашиваем следующий кадр
        animationFrameId = requestAnimationFrame(renderFrame);
    }
    
    // Запускаем цикл отрисовки
    animationFrameId = requestAnimationFrame(renderFrame);
}

// Обновлена функция обнаружения лица без отрисовки
async function detectAgeAndGender() {
    if (video.readyState < video.HAVE_METADATA || video.paused || video.ended) {
        return;
    }

    // Проверка загруженности моделей
    if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
        console.error('Модель SsdMobilenetv1 не загружена!');
        statusDisplay.textContent = 'Ошибка: модель лица не загружена';
        
        // Пробуем загрузить модель еще раз если она не загружена
        try {
            console.log('Попытка повторной загрузки модели SsdMobilenetv1...');
            await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL);
            console.log('Модель SsdMobilenetv1 успешно загружена повторно');
            return; // Выходим, чтобы в следующем интервале проверить успешность загрузки
        } catch (e) {
            console.error('Ошибка при повторной загрузке модели SsdMobilenetv1:', e);
            clearInterval(detectionInterval);
            return;
        }
    }
    
    if (!faceapi.nets.ageGenderNet.isLoaded) {
        console.error('Модель AgeGenderNet не загружена!');
        statusDisplay.textContent = 'Ошибка: модель возраста не загружена';
        
        // Пробуем загрузить модель еще раз если она не загружена
        try {
            console.log('Попытка повторной загрузки модели AgeGenderNet...');
            await faceapi.nets.ageGenderNet.loadFromUri(FACE_API_MODEL_URL);
            console.log('Модель AgeGenderNet успешно загружена повторно');
            return; // Выходим, чтобы в следующем интервале проверить успешность загрузки
        } catch (e) {
            console.error('Ошибка при повторной загрузке модели AgeGenderNet:', e);
            clearInterval(detectionInterval);
            return;
        }
    }

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    // Настройка параметров детекции в зависимости от производительности устройства
    const detectionOptions = new faceapi.SsdMobilenetv1Options({ 
        minConfidence: performanceConfig.lowEndDevice ? 0.4 : 0.5, // Снижаем порог для слабых устройств
        maxResults: 1 // Ограничиваем количество обнаруживаемых лиц для экономии ресурсов
    });

    try {
        // Применяем семплирование для слабых устройств - уменьшаем входное изображение
        let detectInput = video;
        
        if (performanceConfig.lowEndDevice) {
            // Создаем canvas с пониженным разрешением для уменьшения нагрузки
            const sampleCanvas = document.createElement('canvas');
            const sampleCtx = sampleCanvas.getContext('2d');
            
            // Уменьшаем в 2 раза для анализа
            sampleCanvas.width = video.videoWidth / 2;
            sampleCanvas.height = video.videoHeight / 2;
            
            // Рисуем видео в уменьшенном размере
            sampleCtx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
            
            // Используем уменьшенное изображение для детекции
            detectInput = sampleCanvas;
        }
        
        const detectionsWithAgeAndGender = await faceapi.detectAllFaces(detectInput, detectionOptions)
            .withAgeAndGender();
            
        // Если используем уменьшенное изображение, корректируем координаты
        if (performanceConfig.lowEndDevice && detectionsWithAgeAndGender.length > 0) {
            detectionsWithAgeAndGender.forEach(detection => {
                const box = detection.detection.box;
                box.x *= 2;
                box.y *= 2;
                box.width *= 2;
                box.height *= 2;
            });
        }

        // Если нет лиц - обновляем интерфейс
        if (detectionsWithAgeAndGender.length === 0) {
            // Если нет лиц в кадре больше 3 секунд - сбрасываем состояние UI
            if (!faceDetectionData || Date.now() - faceDetectionData.lastDetectionTime > 3000) {
                if (!isAgeStableForConfirmation) {
                    averageAgeDisplay.textContent = '-';
                    statusDisplay.textContent = 'Лицо не обнаружено. Посмотрите в камеру.';
                    statusDisplay.className = 'error';
                    confirmAgeButton.disabled = true;
                    currentBestFaceId = null;
                }
            }
            return;
        }
        
        // Выбираем лучшее лицо для отображения
        const bestDetection = getBestDetection(detectionsWithAgeAndGender);
        if (!bestDetection) return;
        
        // Получаем ID лица и обрабатываем возраст
        const faceId = getFaceId(bestDetection);
        const processedAge = smoothAge(faceId, Math.round(bestDetection.age));
        const faceData = faceAgeHistory.get(faceId);
        
        // Обновляем данные для отрисовки
        if (!faceDetectionData) {
            faceDetectionData = {
                lastDetectionTime: Date.now(),
                faceBox: bestDetection.detection.box,
                faceId: faceId,
                age: processedAge,
                isStable: faceData ? faceData.isStable : false
            };
        } else {
            // Плавное сглаживание положения рамки
            if (faceDetectionData.faceBox) {
                const currentBox = faceDetectionData.faceBox;
                const newBox = bestDetection.detection.box;
                
                // Адаптивное сглаживание с учетом скорости движения и производительности устройства
                // Вычисляем расстояние между текущим и новым положением
                const dx = Math.abs(currentBox.x - newBox.x);
                const dy = Math.abs(currentBox.y - newBox.y);
                const distance = Math.sqrt(dx*dx + dy*dy);
                
                // Для слабых устройств делаем меньше плавности, но больше производительности
                let alpha = performanceConfig.lowEndDevice ? 0.5 : 0.3; // Базовое значение
                
                // Быстрая реакция на большие перемещения
                if (distance > 20) {
                    alpha = performanceConfig.lowEndDevice ? 0.8 : 0.5;  // Быстрое следование при резком движении
                } else if (distance > 5) {
                    alpha = performanceConfig.lowEndDevice ? 0.6 : 0.4;  // Средняя скорость для умеренного движения
                } else if (performanceConfig.lowEndDevice) {
                    alpha = 0.5;  // Для слабых устройств меньше сглаживания при малых движениях
                } else {
                    alpha = 0.2;  // Стабильность при небольших изменениях
                }
                
                // Обновляем положение рамки с учетом адаптивного сглаживания
                faceDetectionData.faceBox = {
                    x: currentBox.x * (1 - alpha) + newBox.x * alpha,
                    y: currentBox.y * (1 - alpha) + newBox.y * alpha,
                    width: currentBox.width * (1 - alpha) + newBox.width * alpha,
                    height: currentBox.height * (1 - alpha) + newBox.height * alpha
                };
            } else {
                faceDetectionData.faceBox = bestDetection.detection.box;
            }
            
            faceDetectionData.lastDetectionTime = Date.now();
            faceDetectionData.faceId = faceId;
            faceDetectionData.age = processedAge;
            faceDetectionData.isStable = faceData ? faceData.isStable : false;
        }
        
        // Обновляем интерфейс для подтверждения возраста
        if (faceData && faceData.isStable) {
            currentBestFaceId = faceId;
            isAgeStableForConfirmation = true;
            confirmAgeButton.disabled = false;
            statusDisplay.textContent = 'Возраст определен. Нажмите "Подтвердить возраст"';
            statusDisplay.className = 'ready-for-confirmation';
            
            averageAgeDisplay.textContent = processedAge;
        } else if (!isAgeStableForConfirmation) {
            confirmAgeButton.disabled = true;
            currentBestFaceId = null;
            averageAgeDisplay.textContent = '-';
            if (statusDisplay.className !== 'error') {
                statusDisplay.textContent = 'Определение возраста...';
                statusDisplay.className = 'scanning';
            }
        }
        
        cleanupAgeHistory();
    } catch (error) {
        console.error('Ошибка в обнаружении лица:', error);
        // Пропускаем ошибку, просто продолжим на следующем кадре
    }
}

// Вспомогательная функция для получения ID лица на основе его положения
function getFaceId(detection) {
    const { x, y } = detection.detection.box;
    return `${Math.round(x / FACE_POSITION_TOLERANCE)}-${Math.round(y / FACE_POSITION_TOLERANCE)}`;
}

// Вспомогательная функция для выбора лучшего лица (с наибольшей площадью)
function getBestDetection(detections) {
    if (detections.length === 0) return null;
    
    return detections.reduce((best, current) => {
        const currentArea = current.detection.box.width * current.detection.box.height;
        const bestArea = best.detection.box.width * best.detection.box.height;
        return currentArea > bestArea ? current : best;
    }, detections[0]);
}

startButton.addEventListener('click', startWebcam);
stopButton.addEventListener('click', stopWebcam);
calibrateButton.addEventListener('click', calibrateAge);
confirmAgeButton.addEventListener('click', confirmAge);

console.log('Обработчики событий кнопок установлены');

// Добавим эту кнопку в HTML через JavaScript для обратной совместимости
window.addEventListener('DOMContentLoaded', function() {
    // Создаём кнопку для переключения режима
    const toggleButton = document.createElement('button');
    toggleButton.id = 'togglePerformanceButton';
    toggleButton.textContent = 'Переключить режим производительности';
    toggleButton.className = 'performance-button';
    
    // Добавляем кнопку после основных кнопок
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.appendChild(toggleButton);
    } else {
        document.body.appendChild(toggleButton);
    }
    
    // Добавляем обработчик события клика
    toggleButton.addEventListener('click', function() {
        const newMode = togglePerformanceMode();
        alert('Переключено: ' + newMode);
    });
});


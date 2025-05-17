const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const calibrateButton = document.getElementById('calibrateButton');
const faceCountDisplay = document.getElementById('faceCount');
const personCountDisplay = document.getElementById('personCount');
const averageAgeDisplay = document.getElementById('averageAge');

let stream;
let detectionInterval;
let shouldUpdateAges = false; // Флаг для обновления возрастов

// Словарь для хранения скользящих средних значений возраста по ID лица
const faceAgeHistory = new Map();
// Количество кадров для усреднения
const AGE_HISTORY_LENGTH = 7; // Увеличено для большего сглаживания
let displayedAges = new Map(); // Карта для хранения последнего отображенного возраста для каждого лица
const AGE_UPDATE_THRESHOLD = 1.5; // Порог изменения возраста для обновления на экране (в годах)

// Путь к моделям face-api.js
const FACE_API_MODEL_URL = 'models/face_api'; // Путь к локальной модели

// Путь к модели coco-ssd
const COCO_SSD_MODEL_URL = 'models/coco_ssd/model.json'; // Путь к локальной модели SSDLite

// Загрузка моделей
async function loadModels() {
    try {
        console.log('Загрузка локальных моделей Face API...');
        // Загрузка моделей для face-api.js
        await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(FACE_API_MODEL_URL);
        console.log('Модели Face API успешно загружены');
        
        console.log('Загрузка локальной модели COCO-SSD...');
        // Загрузка модели COCO-SSD для распознавания объектов
        try {
            // Явно указываем базовую модель и полный путь к файлу модели
            const cocoSsdModel = await cocoSsd.load({
                base: 'lite_mobilenet_v2',
                modelUrl: COCO_SSD_MODEL_URL
            });
            console.log('Модель COCO-SSD успешно загружена');
            startButton.disabled = false; // Активируем кнопку после загрузки моделей
            return { cocoSsdModel };
        } catch (cocoError) {
            console.error('Ошибка загрузки модели COCO-SSD:', cocoError);
            console.error('Подробная информация:', JSON.stringify(cocoError));
            alert('Не удалось загрузить модель COCO-SSD. Проверьте консоль для деталей.');
            throw cocoError;
        }
    } catch (error) {
        console.error('Ошибка загрузки моделей:', error);
        alert('Не удалось загрузить модели для распознавания. Проверьте консоль для деталей.');
        throw error;
    }
}

// Глобальная переменная для хранения загруженной модели COCO-SSD
let cocoModel;

// Инициализация: загрузка моделей при загрузке страницы
window.onload = async () => {
    console.log('Инициализация приложения...');
    startButton.disabled = true; // Делаем кнопку неактивной до загрузки моделей
    
    // Проверка TensorFlow
    if (tf) {
        console.log('TensorFlow.js загружен, версия:', tf.version);
        
        // Явная инициализация бэкенда TensorFlow.js
        await tf.setBackend('webgl');
        console.log('TensorFlow бэкенд инициализирован:', tf.getBackend());
        
        // Настройка для лучшей совместимости между face-api.js и coco-ssd
        tf.env().set('WEBGL_CPU_FORWARD', false);
        tf.env().set('WEBGL_PACK', false);
    } else {
        console.error('TensorFlow.js не загружен!');
        alert('Ошибка: не удалось загрузить библиотеку TensorFlow.js.');
        return;
    }
    
    // Проверка Face-API
    if (faceapi) {
        console.log('Face-API.js загружен');
    } else {
        console.error('Face-API.js не загружен!');
        alert('Ошибка: не удалось загрузить библиотеку Face-API.js.');
        return;
    }
    
    try {
        console.log('Загрузка моделей...');
        const models = await loadModels();
        cocoModel = models.cocoSsdModel;
        console.log('Все модели успешно загружены, приложение готово к работе');
    } catch (error) {
        console.error('Ошибка при инициализации:', error);
        alert('Произошла ошибка при загрузке моделей: ' + error.message);
    }
};

// Запуск веб-камеры
async function startWebcam() {
    try {
        // Проверка протокола (безопасность)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            console.warn('Для доступа к веб-камере рекомендуется использовать HTTPS');
            alert('Для доступа к веб-камере рекомендуется использовать HTTPS протокол. На некоторых браузерах доступ к камере может быть заблокирован.');
        }
        
        console.log('Запрос доступа к веб-камере...');
        
        // Детальные настройки для камеры с учётом macOS
        const constraints = {
            audio: false,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user" // Фронтальная камера
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Доступ к веб-камере получен:', stream);
        
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            startButton.disabled = true;
            stopButton.disabled = false;
            calibrateButton.disabled = false; // Активируем кнопку калибровки при запуске камеры
            console.log('Веб-камера запущена, разрешение:', video.videoWidth, 'x', video.videoHeight);
            
            // Запускаем детекцию с регулируемым интервалом
            const detectionIntervalMs = 400; // Увеличен интервал между анализами
            detectionInterval = setInterval(detectObjects, detectionIntervalMs); 
        };
    } catch (error) {
        console.error('Ошибка доступа к веб-камере:', error);
        alert('Не удалось получить доступ к веб-камере. Убедитесь, что вы предоставили разрешение и что камера не используется другим приложением.');
    }
}

// Остановка веб-камеры
function stopWebcam() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        startButton.disabled = false;
        stopButton.disabled = true;
        calibrateButton.disabled = true; // Деактивируем кнопку калибровки при остановке камеры
        clearInterval(detectionInterval);
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Очищаем канвас
        faceCountDisplay.textContent = '0';
        personCountDisplay.textContent = '0';
        console.log('Веб-камера остановлена');
    }
}

// Функция перекалибровки возраста - очищает историю и запускает обновление
function calibrateAge() {
    console.log('Перекалибровка возраста...');
    // Очищаем всю историю возрастов
    faceAgeHistory.clear();
    displayedAges.clear(); // Очищаем также отображаемые возрасты
    // Устанавливаем флаг для обновления возрастов
    shouldUpdateAges = true;
    
    // Визуальная индикация процесса калибровки
    calibrateButton.textContent = "Калибрую...";
    calibrateButton.classList.add('calibrating');
    
    console.log('История возрастов очищена, начинаем новый сбор данных');
    
    // Возвращаем текст кнопки через 2 секунды
    setTimeout(() => {
        calibrateButton.textContent = "Перекалибровать возраст";
        calibrateButton.classList.remove('calibrating');
    }, 2000);
}

// Стабилизация значений возраста с помощью скользящего среднего
function smoothAge(faceId, age) {
    if (!faceAgeHistory.has(faceId)) {
        // Если лицо новое и идет калибровка, начинаем сбор данных для него
        faceAgeHistory.set(faceId, { ages: shouldUpdateAges ? [age] : [], lastSeen: Date.now(), isStable: !shouldUpdateAges });
        return Math.round(age); // Округляем возраст здесь
    }
    
    const faceData = faceAgeHistory.get(faceId);
    faceData.lastSeen = Date.now();
    
    // Добавляем новое значение возраста только если включен режим обновления или история неполная
    if (shouldUpdateAges || faceData.ages.length < AGE_HISTORY_LENGTH) {
        faceData.ages.push(age);
        faceData.isStable = false; // Сбрасываем стабильность при добавлении новых данных
        
        // Ограничиваем размер истории
        if (faceData.ages.length > AGE_HISTORY_LENGTH) {
            faceData.ages.shift();
        }
        
        // Если достигли нужного количества кадров, отмечаем как стабильное
        if (faceData.ages.length >= AGE_HISTORY_LENGTH) {
            faceData.isStable = true;
            // Проверяем, все ли текущие лица стабилизированы
            let allFacesStable = true;
            for (const data of faceAgeHistory.values()) {
                if (!data.isStable) {
                    allFacesStable = false;
                    break;
                }
            }
            if (allFacesStable) {
                shouldUpdateAges = false;
                console.log('Все возрасты стабилизированы, калибровка завершена');
                calibrateButton.textContent = "Перекалибровать возраст";
                calibrateButton.classList.remove('calibrating');
            }
        }
    } else if (!faceData.isStable && faceData.ages.length >= AGE_HISTORY_LENGTH) {
        // Если калибровка не идет, но история полная, считаем стабильным
        faceData.isStable = true;
    }
    
    // Вычисляем среднее значение возраста, если есть данные
    if (faceData.ages.length > 0) {
      const smoothedAge = faceData.ages.reduce((sum, val) => sum + val, 0) / faceData.ages.length;
      const finalAge = Math.round(smoothedAge); // Округляем до ближайшего целого
      
      // Обновляем отображаемый возраст только если изменение превышает порог или это первая калибровка
      if (!displayedAges.has(faceId) || Math.abs(finalAge - displayedAges.get(faceId)) >= AGE_UPDATE_THRESHOLD || (shouldUpdateAges && faceData.isStable)) {
          displayedAges.set(faceId, finalAge);
      }
      return displayedAges.get(faceId);
    }
    // Возвращаем предыдущее отображенное значение, если нет новых данных или оно не изменилось значительно
    if (displayedAges.has(faceId)) {
        return displayedAges.get(faceId);
    }
    return Math.round(age); // Округляем возраст и здесь, если другие условия не сработали
}

// Очистка старых записей в истории
function cleanupAgeHistory() {
    const now = Date.now();
    const MAX_AGE_MS = 5000; // 5 секунд
    
    for (const [faceId, faceData] of faceAgeHistory.entries()) {
        if (now - faceData.lastSeen > MAX_AGE_MS) {
            faceAgeHistory.delete(faceId);
            displayedAges.delete(faceId); // Удаляем и из отображаемых возрастов
        }
    }
}

// Детекция объектов
async function detectObjects() {
    try {
        if (!video.paused && !video.ended && cocoModel) {
            // Очистка старых лиц из истории каждые 30 кадров
            if (Math.random() < 0.03) { // примерно раз в 30 вызовов
                cleanupAgeHistory();
            }
            
            // Настройки для face-api.js, используем SsdMobilenetv1
            const faceDetectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

            let detectionsWithAge = [];
            try {
                // Детекция лиц с определением возраста и пола
                detectionsWithAge = await faceapi.detectAllFaces(video, faceDetectionOptions)
                    .withFaceLandmarks()
                    .withAgeAndGender();
            } catch (faceError) {
                console.error('Ошибка при определении лиц:', faceError);
                detectionsWithAge = [];
            }
                
            // Управляем активностью кнопки калибровки
            if (detectionsWithAge.length > 0) {
                if (calibrateButton.disabled) { // Активируем, если была неактивна
                    calibrateButton.disabled = false;
                }
            } else {
                if (!calibrateButton.disabled) { // Деактивируем, если нет лиц
                     calibrateButton.disabled = true;
                     // Если лиц нет и шла калибровка, останавливаем ее
                     if (shouldUpdateAges) {
                        shouldUpdateAges = false;
                        calibrateButton.textContent = "Перекалибровать возраст";
                        calibrateButton.classList.remove('calibrating');
                        console.log('Калибровка остановлена: лица не обнаружены.');
                     }
                }
            }

            let predictions = [];
            try {
                // Детекция объектов (включая людей) с помощью COCO-SSD
                predictions = await cocoModel.detect(video);
            } catch (cocoError) {
                console.error('Ошибка при определении объектов:', cocoError);
                predictions = [];
            }

            // Очистка канваса перед отрисовкой новых рамок
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 2;
            ctx.font = 'bold 16px Arial'; // Устанавливаем жирный шрифт

            let currentFaceCount = 0;
            let currentPersonCount = 0;
            let totalAge = 0;

            // Отрисовка рамок для лиц с возрастом
            detectionsWithAge.forEach(face => {
                const { box } = face.detection;
                const { x, y, width, height } = box;
                const rawAge = face.age; // Исходный возраст
                const genderProbability = face.genderProbability; // Уверенность в определении пола
                
                // Создаем уникальный ID для лица на основе его позиции
                const faceId = `face_${Math.round(x)}_${Math.round(y)}_${Math.round(width)}`;
                
                // Сглаживаем значение возраста
                const age = smoothAge(faceId, rawAge);
                
                const gender = face.gender; // Получаем пол (male/female)
                const genderText = gender === 'male' ? 'М' : 'Ж';
                
                // Определяем цвет текста на основе стабильности значений возраста
                const faceData = faceAgeHistory.get(faceId);
                const hasStableAge = faceData && faceData.isStable;
                const textColor = hasStableAge ? '#FFFFFF' : '#AAAAAA'; // Белый если значение стабильно, серый если нет
                
                // Суммируем возраст для подсчета среднего (только стабильные значения)
                if (hasStableAge) {
                    totalAge += age;
                    currentFaceCount++;
                }
                
                // Рисуем рамку лица
                ctx.strokeStyle = '#00FF00'; // Зеленый для лиц
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.stroke();
                
                // Создаем фон для текста
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(x, y - 25, width, 25);
                
                // Выводим информацию о лице, возрасте и поле
                ctx.fillStyle = textColor;
                ctx.fillText(`${genderText} (${Math.round(genderProbability*100)}%), ${age} лет`, x + 5, y - 5);
            });

            // Отрисовка рамок для людей (силуэтов)
            ctx.strokeStyle = '#FF0000'; // Красный для силуэтов
            predictions.forEach(prediction => {
                if (prediction.class === 'person') {
                    const [x, y, width, height] = prediction.bbox;
                    ctx.beginPath();
                    ctx.rect(x, y, width, height);
                    ctx.stroke();
                    ctx.fillStyle = '#FF0000';
                    ctx.fillText('Человек', x, y > 10 ? y - 5 : 10);
                    currentPersonCount++;
                }
            });

            // Обновление счетчиков
            faceCountDisplay.textContent = detectionsWithAge.length; // Общее количество обнаруженных лиц
            personCountDisplay.textContent = currentPersonCount;
            
            // Вычисление среднего возраста
            if (currentFaceCount > 0) {
                const averageAge = totalAge / currentFaceCount; // Убираем лишнее округление
                averageAgeDisplay.textContent = Math.round(averageAge).toString(); // Округляем и преобразуем в строку
            } else {
                averageAgeDisplay.textContent = 'N/A';
            }
        }
    } catch (error) {
        console.error('Ошибка при определении объектов:', error);
        faceCountDisplay.textContent = '0';
        personCountDisplay.textContent = '0';
        averageAgeDisplay.textContent = 'N/A';
    }
}

// Обработчики событий
startButton.addEventListener('click', startWebcam);
stopButton.addEventListener('click', stopWebcam);
calibrateButton.addEventListener('click', calibrateAge); 


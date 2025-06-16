let camera = null;
let isProcessing = false;
let alertCount = 0;
let currentTab = 'live';
let currentTheme = 'light'; // Default theme
document.body.setAttribute('data-theme', currentTheme); // Set initial theme


// Audio Context for alerts
let audioContext = null;
let speechSynthesis = window.speechSynthesis;

// DOM Elements
const startCameraBtn = document.getElementById('startCamera');
const stopCameraBtn = document.getElementById('stopCamera');
const uploadImageBtn = document.getElementById('uploadImage');
const cameraPreview = document.getElementById('cameraPreview');
const detectionOverlay = document.getElementById('detectionOverlay');
const connectionStatus = document.getElementById('connectionStatus');
const processingStatus = document.getElementById('processingStatus');
const alertCountElement = document.getElementById('alertCount');
const liveResults = document.getElementById('liveResults');
const themeToggle = document.getElementById('themeToggle');

// Initialize Audio Context
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Generate alert sound
function playAlertSound() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Text-to-Speech function
function speakAlert(text) {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.2;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    speechSynthesis.speak(utterance);
}

// Theme toggle functionality
themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    if (currentTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        themeToggle.textContent = '☀️';
        themeToggle.title = '다크모드로 전환';
    } else {
        document.body.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        themeToggle.title = '라이트모드로 전환';
    }
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Update active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Show/hide content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}Tab`).style.display = 'block';
    
    currentTab = tabName;
}

// Event Listeners
startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);
uploadImageBtn.addEventListener('click', uploadImage);

async function startCamera() {
    try {
        initAudioContext();
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment'
            } 
        });
        
        camera = document.createElement('video');
        camera.srcObject = stream;
        camera.autoplay = true;
        camera.style.width = '100%';
        camera.style.height = '100%';
        camera.style.objectFit = 'cover';
        camera.style.borderRadius = '16px';
        
        cameraPreview.innerHTML = '';
        cameraPreview.appendChild(camera);
        cameraPreview.appendChild(detectionOverlay);
        
        startCameraBtn.style.display = 'none';
        stopCameraBtn.style.display = 'inline-block';
        startCameraBtn.classList.remove('active');
        stopCameraBtn.classList.add('active');
        
        connectionStatus.querySelector('span').textContent = '연결됨';
        connectionStatus.classList.add('status-connected');
        processingStatus.querySelector('span').textContent = '실시간 분석 중';
        
        // Clear empty state and start processing
        liveResults.innerHTML = '';
        startProcessing();
        
    } catch (error) {
        alert('카메라 접근 권한이 필요합니다.');
        console.error('Camera error:', error);
    }
}

function stopCamera() {
    if (camera && camera.srcObject) {
        camera.srcObject.getTracks().forEach(track => track.stop());
    }
    
    cameraPreview.innerHTML = `
        <div class="camera-placeholder">
            <p>🎥 카메라를 시작하여<br>실시간 도로 분석을 시작하세요</p>
        </div>
        <div class="detection-overlay" id="detectionOverlay"></div>
    `;
    
    startCameraBtn.style.display = 'inline-block';
    stopCameraBtn.style.display = 'none';
    stopCameraBtn.classList.remove('active');
    
    connectionStatus.querySelector('span').textContent = '대기 중';
    connectionStatus.classList.remove('status-connected');
    processingStatus.querySelector('span').textContent = '준비됨';
    
    isProcessing = false;
}

function uploadImage() {
    initAudioContext();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '16px';
                
                cameraPreview.innerHTML = '';
                cameraPreview.appendChild(img);
                cameraPreview.appendChild(detectionOverlay);
                
                processingStatus.querySelector('span').textContent = '이미지 분석 중...';
                setTimeout(() => {
                    addDetectionResult('분석 완료', '이미지에서 위험요소 검사 완료', 'low', 0, 0);
                    processingStatus.querySelector('span').textContent = '분석 완료';
                    speakAlert('이미지 분석이 완료되었습니다.');
                    playAlertSound();
                }, 2000);
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function startProcessing() {
    isProcessing = true;
    simulateDetections();
}

// Simulate detection results for demo
function simulateDetections() {
    if (!isProcessing) return;
    
    const hazards = [
        { name: '낙하물', type: 'high', confidence: 95 },
        { name: '포트홀', type: 'medium', confidence: 87 },
        { name: '차선 이탈', type: 'medium', confidence: 92 },
        { name: '급정거 차량', type: 'high', confidence: 89 },
        { name: '공사 구간', type: 'low', confidence: 78 },
        { name: '시야 방해 요소', type: 'medium', confidence: 83 }
    ];
    
    setTimeout(() => {
        if (isProcessing) {
            const hazard = hazards[Math.floor(Math.random() * hazards.length)];
            const x = Math.random() * 300 + 50;
            const y = Math.random() * 200 + 50;
            
            addDetectionResult(hazard.name, `신뢰도: ${hazard.confidence}% • 좌표: (${Math.floor(x)}, ${Math.floor(y)})`, hazard.type, x, y);
            simulateDetections();
        }
    }, Math.random() * 5000 + 3000);
}

function addDetectionResult(name, details, severity, x, y) {
    alertCount++;
    alertCountElement.textContent = `${alertCount}개 감지됨`;
    
    // Add detection to live results
    if (currentTab === 'live') {
        if (liveResults.querySelector('.empty-state')) {
            liveResults.innerHTML = '';
        }
    }
    
    const detectionItem = createDetectionItem(name, details, severity);
    liveResults.insertBefore(detectionItem, liveResults.firstChild);
    
    // Add visual overlay if coordinates provided
    if (x && y && camera) {
        addDetectionOverlay(name, x, y, severity);
    }
    
    // Play sound and speak for high severity only
    if (severity === 'high') {
        playAlertSound();
        speakAlert(`위험 요소 감지: ${name}`);
    }
    
    // Keep only last 10 items in live view
    const items = liveResults.querySelectorAll('.detection-item');
    if (items.length > 10) {
        items[items.length - 1].remove();
    }
}

function createDetectionItem(name, details, severity) {
    const item = document.createElement('div');
    item.className = `detection-item severity-${severity} slide-in`;
    
    const severityText = {
        'high': '높음',
        'medium': '중간',
        'low': '낮음'
    };
    
    item.innerHTML = `
        <div class="detection-info">
            <div class="detection-name">${name}</div>
            <div class="detection-details">${details}</div>
        </div>
        <div class="detection-meta">
            <div class="severity-badge">${severityText[severity]}</div>
            <div class="detection-time">방금</div>
        </div>
    `;
    
    return item;
}

function addDetectionOverlay(name, x, y, severity) {
    const overlay = document.getElementById('detectionOverlay');
    if (!overlay) return;
    
    const box = document.createElement('div');
    box.className = `detection-box detection-alert severity-${severity}`;
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = '80px';
    box.style.height = '60px';
    
    const label = document.createElement('div');
    label.className = 'detection-label';
    label.textContent = name;
    
    box.appendChild(label);
    overlay.appendChild(box);
    
    // Remove overlay after 3 seconds
    setTimeout(() => {
        if (box.parentNode) {
            box.parentNode.removeChild(box);
        }
    }, 3000);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('DriveSafe Tracker initialized');
});

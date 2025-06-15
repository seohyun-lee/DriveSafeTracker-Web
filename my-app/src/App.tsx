import { useState, useEffect, useRef } from 'react';
import axios from 'axios'; // axios import 추가

const API_BASE_URL = 'http://localhost:8000'; // 백엔드 API 기본 주소

// 손상 클래스 정의
const DAMAGE_CLASSES = {
  0: '기타',
  1: '거북등 균열',
  2: '낮',
  3: '밤',
  4: '불량 보수',
  5: '쓰레기',
  6: '양호',
  7: '젖은 도로',
  8: '종방향 균열',
  9: '차선',
  10: '차선 손상',
  11: '포트홀',
  12: '횡방향 균열'
} as const;

// 시각적 경고를 표시해야 하는 클래스 ID 목록
const VISUAL_WARNING_CLASSES = [0, 1, 4, 5, 7, 8, 10, 11, 12] as const;

// API 응답 타입 정의
interface Prediction {
  class_id: number;
  name: string;
  confidence: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  width_cm: number;
  length_cm: number;
  area_m2: number;
  risk_level: 'A' | 'B' | 'C' | '-';
}

interface ApiResponse {
  predictions: Prediction[];
  day_or_night: string;
  overall_risk: 'A' | 'B' | 'C';
  original_image_url: string;
  result_image_url: string;
}

function App() {
  const [theme, setTheme] = useState('light');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  
  const cameraPreviewRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechSynthesisRef = useRef(window.speechSynthesis);

  // Detection and status states
  const [isProcessing, setIsProcessing] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [liveDetections, setLiveDetections] = useState<Array<any>>([]);
  const [historyDetections, _setHistoryDetections] = useState<Array<any>>([
    // Static history example data
    {
      id: 'hist1',
      name: DAMAGE_CLASSES[1],
      details: '신뢰도: 95% • 좌표: (240, 180)',
      shapeType: 'bbox',
      severity: 'high',
      time: '2분 전'
    },
    {
      id: 'hist2',
      name: DAMAGE_CLASSES[11],
      details: '신뢰도: 87% • 좌표: (320, 400)',
      shapeType: 'bbox',
      severity: 'medium',
      time: '5분 전'
    }
  ]);
  const [detectionOverlays, setDetectionOverlays] = useState<Array<any>>([]);

  // Status text states
  const [connectionStatusText, setConnectionStatusText] = useState('대기 중');
  const [isConnectionOk, setIsConnectionOk] = useState(false);
  const [processingStatusText, setProcessingStatusText] = useState('준비됨');
  const simulationTimeoutRef = useRef<number | null>(null);
  const [previewMode, setPreviewMode] = useState<'placeholder' | 'video' | 'image'>('placeholder');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'live' | 'upload'>('live');
  const [isImageAnalyzing, setIsImageAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Array<any>>([]);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const uploadedImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Audio and Speech Synthesis Utilities
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playAlertSound = () => {
    if (!audioContextRef.current) return;
    const context = audioContextRef.current;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.frequency.setValueAtTime(800, context.currentTime);
    oscillator.frequency.setValueAtTime(1000, context.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(800, context.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.3);
  };

  const speakAlert = (text: string) => {
    if (speechSynthesisRef.current.speaking) {
      speechSynthesisRef.current.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.2;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    speechSynthesisRef.current.speak(utterance);
  };

  // Effect for detection simulation
  useEffect(() => {
    const simulateDetections = () => {
      if (!isProcessing || activeView !== 'live') return;

      const hazards = [
        { classId: 1, type: 'high', confidence: 95 },
        { classId: 11, type: 'medium', confidence: 87 },
        { classId: 10, type: 'medium', confidence: 92 },
      ];
      const hazard = hazards[Math.floor(Math.random() * hazards.length)];
      const previewWidth = cameraPreviewRef.current?.clientWidth || 512;
      const previewHeight = cameraPreviewRef.current?.clientHeight || 512;

      const x = Math.random() * (previewWidth * 0.7) + (previewWidth * 0.05);
      const y = Math.random() * (previewHeight * 0.7) + (previewHeight * 0.05);
      const width = Math.random() * (previewWidth * 0.2) + 50;
      const height = Math.random() * (previewHeight * 0.2) + 50;
      const overlayData = { type: 'bbox', x, y, width, height };
      
      addDetectionResult(
        DAMAGE_CLASSES[hazard.classId as keyof typeof DAMAGE_CLASSES],
        `신뢰도: ${hazard.confidence}%`,
        hazard.type,
        overlayData
      );

      simulationTimeoutRef.current = window.setTimeout(simulateDetections, Math.random() * 4000 + 2000);
    };

    if (isProcessing && activeView === 'live') {
      simulateDetections();
    } else {
      if (simulationTimeoutRef.current) clearTimeout(simulationTimeoutRef.current);
    }
    return () => { // Cleanup
      if (simulationTimeoutRef.current) clearTimeout(simulationTimeoutRef.current);
    };
  }, [isProcessing, activeView]);

  useEffect(() => {
    if (previewMode === 'video' && streamRef.current && videoElementRef.current && activeView === 'live') {
      videoElementRef.current.srcObject = streamRef.current;
    } else if (videoElementRef.current) {
      // Stop video playback when not in video mode to release resources
      // and prevent potential errors if srcObject is already null.
      videoElementRef.current.pause();
      videoElementRef.current.srcObject = null;
    }
  }, [previewMode, streamRef.current, activeView]); 

  const handleStartCamera = async () => {
    console.log('Start Camera Clicked');
    initAudioContext(); // Initialize audio context when camera starts
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 512 },
            height: { ideal: 512 },
            facingMode: 'environment'
          }
        });
        streamRef.current = stream;
        // The useEffect above will handle setting srcObject when previewMode changes to 'video'
        setPreviewMode('video');
        setIsCameraOn(true);
        setIsProcessing(true);
        setConnectionStatusText('연결됨');
        setIsConnectionOk(true);
        setProcessingStatusText('실시간 분석 중');
        setLiveDetections([]); 
        setDetectionOverlays([]);
      } catch (err) {
        console.error("Error accessing camera: ", err);
        alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
      }
    } else {
      alert('이 브라우저에서는 카메라 기능을 지원하지 않습니다.');
    }
  };

  const handleStopCamera = () => {
    console.log('Stop Camera Clicked');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    // The useEffect above will handle clearing srcObject when previewMode changes
    streamRef.current = null;
    setPreviewMode('placeholder');
    setIsCameraOn(false);
    setIsProcessing(false);
    setConnectionStatusText('대기 중');
    setIsConnectionOk(false);
    setProcessingStatusText('준비됨');
  };

  const handleUploadImage = () => {
    console.log('Upload Image Clicked for Analysis View');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) { 
        initAudioContext();
        if (isCameraOn) handleStopCamera(); 

        setAnalysisResults([]); // Clear previous results
        setIsImageAnalyzing(true);
        setProcessingStatusText('이미지 분석 중...');

        const reader = new FileReader();
        reader.onload = async (e) => { 
          setImagePreviewUrl(e.target?.result as string);

          try {
            const fd = new FormData();
            fd.append('file', file);
            const { data: response } = await axios.post<ApiResponse>(
              `${API_BASE_URL}/predict`,
              fd,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            );

            setApiResponse(response);  // API 응답 저장
            // API 응답의 result_image_url을 사용하여 이미지 미리보기를 업데이트합니다.
            if (response.result_image_url) {
              setImagePreviewUrl(response.result_image_url);
            }
            
            // predictions 배열이 있는지 확인
            const predictions = response?.predictions || [];
            
            // API 응답을 프론트엔드 형식으로 변환
            const formattedResults = predictions
              .map((prediction: Prediction, index: number) => ({
                id: `${prediction.class_id}-${prediction.x}-${prediction.y}-${Date.now()}-${index}`, // ID를 더 고유하게 만듭니다.
                name: prediction.name,
                type: prediction.type,
                x: prediction.x,
                y: prediction.y,
                width: prediction.width,
                height: prediction.height,
                severity: prediction.risk_level === 'A' ? 'high' : 
                         prediction.risk_level === 'B' ? 'medium' : 'low',
                confidence: prediction.confidence,
                details: `신뢰도: ${(prediction.confidence * 100).toFixed(1)}% • 크기: ${prediction.width_cm.toFixed(1)}cm x ${prediction.length_cm.toFixed(1)}cm • 면적: ${prediction.area_m2.toFixed(2)}㎡`
              }));

            setAnalysisResults(formattedResults);
            setIsImageAnalyzing(false);
            setProcessingStatusText(`분석 완료: ${formattedResults.length}개 항목 발견 (${response.day_or_night}, 전체 위험도: ${response.overall_risk})`);

            if (response.overall_risk === 'A') {
              playAlertSound();
              speakAlert('이미지에서 고위험 요소가 발견되었습니다.');
            } else if (formattedResults.length > 0) {
              speakAlert(`이미지 분석이 완료되어 ${formattedResults.length}개 항목이 발견되었습니다.`);
            } else {
              speakAlert('이미지 분석 결과, 특이사항이 발견되지 않았습니다.');
            }
          } catch (error) {
            console.error("Error uploading and analyzing image:", error);
            setIsImageAnalyzing(false);
            setProcessingStatusText('오류 발생: 이미지 분석에 실패했습니다.');
            speakAlert('이미지 분석 중 오류가 발생했습니다.');
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleTabClick = (tabName: string) => {
    console.log('Tab Clicked:', tabName);
    setActiveTab(tabName);
  };

  const handleViewChange = (view: 'live' | 'upload') => {
    setActiveView(view);
    if (view === 'upload') {
      if (isCameraOn) handleStopCamera(); // Stop camera if switching to upload view
      setLiveDetections([]); // Clear live detections
      setDetectionOverlays([]); // Clear live overlays
      setAlertCount(0);
    } else { // Switching to 'live' view
      setImagePreviewUrl(null); // Clear uploaded image preview
      setAnalysisResults([]); // Clear analysis results
      setProcessingStatusText('준비됨');
      // Reset any upload-specific states if necessary
    }
  };

  const addDetectionResult = (name: string, details: string, severity: string, overlayData?: any, createOverlay = true) => {
    setAlertCount(prev => prev + 1);
    if (activeView === 'live') { // Only update liveDetections if in live view
      const newDetection = { id: Date.now() + Math.random(), name, details, severity, time: '방금', shapeType: overlayData?.type };
      setLiveDetections(prev => [newDetection, ...prev.slice(0, 9)]);
    }
    if (createOverlay && overlayData && isCameraOn && activeView === 'live') { // Overlay only for live view with camera on
      const overlayId = `overlay-${Date.now()}`;
      let newOverlay;
      if (overlayData.type === 'bbox') {
        newOverlay = { id: overlayId, name, severity, type: 'bbox', ...overlayData };
      }
      if (!newOverlay) return;

      setDetectionOverlays(prev => [...prev, newOverlay]);
      setTimeout(() => {
        setDetectionOverlays(prev => prev.filter(o => o.id !== overlayId));
      }, 3000); // Remove overlay after 3 seconds
    }

    if (severity === 'high') {
      playAlertSound();
      speakAlert(`위험 요소 감지: ${name}`);
    }
  };

  // JSX for detection item
  const renderDetectionItem = (item: any) => (
    <div key={item.id} className={`detection-item severity-${item.severity} slide-in`}>
      <div className="detection-info">
        <div className="detection-name">{item.name}</div>
        <div className="detection-details">{item.details} {item.shapeType && `• ${item.shapeType === 'bbox' ? '바운딩 박스' : ''}`}</div>
      </div>
      <div className="detection-meta">
        <div className="severity-badge">{item.severity === 'high' ? '높음' : item.severity === 'medium' ? '중간' : '낮음'}</div>
        <div className="detection-time">{item.time}</div>
      </div>
    </div>
  );

  return (
    <>
      <header className="header">
        <nav className="nav">
          <div className="logo">🚗 RoadVision</div>
          <div className="header-controls">
            <div className="view-selector">
              <button
                className={`btn-view-select ${activeView === 'upload' ? 'active' : ''}`}
                onClick={() => handleViewChange('upload')}
              >
                이미지 분석
              </button>
              <button
                className={`btn-view-select ${activeView === 'live' ? 'active' : ''}`}
                onClick={() => handleViewChange('live')}
              >
                실시간 도로 분석
              </button>
              
            </div>
            <button className="theme-toggle" title="테마 전환" onClick={toggleTheme}>
              {theme === 'light' ? '☀️' : '🌙'}
            </button>
            <div className="status-indicators">
              <div className={`status-indicator ${isConnectionOk ? 'status-connected' : ''}`}>
                <div className="status-dot"></div>
                <span>{connectionStatusText}</span>
              </div>
              <div className="status-indicator">
                <div className="status-dot"></div>
                <span>{processingStatusText}</span>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <main className="dashboard">
        {activeView === 'live' && (
          <>
            {/* Camera Section for Live View */}
            <section className="camera-section">
              <div className="camera-header">
                <div className="camera-title">
                  🎥 실시간 도로 분석 (데모)
                </div>
                <div className="camera-controls-mini">
                  {!isCameraOn ? (
                    <button className="btn-mini" onClick={handleStartCamera}>시작</button>
                  ) : (
                    <button 
                      className="btn-mini active"
                      onClick={handleStopCamera}
                    >
                      정지
                    </button>
                  )}
                  {/* "업로드" 버튼은 실시간 분석 뷰에서는 제거하거나 다른 기능으로 대체 가능 */}
                </div>
              </div>
              
              <div className="camera-container">
                <div className="camera-preview" ref={cameraPreviewRef}>
                  {previewMode === 'placeholder' && (
                    <div className="camera-placeholder">
                      <p>🎥 카메라를 시작하여<br/>실시간 도로 분석을 시작하세요</p>
                    </div>
                  )}
                  {previewMode === 'video' && (
                    <video
                      ref={videoElementRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '16px' }}
                    />
                  )}
                  {/* imagePreviewUrl is for upload view, so not rendered here in live view */}
                  <div className="detection-overlay"> 
                    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                      {detectionOverlays.map(overlay => {
                        let strokeColor = '#ff3366'; 
                        let labelBackgroundColor = '#ff3366';
                        let fillColor = 'rgba(255,51,102,0.1)';

                        if (overlay.severity === 'medium') {
                          strokeColor = '#ff8800';
                          labelBackgroundColor = '#ff8800';
                          fillColor = 'rgba(255,136,0,0.1)';
                        } else if (overlay.severity === 'low') {
                          strokeColor = '#ffdd00';
                          labelBackgroundColor = '#ffdd00';
                          fillColor = 'rgba(255,221,0,0.1)';
                        }

                        let labelX = overlay.x || 0;
                        let labelY = (overlay.y || 0) - 25;

                        return (
                          <g key={overlay.id}>
                            <rect x={overlay.x} y={overlay.y} width={overlay.width} height={overlay.height} style={{ fill: fillColor, stroke: strokeColor, strokeWidth: 2 }} />
                            <foreignObject x={labelX} y={labelY < 0 ? 0 : labelY} width="120" height="30"> 
                              <div className="detection-label" style={{ backgroundColor: labelBackgroundColor, color: overlay.severity === 'low' ? '#000' : '#fff', display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {overlay.name}
                              </div>
                            </foreignObject>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </div>
            </section>

            {/* Detection Panel for Live View */}
            <section className="detection-panel">
              <div className="panel-header">
                <div className="panel-title">
                  ⚠️ 탐지 결과
                </div>
                <div className="alert-count">{alertCount}개 감지됨</div>
              </div>
              <div className="panel-tabs">
                <div className={`tab ${activeTab === 'live' ? 'active' : ''}`} data-tab="live" onClick={() => handleTabClick('live')} > 실시간 </div>
                <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} data-tab="history" onClick={() => handleTabClick('history')} > 기록 </div>
                <div className={`tab ${activeTab === 'stats' ? 'active' : ''}`} data-tab="stats" onClick={() => handleTabClick('stats')} > 통계 </div>
              </div>
              <div className="panel-content">
                <div id="liveTab" className="tab-content" style={{ display: activeTab === 'live' ? 'block' : 'none' }}>
                  {liveDetections.length === 0 ? ( <div className="empty-state"> <div className="empty-state-icon">🔍</div> <p>위험요소를 실시간으로<br/>감지하고 있습니다</p> </div> ) : ( liveDetections.map(renderDetectionItem) )}
                </div> 
                <div id="historyTab" className="tab-content" style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
                  {historyDetections.length === 0 ? ( <div className="empty-state"> <div className="empty-state-icon">📂</div> <p>탐지 기록이 여기에 표시됩니다.</p> </div> ) : ( historyDetections.map(renderDetectionItem) )}
                </div>
                <div id="statsTab" className="tab-content" style={{ display: activeTab === 'stats' ? 'block' : 'none' }}>
                  <div style={{ padding: '1rem 0' }}> <div style={{ marginBottom: '1.5rem' }}> <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}> <span>총 탐지 건수</span> <strong>23개</strong> </div> <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}> <span>고위험</span> <span style={{ color: '#ff3366' }}>8개</span> </div> <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}> <span>중위험</span> <span style={{ color: '#ff8800' }}>10개</span> </div> <div style={{ display: 'flex', justifyContent: 'space-between' }}> <span>저위험</span> <span style={{ color: '#ffdd00' }}>5개</span> </div> </div> <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}> 최근 1일간의 통계입니다 </div> </div>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === 'upload' && (
          <section className="upload-section">
            <div className="upload-area">
            <h2 className="upload-title">이미지 분석 (API 연동)</h2>
              <button className="btn btn-upload" onClick={handleUploadImage}>
                📁 이미지 선택 및 업로드
              </button>
              <div className="image-analysis-area">
                {isImageAnalyzing && (
                  <div className="loading-spinner-container">
                    <div className="loading-spinner"></div>
                    <p>이미지 분석 중...</p>
                  </div>
                )}
                {imagePreviewUrl && !isImageAnalyzing && (
                  <div className="image-preview-container-upload">
                    <img ref={uploadedImageRef} src={imagePreviewUrl} alt="업로드된 이미지" />
                    
                  </div>
                )}
                {!imagePreviewUrl && !isImageAnalyzing && (
                  <div className="upload-placeholder"><p>분석할 이미지를 업로드 해주세요.</p></div>
                )}
              </div>
            </div>
            <div className="analysis-results-panel">
              <h3>분석 상태</h3>
              <div className="results-placeholder">
                <p>{processingStatusText}</p> 
                {!isImageAnalyzing && apiResponse && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '1rem', 
                    background: 'var(--bg-tertiary)', 
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    overflowX: 'auto'
                  }}>
                    <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>분석 정보:</div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div>시간대: {apiResponse.day_or_night}</div>
                      <div>전체 위험도: {apiResponse.overall_risk}</div>
                    </div>
                    <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>탐지 결과:</div>
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(apiResponse.predictions, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  )
}


export default App
import { useState, useEffect, useRef } from 'react';

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
  const [historyDetections, setHistoryDetections] = useState<Array<any>>([
    // Static history example data
    {
      id: 'hist1',
      name: '낙하물',
      details: '신뢰도: 95% • 좌표: (240, 180)',
      shapeType: 'polygon', // 예시: 폴리곤 유형
      severity: 'high',
      time: '2분 전'
    },
    {
      id: 'hist2',
      name: '포트홀',
      details: '신뢰도: 87% • 좌표: (320, 400)',
      shapeType: 'bbox', // 예시: 바운딩 박스 유형
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
        { name: '낙하물', type: 'high', confidence: 95 },
        { name: '포트홀', type: 'medium', confidence: 87 },
        { name: '차선 이탈', type: 'medium', confidence: 92 },
      ];
      const hazard = hazards[Math.floor(Math.random() * hazards.length)];
      const previewWidth = cameraPreviewRef.current?.clientWidth || 512;
      const previewHeight = cameraPreviewRef.current?.clientHeight || 512;

      const detectionType = Math.random() < 0.5 ? 'bbox' : 'polygon';
      let overlayData: any;

      if (detectionType === 'bbox') {
        const x = Math.random() * (previewWidth * 0.7) + (previewWidth * 0.05);
        const y = Math.random() * (previewHeight * 0.7) + (previewHeight * 0.05);
        const width = Math.random() * (previewWidth * 0.2) + 50;
        const height = Math.random() * (previewHeight * 0.2) + 50;
        overlayData = { type: 'bbox', x, y, width, height };
      } else { // polygon
        const pX = Math.random() * (previewWidth * 0.5) + (previewWidth * 0.1);
        const pY = Math.random() * (previewHeight * 0.5) + (previewHeight * 0.1);
        const pW = Math.random() * (previewWidth * 0.3) + 50;
        const pH = Math.random() * (previewHeight * 0.3) + 50;
        
        const numPoints = Math.floor(Math.random() * 5) + 3; // 3 to 7 points for the polygon
        const points = [];
        for (let i = 0; i < numPoints; i++) {
          // Create somewhat random points around a central area for a convex-like polygon
          const angle = (i / numPoints) * 2 * Math.PI;
          const radiusVariation = (Math.random() * 0.4 + 0.8); // 80% to 120% of base radius
          const pointX = pX + pW / 2 + (pW / 2 * radiusVariation * Math.cos(angle)) + (Math.random() * 20 - 10);
          const pointY = pY + pH / 2 + (pH / 2 * radiusVariation * Math.sin(angle)) + (Math.random() * 20 - 10);
          points.push({ x: pointX, y: pointY });
        }
        overlayData = { type: 'polygon', points };
      }
      
      addDetectionResult(
        hazard.name,
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
      // In 'upload' view, cameraPreviewRef is not relevant.
      // We only need to ensure a file was selected.
      if (file) { 
        initAudioContext();
        // For upload view, camera shouldn't be on. If it was, stop it.
        if (isCameraOn) handleStopCamera(); 

        setAnalysisResults([]); // Clear previous results
        setIsImageAnalyzing(true);
        setProcessingStatusText('이미지 분석 중...');

        const reader = new FileReader();
        reader.onload = (e) => { 
          setImagePreviewUrl(e.target?.result as string); 
          // Simulate API call after image is loaded and preview is set
          setTimeout(() => {
            // Mock API response
            const mockApiResponse = [
              {
                id: 'upload-det-1',
                name: '균열 감지',
                severity: 'medium',
                type: 'polygon',
                points: [{ x: 50, y: 60 }, { x: 150, y: 70 }, { x: 130, y: 180 }, { x: 40, y: 150 }],
                confidence: 0.88
              },
              {
                id: 'upload-det-2',
                name: '포트홀 의심',
                severity: 'high',
                type: 'bbox',
                x: 200, y: 220, width: 100, height: 80,
                confidence: 0.92
              },
              {
                id: 'upload-det-3',
                name: '표지판',
                severity: 'low',
                type: 'bbox',
                x: 300, y: 50, width: 70, height: 100,
                confidence: 0.95
              }
            ];
            setAnalysisResults(mockApiResponse);
            setIsImageAnalyzing(false);
            setProcessingStatusText(`분석 완료: ${mockApiResponse.length}개 항목 발견`);
            if (mockApiResponse.some(res => res.severity === 'high')) {
              playAlertSound();
              speakAlert('이미지에서 고위험 요소가 발견되었습니다.');
            } else if (mockApiResponse.length > 0) {
              speakAlert(`이미지 분석이 완료되어 ${mockApiResponse.length}개 항목이 발견되었습니다.`);
            } else {
              speakAlert('이미지 분석 결과, 특이사항이 발견되지 않았습니다.');
            }
          }, 3000); // Simulate 3 seconds API call
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
      } else if (overlayData.type === 'polygon' && overlayData.points && overlayData.points.length > 0) {
        newOverlay = { id: overlayId, name, severity, type: 'polygon', points: overlayData.points };
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
        <div className="detection-details">{item.details} {item.shapeType && `• ${item.shapeType === 'bbox' ? '바운딩 박스' : '폴리곤'}`}</div>
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

                        let labelX = 0;
                        let labelY = 0;

                        if (overlay.type === 'bbox') {
                          labelX = overlay.x || 0;
                          labelY = (overlay.y || 0) - 25;
                        } else if (overlay.type === 'polygon' && overlay.points && overlay.points.length > 0) {
                          labelX = overlay.points[0]?.x || 0;
                          labelY = (overlay.points[0]?.y || 0) - 25;
                        }

                        return (
                          <g key={overlay.id}>
                            {overlay.type === 'bbox' && ( <rect x={overlay.x} y={overlay.y} width={overlay.width} height={overlay.height} style={{ fill: fillColor, stroke: strokeColor, strokeWidth: 2 }} /> )}
                            {overlay.type === 'polygon' && overlay.points && ( <polygon points={overlay.points.map((p: {x:number, y:number}) => `${p.x},${p.y}`).join(' ')} style={{ fill: fillColor, stroke: strokeColor, strokeWidth: 2 }} /> )}
                            {(overlay.type === 'bbox' || (overlay.type === 'polygon' && overlay.points && overlay.points.length > 0)) && (
                              <foreignObject x={labelX} y={labelY < 0 ? 0 : labelY} width="120" height="30"> 
                                <div xmlns="http://www.w3.org/1999/xhtml" className="detection-label" style={{ backgroundColor: labelBackgroundColor, color: overlay.severity === 'low' ? '#000' : '#fff', display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {overlay.name}
                                </div>
                              </foreignObject>
                            )}
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
                    <svg 
                      width="100%" 
                      height="100%" 
                      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                      // viewBox will be set dynamically if needed, or assume container size
                    >
                      {analysisResults.map(item => {
                        let strokeColor = '#ff3366'; 
                        let labelBackgroundColor = '#ff3366';
                        let fillColor = 'rgba(255,51,102,0.2)';

                        if (item.severity === 'medium') {
                          strokeColor = '#ff8800';
                          labelBackgroundColor = '#ff8800';
                          fillColor = 'rgba(255,136,0,0.2)';
                        } else if (item.severity === 'low') {
                          strokeColor = '#ffdd00';
                          labelBackgroundColor = '#ffdd00';
                          fillColor = 'rgba(255,221,0,0.2)';
                        }
                        
                        let labelX = 0;
                        let labelY = 0;

                        if (item.type === 'bbox') {
                          labelX = item.x || 0;
                          labelY = (item.y || 0) - 25;
                        } else if (item.type === 'polygon' && item.points && item.points.length > 0) {
                          labelX = item.points[0]?.x || 0;
                          labelY = (item.points[0]?.y || 0) - 25;
                        }

                        return (
                          <g key={item.id}>
                            {item.type === 'bbox' && ( <rect x={item.x} y={item.y} width={item.width} height={item.height} style={{ fill: fillColor, stroke: strokeColor, strokeWidth: 2 }} /> )}
                            {item.type === 'polygon' && item.points && ( <polygon points={item.points.map((p: {x:number, y:number}) => `${p.x},${p.y}`).join(' ')} style={{ fill: fillColor, stroke: strokeColor, strokeWidth: 2 }} /> )}
                            {(item.type === 'bbox' || (item.type === 'polygon' && item.points && item.points.length > 0)) && (
                              <foreignObject x={labelX} y={labelY < 0 ? 0 : labelY} width="120" height="30"> 
                                <div xmlns="http://www.w3.org/1999/xhtml" className="detection-label" style={{ backgroundColor: labelBackgroundColor, color: item.severity === 'low' ? '#000' : '#fff', display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {item.name}
                                </div>
                              </foreignObject>
                            )}
                          </g>
                        );
                      })}
                    </svg>
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
                {/* Optionally, list textual results from analysisResults here */}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  )
}


export default App
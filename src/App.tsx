import { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize, Minimize, Settings, Bug, Type } from 'lucide-react';
import FaceMeshView from './components/FaceMeshView';
import ThreeView, { ThreeViewHandle } from './components/ThreeView';
import CalibrationWizard from './components/CalibrationWizard';
import ShoeControlPanel from './components/ShoeControlPanel';
import ForceFieldGlassOverlay from './features/force-field/ForceFieldGlassOverlay';
import { FORCE_FIELD_COPY } from './features/force-field/copy';
import { calibrationManager, CalibrationData } from './utils/calibration';

function App() {
  const [isCdnAvailable, setIsCdnAvailable] = useState(true);
  const [isCheckingCdn, setIsCheckingCdn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showTextOverlay, setShowTextOverlay] = useState(true);
  const [shoePosition, setShoePosition] = useState({ x: 0.07, y: -0.14, z: -0.1 });
  const [shoeScale, setShoeScale] = useState(0.053);
  const [shoeRotation, setShoeRotation] = useState({ x: 0, y: 48 * Math.PI / 180, z: 0 });
  const [cameraFps, setCameraFps] = useState(0);
  const [renderFps, setRenderFps] = useState(0);
  const threeViewRef = useRef<ThreeViewHandle>(null);

  useEffect(() => {
    const checkCdnAvailability = async () => {
      setIsCheckingCdn(true);
      try {
        const faceMeshResponse = await fetch(
          'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js',
          { method: 'HEAD' }
        );

        const cameraResponse = await fetch(
          'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
          { method: 'HEAD' }
        );

        const drawingResponse = await fetch(
          'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
          { method: 'HEAD' }
        );

        setIsCdnAvailable(faceMeshResponse.ok && cameraResponse.ok && drawingResponse.ok);
      } catch (error) {
        console.error('Error checking CDN availability:', error);
        setIsCdnAvailable(false);
      } finally {
        setIsCheckingCdn(false);
      }
    };

    checkCdnAvailability();

    const intervalId = setInterval(checkCdnAvailability, 60000);

    return () => clearInterval(intervalId);
  }, []);

  // Throttled FPS reporting from FaceMeshView — fires ≈2 Hz, not on the hot path
  const handleCameraFpsUpdate = useCallback((fps: number) => {
    setCameraFps(fps);
  }, []);

  // Poll render FPS from ThreeView at 2 Hz (also not on hot path)
  useEffect(() => {
    const interval = setInterval(() => {
      const fps = threeViewRef.current?.getRenderFps() ?? 0;
      setRenderFps(fps);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (error) {
        console.error('Error entering fullscreen:', error);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (error) {
        console.error('Error exiting fullscreen:', error);
      }
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!calibrationManager.isCalibrated()) {
      setShowCalibration(true);
    }
  }, []);

  const handleCalibrationComplete = (newCalibration: CalibrationData) => {
    if (threeViewRef.current) {
      threeViewRef.current.updateCalibration(newCalibration);
    }
  };

  const toggleDebugMode = () => {
    const newDebugMode = !debugMode;
    setDebugMode(newDebugMode);
    if (threeViewRef.current) {
      threeViewRef.current.setDebugMode(newDebugMode);
    }
  };

  const handleShoePositionChange = (x: number, y: number, z: number) => {
    setShoePosition({ x, y, z });
    if (threeViewRef.current) {
      threeViewRef.current.updateModelPosition(x, y, z);
    }
  };

  const handleShoeScaleChange = (scale: number) => {
    setShoeScale(scale);
    if (threeViewRef.current) {
      threeViewRef.current.updateModelScale(scale);
    }
  };

  const handleShoeRotationChange = (x: number, y: number, z: number) => {
    setShoeRotation({ x, y, z });
    if (threeViewRef.current) {
      threeViewRef.current.updateModelRotation(x, y, z);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (threeViewRef.current) {
        const pos = threeViewRef.current.getModelPosition();
        const scale = threeViewRef.current.getModelScale();
        const rot = threeViewRef.current.getModelRotation();
        setShoePosition(pos);
        setShoeScale(scale);
        setShoeRotation(rot);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col relative">
      <main className="flex-1 relative">
        {!isCheckingCdn && !isCdnAvailable && (
          <div className="absolute top-4 left-4 right-4 z-30 max-w-2xl mx-auto p-3 bg-yellow-50 text-yellow-800 rounded-md">
            <p className="text-sm">
              We're having trouble connecting to the required resources. Please check your internet connection.
            </p>
          </div>
        )}

        <div className="absolute inset-0">
          <ThreeView ref={threeViewRef} />
        </div>

        {debugMode && (
          <div className="absolute top-4 right-4 z-20 px-3 py-2 bg-black bg-opacity-60 text-white text-xs font-mono rounded backdrop-blur-sm pointer-events-none">
            <div>Camera: {cameraFps.toFixed(1)} FPS</div>
            <div>Render: {renderFps.toFixed(1)} FPS</div>
          </div>
        )}

        <ForceFieldGlassOverlay text={FORCE_FIELD_COPY} enabled={showTextOverlay} />

        <ShoeControlPanel
          onPositionChange={handleShoePositionChange}
          onScaleChange={handleShoeScaleChange}
          onRotationChange={handleShoeRotationChange}
          initialPosition={shoePosition}
          initialScale={shoeScale}
          initialRotation={shoeRotation}
        />

        <div className="absolute bottom-4 right-4 z-10 rounded-lg overflow-hidden shadow-2xl border-2 border-white">
          <div className="w-64 h-48">
            <FaceMeshView
              threeViewRef={threeViewRef}
              onFpsUpdate={handleCameraFpsUpdate}
            />
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
          <button
            onClick={toggleFullscreen}
            className="p-1.5 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded transition-colors backdrop-blur-sm"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>

          <button
            onClick={() => setShowCalibration(true)}
            className="p-1.5 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded transition-colors backdrop-blur-sm"
            aria-label="Calibration settings"
            title="Calibration settings"
          >
            <Settings size={14} />
          </button>

          <button
            onClick={toggleDebugMode}
            className={`p-1.5 ${debugMode ? 'bg-blue-600' : 'bg-black bg-opacity-50'} hover:bg-opacity-70 text-white rounded transition-colors backdrop-blur-sm`}
            aria-label="Toggle debug mode"
            title="Toggle debug mode"
          >
            <Bug size={14} />
          </button>

          <button
            onClick={() => setShowTextOverlay((prev) => !prev)}
            className={`p-1.5 ${showTextOverlay ? 'bg-black bg-opacity-50' : 'bg-black bg-opacity-80'} hover:bg-opacity-70 text-white rounded transition-colors backdrop-blur-sm`}
            aria-label="Toggle text overlay"
            title="Toggle text overlay"
          >
            <Type size={14} className={showTextOverlay ? 'opacity-100' : 'opacity-40'} />
          </button>
        </div>
      </main>

      {showCalibration && (
        <CalibrationWizard
          onComplete={handleCalibrationComplete}
          onSkip={() => setShowCalibration(false)}
          onClose={() => setShowCalibration(false)}
        />
      )}
    </div>
  );
}

export default App;

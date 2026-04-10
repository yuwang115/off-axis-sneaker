import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import { HeadPose, HeadPoseTracker } from '../utils/headPose';
import { ThreeViewHandle } from './ThreeView';

interface FaceMeshViewProps {
  /** Throttled (≈10 Hz) callback for React state consumers (debug UI, etc.) */
  onHeadPoseUpdate?: (headPose: HeadPose | null) => void;
  /** Optional ref to ThreeView — head pose is written to the scene manager directly, bypassing React state */
  threeViewRef?: React.RefObject<ThreeViewHandle>;
  /** Throttled (≈2 Hz) callback reporting camera/inference FPS */
  onFpsUpdate?: (fps: number) => void;
}

/** WASM bundle for MediaPipe Tasks Vision */
const TASKS_VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';

/** Face landmarker model */
const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Rolling window size for camera FPS calculation */
const CAMERA_FPS_WINDOW = 30;

/** Throttle intervals for React-state side effects (don't run on every frame) */
const HEAD_POSE_THROTTLE_MS = 100; // 10 Hz
const FPS_REPORT_THROTTLE_MS = 500; // 2 Hz

const FaceMeshView: React.FC<FaceMeshViewProps> = ({
  onHeadPoseUpdate,
  threeViewRef,
  onFpsUpdate,
}) => {
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const headPoseTrackerRef = useRef(new HeadPoseTracker(0.3));
  const rVFCHandleRef = useRef<number | null>(null);
  const fpsBufferRef = useRef<number[]>([]);
  const lastHeadPoseReportRef = useRef<number>(0);
  const lastFpsReportRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);

  const [isLandmarkerReady, setIsLandmarkerReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  // Initialize FaceLandmarker once on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        console.log('[face-landmarker] loading WASM from', TASKS_VISION_WASM);
        const filesetResolver = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM);

        if (cancelled) return;

        console.log('[face-landmarker] creating instance with GPU delegate');
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        faceLandmarkerRef.current = landmarker;
        setIsLandmarkerReady(true);
        console.log('[face-landmarker] ready');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to initialize FaceLandmarker';
        console.error('[face-landmarker] init error:', error);
        setLastError(message);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  const handleWebcamLoad = useCallback(() => {
    console.log('[webcam] loaded');

    // Probe actual camera capabilities — this is the authoritative source for
    // "what is my MacBook camera's max FPS". Logged to console for diagnostics.
    const stream = webcamRef.current?.stream;
    const track = stream?.getVideoTracks()[0];
    if (track) {
      const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : undefined;
      const settings = track.getSettings();
      console.log('[camera] capabilities:', caps);
      console.log('[camera] negotiated settings:', settings);
      if (caps?.frameRate) {
        console.log(
          `[camera] max frame rate supported: ${caps.frameRate.max} FPS ` +
            `(currently using ${settings.frameRate} FPS)`,
          );
      }
    }

    setCameraReady(true);
    setIsLoading(false);
  }, []);

  const handleWebcamError = useCallback((error: string | DOMException) => {
    console.error('[webcam] error:', error);
    const message =
      error instanceof DOMException
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Error accessing camera';
    setLastError(message);
    setIsLoading(false);
  }, []);

  const drawLandmarks = useCallback(
    (
      canvas: HTMLCanvasElement,
      video: HTMLVideoElement,
      faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>,
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Keep canvas sized to video
      if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);

      if (faceLandmarks.length > 0) {
        // Lazily construct DrawingUtils the first time we have a live 2D context
        if (!drawingUtilsRef.current) {
          drawingUtilsRef.current = new DrawingUtils(ctx);
        }
        const drawingUtils = drawingUtilsRef.current;

        for (const landmarks of faceLandmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: 'rgba(255, 255, 255, 0.2)', lineWidth: 0.5 },
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 1 },
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
            { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 1 },
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
            { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 1 },
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
            { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 1 },
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
            { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 1 },
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LIPS,
            { color: 'rgba(255, 255, 255, 0.8)', lineWidth: 1 },
          );
        }
      }

      ctx.restore();
    },
    [],
  );

  // Per-frame handler invoked via requestVideoFrameCallback
  const processVideoFrame = useCallback(() => {
    if (!isRunningRef.current) return;

    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    const landmarker = faceLandmarkerRef.current;

    if (!video || !canvas || !landmarker) {
      // Not ready — reschedule and try again next frame
      if (video && 'requestVideoFrameCallback' in video) {
        rVFCHandleRef.current = (video as HTMLVideoElement).requestVideoFrameCallback(
          processVideoFrame,
        );
      }
      return;
    }

    if (video.readyState >= 2) {
      try {
        const timestamp = performance.now();
        const results = landmarker.detectForVideo(video, timestamp);

        // Hot path: extract smoothed head pose and push directly to Three.js scene
        // (bypassing React state to avoid per-frame reconciliation)
        const smoothedPose = headPoseTrackerRef.current.extractHeadPoseFromLandmarks(
          results.faceLandmarks,
        );

        if (smoothedPose) {
          threeViewRef?.current?.updateHeadPose(smoothedPose);
        }

        // Throttled React-state side effects (debug UI, optional consumers)
        if (timestamp - lastHeadPoseReportRef.current >= HEAD_POSE_THROTTLE_MS) {
          lastHeadPoseReportRef.current = timestamp;
          onHeadPoseUpdate?.(smoothedPose);
        }

        // Draw landmarks on the thumbnail canvas (mirrored to match video)
        drawLandmarks(canvas, video, results.faceLandmarks);

        // Update rolling FPS counter and report (throttled)
        const fps = updateFpsCounter(timestamp);
        if (fps > 0 && timestamp - lastFpsReportRef.current >= FPS_REPORT_THROTTLE_MS) {
          lastFpsReportRef.current = timestamp;
          onFpsUpdate?.(fps);
        }
      } catch (error) {
        console.error('[face-landmarker] detect error:', error);
      }
    }

    // Schedule next frame — rVFC fires exactly once per new video frame,
    // so inference runs at the webcam's native FPS (up to whatever browser/OS exposes)
    if ('requestVideoFrameCallback' in video) {
      rVFCHandleRef.current = (video as HTMLVideoElement).requestVideoFrameCallback(
        processVideoFrame,
      );
    }
  }, [drawLandmarks, onHeadPoseUpdate, onFpsUpdate, threeViewRef]);

  const updateFpsCounter = (now: number): number => {
    const buf = fpsBufferRef.current;
    buf.push(now);
    if (buf.length > CAMERA_FPS_WINDOW) {
      buf.shift();
    }
    if (buf.length < 2) return 0;
    const spanSeconds = (buf[buf.length - 1] - buf[0]) / 1000;
    if (spanSeconds <= 0) return 0;
    return Math.round(((buf.length - 1) / spanSeconds) * 10) / 10;
  };

  // Start / stop the rVFC loop when both webcam and landmarker are ready
  useEffect(() => {
    if (!cameraReady || !isLandmarkerReady) return;

    const video = webcamRef.current?.video;
    if (!video) return;

    if (!('requestVideoFrameCallback' in video)) {
      console.warn(
        '[face-landmarker] requestVideoFrameCallback not supported; falling back to requestAnimationFrame',
      );
    }

    console.log('[face-landmarker] starting inference loop');
    isRunningRef.current = true;
    lastHeadPoseReportRef.current = 0;
    lastFpsReportRef.current = 0;

    if ('requestVideoFrameCallback' in video) {
      rVFCHandleRef.current = (video as HTMLVideoElement).requestVideoFrameCallback(
        processVideoFrame,
      );
    } else {
      // Fallback — should not happen in modern Chrome/Safari 16+
      const tick = () => {
        processVideoFrame();
        if (isRunningRef.current) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }

    // Capture the video element once so the cleanup function doesn't reach through
    // a ref that may have been mutated by the time it runs
    const capturedVideo = video;
    return () => {
      console.log('[face-landmarker] stopping inference loop');
      isRunningRef.current = false;
      if (rVFCHandleRef.current !== null && 'cancelVideoFrameCallback' in capturedVideo) {
        capturedVideo.cancelVideoFrameCallback(rVFCHandleRef.current);
      }
      rVFCHandleRef.current = null;
    };
  }, [cameraReady, isLandmarkerReady, processVideoFrame]);

  const handleRetry = () => {
    setLastError(null);
    window.location.reload();
  };

  return (
    <div className="relative w-full h-full">
      {isLoading && !cameraReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-30 text-white">
          <div className="text-center">
            <p className="text-sm">Loading camera...</p>
          </div>
        </div>
      )}

      {lastError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-80 z-40 text-white p-2">
          <div className="text-center">
            <p className="text-sm font-medium mb-2">Error</p>
            <p className="text-xs">{lastError}</p>
            <div className="mt-2 flex gap-2 justify-center">
              <button
                className="px-2 py-1 text-xs bg-white text-red-600 font-medium rounded hover:bg-gray-100"
                onClick={handleRetry}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden bg-black">
        <Webcam
          ref={webcamRef}
          width={640}
          height={480}
          mirrored={true}
          audio={false}
          screenshotFormat="image/jpeg"
          onUserMedia={handleWebcamLoad}
          onUserMediaError={handleWebcamError}
          className="w-full h-full object-cover"
          videoConstraints={{
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 60, max: 120 },
            facingMode: 'user',
          }}
        />

        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute top-0 left-0 w-full h-full"
        />
      </div>
    </div>
  );
};

export default FaceMeshView;

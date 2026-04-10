import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { HeadPose } from './headPose';
import { OffAxisCamera } from './offAxisCamera';
import { calibrationManager, CalibrationData } from './calibration';

export interface ThreeSceneOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
}

/** Path to the GLB room model in public/models/ */
const ROOM_GLB_PATH = '/models/the_great_drawing_room.glb';

/** User-tuned default transform for the room model */
const DEFAULT_ROOM_POSITION = { x: 0.07, y: -0.14, z: -0.1 } as const;
const DEFAULT_ROOM_SCALE = 0.053;
const DEFAULT_ROOM_ROTATION_Y = 48 * Math.PI / 180; // 48°

/** Rolling window size for render FPS calculation */
const RENDER_FPS_WINDOW = 60;

export class ThreeSceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private offAxisCamera: OffAxisCamera;
  private model: THREE.Object3D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private currentHeadPose: HeadPose = { x: 0.5, y: 0.5, z: 1 };
  private debugMode: boolean = false;
  private debugHelpers: THREE.Object3D[] = [];
  private roomObjects: THREE.Object3D[] = [];
  private frameTimestamps: number[] = [];
  private renderFps: number = 0;

  constructor(options: ThreeSceneOptions) {
    const width = options.width || options.container.clientWidth;
    const height = options.height || options.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = 5;

    const calibration = calibrationManager.getCalibration();
    calibration.pixelWidth = width;
    calibration.pixelHeight = height;
    calibrationManager.updatePixelDimensions(width, height);

    this.offAxisCamera = new OffAxisCamera(this.camera, calibration);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Enable clipping planes to slice the room's front wall open
    this.renderer.localClippingEnabled = true;
    options.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.loadGLBRoom();
    this.createDebugHelpers();
  }

  private setupLighting(): void {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Main directional light (simulates window/ceiling light)
    const mainLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    mainLight.position.set(0.2, 0.3, 0.5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.set(1024, 1024);
    mainLight.shadow.camera.near = 0.01;
    mainLight.shadow.camera.far = 5;
    this.scene.add(mainLight);

    // Fill light from the opposite side
    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.4);
    fillLight.position.set(-0.3, 0.1, -0.2);
    this.scene.add(fillLight);

    // Warm point light (simulates a lamp in the room)
    const pointLight = new THREE.PointLight(0xffaa66, 0.5, 2);
    pointLight.position.set(0, 0.1, -0.15);
    this.scene.add(pointLight);
  }

  private loadGLBRoom(): void {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      ROOM_GLB_PATH,
      (gltf) => {
        this.model = gltf.scene;

        // Apply user-tuned default transform
        this.model.position.set(
          DEFAULT_ROOM_POSITION.x,
          DEFAULT_ROOM_POSITION.y,
          DEFAULT_ROOM_POSITION.z
        );
        this.model.scale.setScalar(DEFAULT_ROOM_SCALE);
        this.model.rotation.set(0, DEFAULT_ROOM_ROTATION_Y, 0);

        // Clipping plane at z=0 (screen surface) — slices away
        // the front wall so we look "through the screen" into the room
        const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

        // Enable shadows, double-sided rendering, and clipping on all meshes
        this.model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            const applyToMaterial = (m: THREE.Material) => {
              m.side = THREE.DoubleSide;
              m.clippingPlanes = [clipPlane];
              m.clipShadows = true;
            };
            if (Array.isArray(child.material)) {
              child.material.forEach(applyToMaterial);
            } else if (child.material instanceof THREE.Material) {
              applyToMaterial(child.material);
            }
          }
        });

        this.scene.add(this.model);
      },
      (progress) => {
        if (progress.total > 0) {
          const pct = ((progress.loaded / progress.total) * 100).toFixed(0);
          console.log(`Loading room: ${pct}%`);
        }
      },
      (error) => {
        console.error('Error loading room model:', error);
      }
    );
  }

  private createDebugHelpers(): void {
    const axesHelper = new THREE.AxesHelper(0.1);
    axesHelper.visible = false;
    this.debugHelpers.push(axesHelper);
    this.scene.add(axesHelper);

    const headPositionMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    headPositionMarker.visible = false;
    this.debugHelpers.push(headPositionMarker);
    this.scene.add(headPositionMarker);
  }

  updateHeadPose(headPose: HeadPose): void {
    this.currentHeadPose = headPose;
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.debugHelpers.forEach(helper => {
      helper.visible = enabled;
    });
  }

  updateCalibration(calibration: CalibrationData): void {
    this.offAxisCamera.updateCalibration(calibration);
  }

  updateModelPosition(x: number, y: number, z: number): void {
    if (this.model) {
      this.model.position.set(x, y, z);
    }
  }

  updateModelScale(scale: number): void {
    if (this.model) {
      this.model.scale.set(scale, scale, scale);
    }
  }

  getModelPosition(): { x: number; y: number; z: number } {
    if (this.model) {
      return {
        x: this.model.position.x,
        y: this.model.position.y,
        z: this.model.position.z
      };
    }
    return { ...DEFAULT_ROOM_POSITION };
  }

  getModelScale(): number {
    if (this.model) {
      return this.model.scale.x;
    }
    return DEFAULT_ROOM_SCALE;
  }

  updateModelRotation(x: number, y: number, z: number): void {
    if (this.model) {
      this.model.rotation.set(x, y, z);
    }
  }

  getModelRotation(): { x: number; y: number; z: number } {
    if (this.model) {
      return {
        x: this.model.rotation.x,
        y: this.model.rotation.y,
        z: this.model.rotation.z
      };
    }
    return { x: 0, y: DEFAULT_ROOM_ROTATION_Y, z: 0 };
  }

  private animate = (): void => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    // Track rolling render FPS
    const now = performance.now();
    this.frameTimestamps.push(now);
    if (this.frameTimestamps.length > RENDER_FPS_WINDOW) {
      this.frameTimestamps.shift();
    }
    if (this.frameTimestamps.length >= 2) {
      const spanSeconds = (this.frameTimestamps[this.frameTimestamps.length - 1] - this.frameTimestamps[0]) / 1000;
      if (spanSeconds > 0) {
        this.renderFps = Math.round(((this.frameTimestamps.length - 1) / spanSeconds) * 10) / 10;
      }
    }

    this.offAxisCamera.updateFromHeadPose(this.currentHeadPose);

    if (this.debugMode && this.debugHelpers.length > 1) {
      const worldPos = this.offAxisCamera.headPoseToWorldPosition(this.currentHeadPose);
      this.debugHelpers[1].position.set(worldPos.x, worldPos.y, worldPos.z);
    }

    this.renderer.render(this.scene, this.camera);
  };

  getRenderFps(): number {
    return this.renderFps;
  }

  start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.stop();

    if (this.model) {
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }

    this.renderer.dispose();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}

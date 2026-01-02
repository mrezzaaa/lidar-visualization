import React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Point2D } from '../logic/Parser';

interface LidarViewerProps {
    points2D: Point2D[];
    points3D: Float32Array | null; 
    meshMode: boolean;
    slamPoints: Point2D[];  // Accumulated SLAM points
}

export class LidarViewer extends React.Component<LidarViewerProps, {
    hoveredPoint: { distance: number; x: number; y: number; z: number; angle: number } | null;
    }> {
    private mountRef: React.RefObject<HTMLDivElement>;
    private scene: THREE.Scene | null = null;
    private camera: THREE.OrthographicCamera | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private controls: OrbitControls | null = null;
    private cloud2D: THREE.Points | null = null;
    private geometry2D: THREE.BufferGeometry | null = null;
    private geometry3D: THREE.BufferGeometry | null = null;
    private points3D: THREE.Points | null = null;
    
    // SLAM visualization - persistent accumulated points
    private slamCloud: THREE.Points | null = null;
    private slamGeometry: THREE.BufferGeometry | null = null;
    
    // Point hover detection
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    
    constructor(props: LidarViewerProps) {
        super(props);
        this.mountRef = React.createRef();
        this.state = {
            hoveredPoint: null
        };
    }
    
    componentDidMount() {
        // console.log('[LidarViewer] componentDidMount called');
        this.initThreeJS();
        
        // Wire mouse move listener for point hover
        if (this.renderer) {
            this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove);
        }
    }
    
    componentWillUnmount() {
        // console.log('[LidarViewer] componentWillUnmount called');
        
        // Remove mouse listener
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove);
            this.renderer.dispose();
            if (this.mountRef.current && this.renderer.domElement.parentElement === this.mountRef.current) {
                this.mountRef.current.removeChild(this.renderer.domElement);
            }
        }
        // Reset refs
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
    }
    
    componentDidUpdate(prevProps: LidarViewerProps) {
        // Update 2D points when they change
        if (prevProps.points2D !== this.props.points2D) {
            this.update2DPoints();
        }
        
        // Update 3D points when they change
        if (prevProps.points3D !== this.props.points3D) {
            this.update3DPoints();
        }
        
        // Update mesh mode (if needed for future mesh rendering)
        if (prevProps.meshMode !== this.props.meshMode) {
            // meshMode logic here if needed
        }
        
        // Update SLAM points - check length change since array reference stays same
        const prevSlamCount = prevProps.slamPoints.length;
        const currentSlamCount = this.props.slamPoints.length;
        
        // console.log('[LidarViewer] componentDidUpdate - SLAM points:', currentSlamCount, 'prev:', prevSlamCount);
        
        if (currentSlamCount > 0 && currentSlamCount !== prevSlamCount) {
            // console.log('[LidarViewer] Updating SLAM with', currentSlamCount, 'points');
            this.updateSlamPoints();
        } else if (currentSlamCount === 0 && this.slamCloud) {
            // Hide SLAM cloud when no points
            this.slamCloud.visible = false;
        }
    }
    
    private initThreeJS() {
        if (!this.mountRef.current) return;
        
        // Guard against double initialization  
        if (this.scene !== null) {
            // console.log('[LidarViewer] Already initialized, skipping');
            return;
        }
        
        // CRITICAL: Remove ALL existing canvases from mount point
        const existingCanvases = this.mountRef.current.querySelectorAll('canvas');
        // console.log(`[LidarViewer] Found ${existingCanvases.length} existing canvas(es), removing...`);
        existingCanvases.forEach(canvas => {
            canvas.remove();
        });
        
        // console.log('[LidarViewer] Initializing Three.js (Class Component)');
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        // Camera
        const width = this.mountRef.current.clientWidth;
        const height = this.mountRef.current.clientHeight;
        const aspect = width / height;
        const frustumSize = 10;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            100
        );
        this.camera.position.set(10, 10, 10);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.mountRef.current.appendChild(this.renderer.domElement);
        
        // console.log('[LidarViewer] Canvas created. Total canvases:', document.querySelectorAll('canvas').length);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enabled = true;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        
        // Expose to window for debugging
        (window as any).threeCamera = this.camera;
        (window as any).threeControls = this.controls;
        (window as any).threeRenderer = this.renderer;
        (window as any).threeScene = this.scene;
        
        // console.log('[LidarViewer] OrbitControls initialized');

        // Grid
        const grid = new THREE.GridHelper(10, 20, 0x444444, 0x222222);
        this.scene.add(grid);

        // Axes - Standard length (2 meters)
        const axesHelper = new THREE.AxesHelper(2);
        this.scene.add(axesHelper);
        
        // Add axis lines
        const axisGroup = new THREE.Group();
        const createAxisLine = (color: number, endPoint: THREE.Vector3) => {
            const points = [new THREE.Vector3(0,0,0), endPoint];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({ color: color });
            return new THREE.Line(geo, mat);
        };
        axisGroup.add(createAxisLine(0xff0000, new THREE.Vector3(2, 0, 0))); // X - Red
        axisGroup.add(createAxisLine(0x00ff00, new THREE.Vector3(0, 2, 0))); // Y - Green  
        axisGroup.add(createAxisLine(0x0000ff, new THREE.Vector3(0, 0, 2))); // Z - Blue
        this.scene.add(axisGroup);
        
        // Add TEXT LABELS for axes using HTML overlays
        this.addAxisLabels();
        
        // Initialize SLAM point cloud for accumulating scans
        this.initSlamCloud();

        // 2D Cloud - Points
        const MAX_POINTS = 1000;
        this.geometry2D = new THREE.BufferGeometry();
        const positions2D = new Float32Array(MAX_POINTS * 3);
        const colors2D = new Float32Array(MAX_POINTS * 3);
        this.geometry2D.setAttribute('position', new THREE.BufferAttribute(positions2D, 3));
        this.geometry2D.setAttribute('color', new THREE.BufferAttribute(colors2D, 3));
        const mat2D = new THREE.PointsMaterial({ 
            size: 5, 
            vertexColors: false,
            sizeAttenuation: false,
            color: 0xff0000  // Red
        });
        this.cloud2D = new THREE.Points(this.geometry2D, mat2D);
        this.cloud2D.frustumCulled = false;
        this.scene.add(this.cloud2D);

        // 3D Cloud
        this.geometry3D = new THREE.BufferGeometry();
        const MAX_3D = 100000;
        const pos3D = new Float32Array(MAX_3D * 3);
        const col3D = new Float32Array(MAX_3D * 3);
        this.geometry3D.setAttribute('position', new THREE.BufferAttribute(pos3D, 3));
        this.geometry3D.setAttribute('color', new THREE.BufferAttribute(col3D, 3));
        const mat3D = new THREE.PointsMaterial({ size: 2, vertexColors: true }); // Increased size for visibility
        this.points3D = new THREE.Points(this.geometry3D, mat3D);
        this.points3D.visible = true; // Show 3D points when data exists
        this.scene.add(this.points3D);

        // Animation loop
        this.animate();
    }
    
    private animate = () => {
        requestAnimationFrame(this.animate);
        if (this.controls) this.controls.update();
        
        // REMOVED: SLAM update from animation loop - causes memory leak!
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    };
    
    private addAxisLabels() {
        if (!this.mountRef.current || !this.scene || !this.camera) return;
        
        // Create simple HTML text labels positioned at axis endpoints
        const createLabel = (text: string, position: THREE.Vector3, color: string) => {
            const div = document.createElement('div');
            div.textContent = text;
            div.style.position = 'absolute';
            div.style.color = color;
            div.style.fontSize = '16px';
            div.style.fontWeight = 'bold';
            div.style.fontFamily = 'monospace';
            div.style.pointerEvents = 'none';
            div.style.backgroundColor = 'rgba(0,0,0,0.5)';
            div.style.padding = '2px 4px';
            div.style.borderRadius = '3px';
            
            // Convert 3D position to screen coordinates
            const updatePosition = () => {
                if (!this.camera || !this.renderer) return;
                const vector = position.clone().project(this.camera);
                const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
                const y = (vector.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;
                div.style.left = `${x}px`;
                div.style.top = `${y}px`;
            };
            
            // Add to mount container
            this.mountRef.current.appendChild(div);
            
            // Update position every frame (simple approach)
            const origAnimate = this.animate;
            this.animate = () => {
                origAnimate();
                updatePosition();
            };
            
            updatePosition();
        };
        
        // Add labels at axis endpoints
        createLabel('X', new THREE.Vector3(2.2, 0, 0), '#ff9999ff');
        createLabel('Y', new THREE.Vector3(0, 2.2, 0), '#00ff00');
        createLabel('Z', new THREE.Vector3(0, 0, 2.2), '#8989f4ff');
    }
    
    private handleMouseMove = (event: MouseEvent) => {
        if (!this.mountRef.current || !this.camera || !this.cloud2D || !this.renderer) return;
        
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Update raycaster with camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Set raycaster params for point detection (increase threshold for easier selection)
        this.raycaster.params.Points = { threshold: 0.1 };
        
        // Check for intersections with both live 2D cloud and SLAM accumulated points
        const objectsToCheck = [this.cloud2D];
        if (this.slamCloud && this.slamCloud.visible) {
            objectsToCheck.push(this.slamCloud);
        }
        
        const intersects = this.raycaster.intersectObjects(objectsToCheck);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            // Calculate distance from origin (in XZ plane for 2D)
            const distance = Math.sqrt(point.x * point.x + point.z * point.z);
            
            // Calculate angle in degrees (-60 to +60)
            const angle = Math.atan2(-point.x, point.z) * (180 / Math.PI);
            
            // Update state with hovered point info
            this.setState({
                hoveredPoint: {
                    distance,
                    x: point.x,
                    y: point.y,
                    z: point.z,
                    angle
                }
            });
        } else {
            // No point under cursor - clear hover state
            if (this.state.hoveredPoint !== null) {
                this.setState({ hoveredPoint: null });
            }
        }
    };
    
    private initSlamCloud() {
        if (!this.scene) return;
        
        // Create geometry for accumulated SLAM points
        const MAX_SLAM_POINTS = 50000;
        this.slamGeometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(MAX_SLAM_POINTS * 3);
        const colors = new Float32Array(MAX_SLAM_POINTS * 3);
        
        this.slamGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.slamGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.slamGeometry.setDrawRange(0, 0); // Initially no points
        
        // Create material - slightly transparent cyan for accumulated points
        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.7
        });
        
        this.slamCloud = new THREE.Points(this.slamGeometry, material);
        this.scene.add(this.slamCloud);
        
        // console.log('[LidarViewer] SLAM point cloud initialized');
    }
    
    private updateSlamPoints() {
        if (!this.slamGeometry) {
            console.warn('[LidarViewer] slamGeometry is null!');
            return;
        }
        
        const slamPoints = this.props.slamPoints;
        const numPoints = Math.min(slamPoints.length, 50000); // Cap at max
        
        // console.log('[LidarViewer] updateSlamPoints called with', numPoints, 'points');
        
        if (numPoints === 0) return;
        
        const positions = this.slamGeometry.attributes.position.array as Float32Array;
        const colors = this.slamGeometry.attributes.color.array as Float32Array;
        
        // Update positions and colors from accumulated SLAM points
        for (let i = 0; i < numPoints; i++) {
            const point = slamPoints[i];
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y || 0;
            positions[i * 3 + 2] = point.z;
            
            // Use cyan color for SLAM points to differentiate from live scan (red)
            colors[i * 3] = 0; // R
            colors[i * 3 + 1] = 0.8;  // G
            colors[i * 3 + 2] = 1.0;   // B (cyan)
        }
        
        this.slamGeometry.attributes.position.needsUpdate = true;
        this.slamGeometry.attributes.color.needsUpdate = true;
        this.slamGeometry.setDrawRange(0, numPoints);
        
        if (this.slamCloud) {
            this.slamCloud.visible = true;
            // console.log('[LidarViewer] SLAM cloud set to visible with', numPoints, 'points');
        }
    }
    
    private update2DPoints() {
        if (!this.geometry2D) return;

        const positions = this.geometry2D.attributes.position.array as Float32Array;
        const colors = this.geometry2D.attributes.color.array as Float32Array;

        if (this.props.points2D.length === 0) {
            this.geometry2D.setDrawRange(0, 0);
            return;
        }

        // Write individual points
        for (let i = 0; i < this.props.points2D.length; i++) {
            const p = this.props.points2D[i];
            
            positions[i*3] = p.x;
            positions[i*3+1] = 0; // Flat on the grid (was 0.05)
            positions[i*3+2] = p.z;
            
            colors[i*3] = 1;     // Red
            colors[i*3+1] = 0;
            colors[i*3+2] = 0;
        }

        this.geometry2D.attributes.position.needsUpdate = true;
        this.geometry2D.attributes.color.needsUpdate = true;
        this.geometry2D.setDrawRange(0, this.props.points2D.length);
        this.geometry2D.computeBoundingSphere();
        
        if (this.cloud2D) {
            this.cloud2D.visible = true;
        }
    }
    
    private update3DPoints() {
        if (!this.geometry3D || !this.props.points3D) return;
        
        const positions = this.geometry3D.attributes.position.array as Float32Array;
        const colors = this.geometry3D.attributes.color.array as Float32Array;
        
        const data = this.props.points3D;
        let validCount = 0;
        
        for (let i = 0; i < data.length / 4; i++) {
            const x = data[i*4];
            const y = data[i*4+1];
            const z = data[i*4+2];
            const c = data[i*4+3];
            
            if (x !== 0 || y !== 0 || z !== 0) {
                positions[validCount*3] = x;
                positions[validCount*3+1] = y;
                positions[validCount*3+2] = z;
                
                colors[validCount*3] = c;
                colors[validCount*3+1] = c;
                colors[validCount*3+2] = c;
                
                validCount++;
            }
        }
        
        this.geometry3D.attributes.position.needsUpdate = true;
        this.geometry3D.attributes.color.needsUpdate = true;
        this.geometry3D.setDrawRange(0, validCount);
        this.geometry3D.computeBoundingSphere();
        
        // console.log(`[LidarViewer] 3D points updated: ${validCount} valid points rendered`);
        // Ensure points are visible when we have data
        if (this.points3D && validCount > 0) {
            this.points3D.visible = true;
        }
    }
    
    private handleResetView = () => {
        // console.log('[LidarViewer] Reset View clicked');
        if (!this.camera || !this.controls || !this.mountRef.current) {
            console.warn('[LidarViewer] Reset View: refs not available');
            return;
        }
        
        const width = this.mountRef.current.clientWidth;
        const height = this.mountRef.current.clientHeight;
        const aspect = width / height;
        const frustumSize = 10;
        
        // console.log('[LidarViewer] Before reset - Position:', this.camera.position, 'Zoom:', this.camera.zoom);
        
        this.camera.left = frustumSize * aspect / -2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = frustumSize / -2;
        this.camera.position.set(1.5, 1.5, 1.5);
        this.camera.lookAt(0, 0, 0);
        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();
        
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        
        if (this.renderer && this.scene) {
            this.renderer.render(this.scene, this.camera);
        }
        
        // console.log('[LidarViewer] After reset - Position:', this.camera.position, 'Zoom:', this.camera.zoom);
        // console.log('[LidarViewer] Reset View complete');
    };
    
    render() {
        return (
            <div ref={this.mountRef} className="flex-1 overflow-hidden relative cursor-crosshair">
                {/* Camera Controls Overlay */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                    <button 
                        onClick={this.handleResetView}
                        className="bg-gray-800/80 hover:bg-gray-700 text-white p-2 rounded shadow backdrop-blur-sm"
                        title="Reset View"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                        </svg>
                    </button>
                </div>
                
                {/* Point Hover Tooltip */}
                {this.state.hoveredPoint && (
                    <div className="absolute bottom-4 left-4 z-10 bg-black/90 text-white p-3 rounded-lg shadow-lg backdrop-blur-sm font-mono text-sm border border-gray-700">
                        <div className="font-bold text-green-400 mb-1">Point Info</div>
                        <div className="space-y-0.5">
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-400">Distance:</span>
                                <span className="text-white font-semibold">{this.state.hoveredPoint.distance.toFixed(3)} m</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-400">Angle:</span>
                                <span className="text-white font-semibold">{this.state.hoveredPoint.angle.toFixed(1)}°</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-400">X:</span>
                                <span className="text-white">{this.state.hoveredPoint.x.toFixed(3)} m</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-400">Z:</span>
                                <span className="text-white">{this.state.hoveredPoint.z.toFixed(3)} m</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

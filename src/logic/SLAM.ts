import { Point2D } from './Parser';

export interface SLAMConfig {
    maxPoints: number;  // Maximum accumulated points
}

export class SLAM {
    private accumulatedPoints: Point2D[] = [];
    private isMapping: boolean = false;
    private maxPoints: number;
    
    constructor(config: SLAMConfig) {
        this.maxPoints = config.maxPoints;
        // console.log(`[SLAM] Initialized with max ${config.maxPoints} points`);
    }
    
    addScan(points: Point2D[]) {
        if (!this.isMapping) return;
        
        // Add all points from this scan to accumulated points
        this.accumulatedPoints.push(...points);
        
        // Keep only most recent points if exceeding max
        if (this.accumulatedPoints.length > this.maxPoints) {
            const excess = this.accumulatedPoints.length - this.maxPoints;
            this.accumulatedPoints = this.accumulatedPoints.slice(excess);
        }
    }
    
    getPoints(): Point2D[] {
        return this.accumulatedPoints;
    }
    
    getPointCount(): number {
        return this.accumulatedPoints.length;
    }
    
    reset() {
        this.accumulatedPoints = [];
        // console.log('[SLAM] Map reset');
    }
    
    start() {
        this.isMapping = true;
        // console.log('[SLAM] Mapping started');
    }
    
    stop() {
        this.isMapping = false;
        // console.log('[SLAM] Mapping stopped - accumulated', this.accumulatedPoints.length, 'points');
    }
    
    isActive(): boolean {
        return this.isMapping;
    }
}

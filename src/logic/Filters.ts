
import { Point2D } from './Parser';

// Helper to calculate Euclidean distance squared
const distSq = (p1: Point2D, p2: Point2D) => {
    const dx = p1.x - p2.x;
    const dz = p1.z - p2.z; // y is usually 0 in 2D
    return dx*dx + dz*dz;
}

const dist = (p1: Point2D, p2: Point2D) => Math.sqrt(distSq(p1, p2));

// 1. Statistical Outlier Removal (SOR)
export const applySOR = (points: Point2D[], k: number = 5, sigma: number = 1.0): Point2D[] => {
    if (points.length < k + 1) return points;

    const meanDistances: number[] = [];
    
    // Calculate mean distance to k nearest neighbors for each point
    for (let i = 0; i < points.length; i++) {
        let distances: number[] = [];
        for (let j = 0; j < points.length; j++) {
            if (i === j) continue;
            distances.push(dist(points[i], points[j]));
        }
        distances.sort((a, b) => a - b);
        // Take mean of k nearest
        const kSum = distances.slice(0, k).reduce((a, b) => a + b, 0);
        meanDistances.push(kSum / k);
    }

    // Global stats
    const globalMean = meanDistances.reduce((a, b) => a + b, 0) / meanDistances.length;
    const variance = meanDistances.reduce((a, b) => a + Math.pow(b - globalMean, 2), 0) / meanDistances.length;
    const stdDev = Math.sqrt(variance);
    const threshold = globalMean + sigma * stdDev;

    return points.filter((_, i) => meanDistances[i] <= threshold);
};

// 2. Radius Outlier Removal (ROR)
export const applyROR = (points: Point2D[], radius: number = 0.5, minNeighbors: number = 2): Point2D[] => {
    const squaredRadius = radius * radius;
    return points.filter((p, i) => {
        let neighbors = 0;
        for (let j = 0; j < points.length; j++) {
            if (i === j) continue;
            if (distSq(p, points[j]) < squaredRadius) {
                neighbors++;
            }
        }
        return neighbors >= minNeighbors;
    });
};

// 3. Moving Least Squares (Simplified to Moving Average Smoothing for Realtime)
// True MLS is expensive; this approximates "smoothing" the line.
export const applyMLS = (points: Point2D[], windowSize: number = 3): Point2D[] => {
    if (points.length < windowSize) return points;
    
    // Assuming points are somewhat ordered by angle (which they are from parser)
    const smoothed: Point2D[] = [];
    const offset = Math.floor(windowSize / 2);

    for (let i = 0; i < points.length; i++) {
        let sumX = 0;
        let sumZ = 0;
        let count = 0;

        for (let j = -offset; j <= offset; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < points.length) {
                sumX += points[idx].x;
                sumZ += points[idx].z;
                count++;
            }
        }
        
        smoothed.push({
            x: sumX / count,
            y: points[i].y,
            z: sumZ / count,
            color: points[i].color
        });
    }
    return smoothed;
}

// 4. DBSCAN (Density-Based Spatial Clustering)
export const applyDBSCAN = (points: Point2D[], eps: number = 0.5, minPts: number = 3): Point2D[] => {
    const clusters: Point2D[][] = [];
    const visited = new Set<number>();
    const noise = new Set<number>();

    const getNeighbors = (idx: number): number[] => {
        const neighbors: number[] = [];
        for (let i = 0; i < points.length; i++) {
            if (i === idx) continue;
            if (dist(points[idx], points[i]) <= eps) {
                neighbors.push(i);
            }
        }
        return neighbors;
    }

    for (let i = 0; i < points.length; i++) {
        if (visited.has(i)) continue;
        visited.add(i);

        const neighbors = getNeighbors(i);
        if (neighbors.length < minPts) {
            noise.add(i);
        } else {
            const cluster: Point2D[] = [points[i]];
            // Expand cluster
            // Note: simplistic implementation, usually queue based
            const seeds = [...neighbors];
            for (let j = 0; j < seeds.length; j++) {
                const qPointIdx = seeds[j];
                if (!visited.has(qPointIdx)) {
                    visited.add(qPointIdx);
                    const qNeighbors = getNeighbors(qPointIdx);
                    if (qNeighbors.length >= minPts) {
                        seeds.push(...qNeighbors);
                    }
                }
                // If not yet member of any cluster (simplified here by adding everything in exp)
                // In full DBSCAN we check cluster assignment. 
                // For 'filtering', we typically KEEP points that are in clusters and REMOVE noise.
                cluster.push(points[qPointIdx]);
            }
            clusters.push(cluster);
        }
    }

    // Return all points belonging to valid clusters
    return clusters.flat();
};

// 5. PointCleanNet Placeholder
export const applyPointCleanNet = (points: Point2D[]): Point2D[] => {
    // Requires pre-trained model inference (TF.js). 
    // Fallback to strict SOR + Smoothing combination for "Smart Clean"
    const sor = applySOR(points, 5, 0.8);
    return applyMLS(sor, 5);
}

// 6. Voxel Grid Downsampling
export const applyVoxelGrid = (points: Point2D[], voxelSize: number = 0.1): Point2D[] => {
    if (points.length === 0) return points;
    
    // Group points into voxels and average them
    const voxelMap = new Map<string, Point2D[]>();
    
    points.forEach(p => {
        const vx = Math.floor(p.x / voxelSize);
        const vy = Math.floor((p.y || 0) / voxelSize);
        const vz = Math.floor(p.z / voxelSize);
        const key = `${vx},${vy},${vz}`;
        
        if (!voxelMap.has(key)) {
            voxelMap.set(key, []);
        }
        voxelMap.get(key)!.push(p);
    });
    
    // Average points in each voxel
    const downsampled: Point2D[] = [];
    voxelMap.forEach(voxelPoints => {
        const n = voxelPoints.length;
        const avg: Point2D = {
            x: voxelPoints.reduce((s, p) => s + p.x, 0) / n,
            y: voxelPoints.reduce((s, p) => s + (p.y || 0), 0) / n,
            z: voxelPoints.reduce((s, p) => s + p.z, 0) / n,
            color: voxelPoints[0].color // Use first point's color
        };
        downsampled.push(avg);
    });
    
    return downsampled;
};

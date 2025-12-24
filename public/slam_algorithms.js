// Voxel Grid Filter for Point Cloud Downsampling
class VoxelGridFilter {
    constructor(voxelSize = 0.05) {
        this.voxelSize = voxelSize;
    }
    
    filter(points) {
        // points = array of {x, y, z, color}
        const voxelMap = new Map();
        
        points.forEach(p => {
            const vx = Math.floor(p.x / this.voxelSize);
            const vy = Math.floor(p.y / this.voxelSize);
            const vz = Math.floor(p.z / this.voxelSize);
            const key = `${vx},${vy},${vz}`;
            
            if (!voxelMap.has(key)) {
                voxelMap.set(key, []);
            }
            voxelMap.get(key).push(p);
        });
        
        // Average points in each voxel
        const filtered = [];
        voxelMap.forEach(voxelPoints => {
            const n = voxelPoints.length;
            const avg = {
                x: voxelPoints.reduce((s, p) => s + p.x, 0) / n,
                y: voxelPoints.reduce((s, p) => s + p.y, 0) / n,
                z: voxelPoints.reduce((s, p) => s + p.z, 0) / n,
                r: voxelPoints.reduce((s, p) => s + p.r, 0) / n,
                g: voxelPoints.reduce((s, p) => s + p.g, 0) / n,
                b: voxelPoints.reduce((s, p) => s + p.b, 0) / n
            };
            filtered.push(avg);
        });
        
        return filtered;
    }
}

// Simple ICP for 2D SLAM (X-Y plane only for efficiency)
class SimpleICP {
    constructor(maxIterations = 50, tolerance = 0.001) {
        this.maxIterations = maxIterations;
        this.tolerance = tolerance;
    }
    
    align2D(sourcePoints, targetPoints) {
        // sourcePoints, targetPoints = [{x, y}]
        if (sourcePoints.length === 0 || targetPoints.length === 0) {
            return { x: 0, y: 0, theta: 0, error: Infinity };
        }
        
        let transform = { x: 0, y: 0, theta: 0 };
        let prevError = Infinity;
        
        for (let iter = 0; iter < this.maxIterations; iter++) {
            // Transform source points
            const transformed = sourcePoints.map(p => 
                this.transform2D(p, transform)
            );
            
            // Find correspondences (nearest neighbor)
            const correspondences = [];
            let totalError = 0;
            
            transformed.forEach(src => {
                let minDist = Infinity;
                let closest = null;
                
                targetPoints.forEach(tgt => {
                    const dx = src.x - tgt.x;
                    const dy = src.y - tgt.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist < minDist && dist < 0.5) { // 0.5m threshold
                        minDist = dist;
                        closest = tgt;
                    }
                });
                
                if (closest) {
                    correspondences.push({ src, tgt: closest });
                    totalError += minDist * minDist;
                }
            });
            
            if (correspondences.length < 10) {
                return { x: 0, y: 0, theta: 0, error: Infinity };
            }
            
            const meanError = Math.sqrt(totalError / correspondences.length);
            
            // Check convergence
            if (Math.abs(prevError - meanError) < this.tolerance) {
                break;
            }
            prevError = meanError;
            
            // Compute transformation using SVD-like approach (simplified)
            const deltaT = this.computeTransform2D(correspondences);
            
            // Update transform
            transform.x += deltaT.x;
            transform.y += deltaT.y;
            transform.theta += deltaT.theta;
        }
        
        return { ...transform, error: prevError };
    }
    
    transform2D(point, transform) {
        const cos = Math.cos(transform.theta);
        const sin = Math.sin(transform.theta);
        
        return {
            x: point.x * cos - point.y * sin + transform.x,
            y: point.x * sin + point.y * cos + transform.y
        };
    }
    
    computeTransform2D(correspondences) {
        // Compute centroids
        const n = correspondences.length;
        let srcCx = 0, srcCy = 0, tgtCx = 0, tgtCy = 0;
        
        correspondences.forEach(({ src, tgt }) => {
            srcCx += src.x;
            srcCy += src.y;
            tgtCx += tgt.x;
            tgtCy += tgt.y;
        });
        
        srcCx /= n;
        srcCy /= n;
        tgtCx /= n;
        tgtCy /= n;
        
        // Compute rotation using SVD approximation
        let h11 = 0, h12 = 0, h21 = 0, h22 = 0;
        
        correspondences.forEach(({ src, tgt }) => {
            const sx = src.x - srcCx;
            const sy = src.y - srcCy;
            const tx = tgt.x - tgtCx;
            const ty = tgt.y - tgtCy;
            
            h11 += sx * tx;
            h12 += sx * ty;
            h21 += sy * tx;
            h22 += sy * ty;
        });
        
        // Approximate rotation angle
        const theta = Math.atan2(h21 - h12, h11 + h22);
        
        // Compute translation
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const dx = tgtCx - (srcCx * cos - srcCy * sin);
        const dy = tgtCy - (srcCx * sin + srcCy * cos);
        
        return { x: dx, y: dy, theta };
    }
}

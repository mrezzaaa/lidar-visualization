/**
 * Surface Reconstruction Algorithms for LiDAR Point Cloud
 * Converts sparse 3D points into polygon mesh
 */

class SurfaceReconstruction {
    
    /**
     * Grid-based triangulation with edge filtering
     * Works well for structured data like LiDAR (160×60 grid)
     */
    static gridBasedMesh(positions, width, height, maxEdgeLength = 0.3) {
        const indices = [];
        
        for (let row = 0; row < height - 1; row++) {
            for (let col = 0; col < width - 1; col++) {
                const i0 = row * width + col;
                const i1 = i0 + 1;
                const i2 = i0 + width;
                const i3 = i2 + 1;
                
                // Get vertices
                const v0 = [positions[i0*3], positions[i0*3+1], positions[i0*3+2]];
                const v1 = [positions[i1*3], positions[i1*3+1], positions[i1*3+2]];
                const v2 = [positions[i2*3], positions[i2*3+1], positions[i2*3+2]];
                const v3 = [positions[i3*3], positions[i3*3+1], positions[i3*3+2]];
                
                // Skip if any vertex is invalid (0,0,0)
                if (this.isZero(v0) || this.isZero(v1) || this.isZero(v2) || this.isZero(v3)) {
                    continue;
                }
                
                // Check edge lengths to avoid connecting distant points
                const e01 = this.distance(v0, v1);
                const e02 = this.distance(v0, v2);
                const e12 = this.distance(v1, v2);
                const e13 = this.distance(v1, v3);
                const e23 = this.distance(v2, v3);
                
                // First triangle: v0, v1, v2
                if (e01 < maxEdgeLength && e02 < maxEdgeLength && e12 < maxEdgeLength) {
                    indices.push(i0, i1, i2);
                }
                
                // Second triangle: v1, v3, v2
                if (e13 < maxEdgeLength && e23 < maxEdgeLength && e12 < maxEdgeLength) {
                    indices.push(i1, i3, i2);
                }
            }
        }
        
        return indices;
    }
    
    /**
     * Poisson-like surface reconstruction (simplified)
     * Estimates normals and creates smooth surface
     */
    static poissonReconstruction(positions, width, height) {
        // Step 1: Estimate normals for each point
        const normals = new Float32Array(positions.length);
        
        for (let row = 1; row < height - 1; row++) {
            for (let col = 1; col < width - 1; col++) {
                const i = row * width + col;
                const iLeft = i - 1;
                const iRight = i + 1;
                const iUp = i - width;
                const iDown = i + width;
                
                // Get neighboring points
                const p = [positions[i*3], positions[i*3+1], positions[i*3+2]];
                const pL = [positions[iLeft*3], positions[iLeft*3+1], positions[iLeft*3+2]];
                const pR = [positions[iRight*3], positions[iRight*3+1], positions[iRight*3+2]];
                const pU = [positions[iUp*3], positions[iUp*3+1], positions[iUp*3+2]];
                const pD = [positions[iDown*3], positions[iDown*3+1], positions[iDown*3+2]];
                
                // Compute normal using cross product
                const dx = [pR[0] - pL[0], pR[1] - pL[1], pR[2] - pL[2]];
                const dy = [pD[0] - pU[0], pD[1] - pU[1], pD[2] - pU[2]];
                
                // Cross product: dx × dy
                const nx = dx[1] * dy[2] - dx[2] * dy[1];
                const ny = dx[2] * dy[0] - dx[0] * dy[2];
                const nz = dx[0] * dy[1] - dx[1] * dy[0];
                
                // Normalize
                const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                if (len > 0) {
                    normals[i*3] = nx / len;
                    normals[i*3+1] = ny / len;
                    normals[i*3+2] = nz / len;
                }
            }
        }
        
        return normals;
    }
    
    /**
     * Marching Cubes for voxel-based reconstruction
     * Converts point cloud to voxel grid, then extracts isosurface
     */
    static marchingCubes(positions, voxelSize = 0.1) {
        // Step 1: Convert points to voxel grid
        const voxelMap = new Map();
        
        for (let i = 0; i < positions.length / 3; i++) {
            const x = positions[i*3];
            const y = positions[i*3+1];
            const z = positions[i*3+2];
            
            if (x === 0 && y === 0 && z === 0) continue;
            
            const vx = Math.floor(x / voxelSize);
            const vy = Math.floor(y / voxelSize);
            const vz = Math.floor(z / voxelSize);
            const key = `${vx},${vy},${vz}`;
            
            voxelMap.set(key, true);
        }
        
        // Step 2: Extract surface (simplified - just return occupied voxels)
        // Full marching cubes would create triangles at boundaries
        return voxelMap;
    }
    
    // Helper functions
    static distance(v1, v2) {
        const dx = v1[0] - v2[0];
        const dy = v1[1] - v2[1];
        const dz = v1[2] - v2[2];
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }
    
    static isZero(v) {
        return v[0] === 0 && v[1] === 0 && v[2] === 0;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SurfaceReconstruction;
}

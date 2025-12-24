# Three.js + React Rendering Issue Analysis

## Problem

Lidar 2D point data is being processed correctly (logs show data arrives), but nothing renders on the canvas except debug objects (axes, grid, debug box).

## Root Cause

React Strict Mode in development causes components to mount twice, which creates multiple Three.js scenes/geometries. Our refs may point to stale objects.

## What We've Tried

1. ✅ THREE.Points with PointsMaterial - data updates correctly, but doesn't render
2. ✅ InstancedMesh - same issue
3. ✅ Group with individual Meshes - same issue
4. ✅ LineSegments (vanilla-backup's approach) - same issue

**All approaches have the same symptoms:**

- Geometry exists ✅
- Data is written to buffers ✅
- needsUpdate is set ✅
- computeBoundingSphere() called ✅
- Object is in scene ✅
- **BUT: Nothing renders** ❌

## Key Observation

User said "Tadi sempet bisa" (it briefly worked) - this confirms rendering CAN work, but there's a React lifecycle/ref issue.

## Solution

Need clean implementation with:

1. Proper React ref management
2. Ensure geometry/objects survive React remounts
3. Simple, minimal code following vanilla-backup exactly
4. Proper cleanup in useEffect

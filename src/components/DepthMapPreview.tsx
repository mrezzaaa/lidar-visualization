import React, { useEffect, useRef } from 'react';

interface DepthMapPreviewProps {
    depthData: Uint16Array | null;
    width?: number;
    height?: number;
}

export const DepthMapPreview: React.FC<DepthMapPreviewProps> = ({ 
    depthData, 
    width = 320,  // 2x scale of 160
    height = 120  // 2x scale of 60
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current || !depthData) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const GRID_WIDTH = 160;
        const GRID_HEIGHT = 60;
        
        // Create ImageData for the raw grid
        const imageData = ctx.createImageData(GRID_WIDTH, GRID_HEIGHT);
        const data = imageData.data;

        // Convert depth values to grayscale
        // ONLY map 50-2000mm range, everything else = black
        const MIN_DEPTH = 50;
        const MAX_DEPTH = 2000;

        for (let i = 0; i < depthData.length; i++) {
            const depth = depthData[i];
            
            let r = 0, g = 0, b = 0;
            
            // Valid range: 50-2000mm → grayscale (white=close, black=far)
            if (depth >= MIN_DEPTH && depth <= MAX_DEPTH) {
                const normalized = (depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH);
                const gray = Math.floor((1 - normalized) * 255); // Invert: close=white, far=black
                r = g = b = gray;
            }
            // Everything else (< 50, > 2000, error codes) → black
            else {
                r = g = b = 0;
            }

            data[i * 4] = r;      // R
            data[i * 4 + 1] = g;  // G
            data[i * 4 + 2] = b;  // B
            data[i * 4 + 3] = 255;// A
        }

        // Draw at native resolution first
        ctx.putImageData(imageData, 0, 0);

        // Then scale up using nearest-neighbor (pixelated look)
        ctx.imageSmoothingEnabled = false;
        
        // Create temporary canvas for scaling
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = GRID_WIDTH;
        tempCanvas.height = GRID_HEIGHT;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;
        
        tempCtx.putImageData(imageData, 0, 0);
        
        // Clear main canvas and draw scaled
        canvas.width = width;
        canvas.height = height;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, GRID_WIDTH, GRID_HEIGHT, 0, 0, width, height);

    }, [depthData, width, height]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Depth Map Preview</span>
                <span className="text-xs text-gray-600">160×60</span>
            </div>
            <div className="border border-gray-700 rounded overflow-hidden bg-black">
                <canvas 
                    ref={canvasRef} 
                    width={width} 
                    height={height}
                    className="w-full"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            <div className="flex justify-between text-xs text-gray-600">
                <span>Close (white)</span>
                <span>Far (black)</span>
            </div>
        </div>
    );
};

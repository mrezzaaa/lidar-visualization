import React, { useEffect, useRef, useState } from 'react';

interface DepthMapPreviewProps {
    depthData: Uint16Array | null;
    width?: number;
    height?: number;
    sentinelFilterEnabled?: boolean;
}

type ColorMode = 'grayscale' | 'hue';

/**
 * Converts HSL to RGB. 
 * h, s, l are in [0, 1].
 * Returns [r, g, b] in [0, 255].
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export const DepthMapPreview: React.FC<DepthMapPreviewProps> = ({ 
    depthData, 
    width = 320,  // 2x scale of 160
    height = 120, // 2x scale of 60
    sentinelFilterEnabled = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [colorMode, setColorMode] = useState<ColorMode>('grayscale');

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

        const MIN_DEPTH = 50;
        const MAX_DEPTH = 4079; // Error codes start at 4080; all values below are real distances

        for (let i = 0; i < depthData.length; i++) {
            const depth = depthData[i];
            
            let r = 0, g = 0, b = 0;
            
            // Valid range check
            const isValid = depth >= MIN_DEPTH && depth < 4080 && (!sentinelFilterEnabled || (depth & 0xFF) !== 0xFF);

            if (isValid) {
                const normalized = (depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH);
                
                if (colorMode === 'grayscale') {
                    // Grayscale: White=Close, Black=Far
                    const gray = Math.floor((1 - normalized) * 255);
                    r = g = b = gray;
                } else {
                    // Hue: Red (0)=Close, Blue (0.66)=Far
                    const h = (1 - normalized) * 0.7; // 0.7 = Blue-ish, 0 = Red
                    const s = 1.0;
                    const l = 0.5;
                    [r, g, b] = hslToRgb(h, s, l);
                }
            }
            // Everything else (< 50, > 2000, error/sentinel) → black
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

        // Then scale up using interpolation (smoother look)
        ctx.imageSmoothingEnabled = true;
        
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
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tempCanvas, 0, 0, GRID_WIDTH, GRID_HEIGHT, 0, 0, width, height);

    }, [depthData, width, height, colorMode]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Depth Map Preview</span>
                    <span className="text-[10px] text-gray-600 font-mono">320×120</span>
                </div>
                <div className="flex bg-gray-800 rounded p-0.5">
                    <button
                        onClick={() => setColorMode('grayscale')}
                        className={`text-[10px] px-2 py-0.5 rounded ${colorMode === 'grayscale' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        Gray
                    </button>
                    <button
                        onClick={() => setColorMode('hue')}
                        className={`text-[10px] px-2 py-0.5 rounded ${colorMode === 'hue' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        Hue
                    </button>
                </div>
            </div>
            <div className="border border-gray-700 rounded overflow-hidden bg-black">
                <canvas 
                    ref={canvasRef} 
                    width={width} 
                    height={height}
                    className="w-full"
                    style={{ imageRendering: 'auto' }}
                />
            </div>
            <div className="flex justify-between text-xs text-gray-600">
                <span>{colorMode === 'grayscale' ? 'Close (white)' : 'Close (blue)'}</span>
                <span>{colorMode === 'grayscale' ? 'Far (black)' : 'Far (red)'}</span>
            </div>
        </div>
    );
};

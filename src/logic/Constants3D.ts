/**
 * 3D Distortion Tables and Constants
 * Ported from legacy cyglidar.d1.js (or similar)
 */

export const lidarRealImageSize = [
    0, 11, 25, 40, 56, 74, 95, 122, 166, 226, 321, 574
];

export const lidarAngleCamera = [
    0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
];

export const PIXEL_REAL_SIZE = 0.02;
export const CENTER_POINT_OFFSET_X = 0.0;
export const CENTER_POINT_OFFSET_Y = 0.0;

// Precalculated Tables
export const tablex = new Float32Array(160 * 60);
export const tabley = new Float32Array(160 * 60);
export const tablez = new Float32Array(160 * 60);

export function initDistortion3D() {
    const width = 160;
    const height = 60;
    const row0 = 1 - (height / 2) + CENTER_POINT_OFFSET_X;
    const col0 = 1 - (width / 2) + CENTER_POINT_OFFSET_Y;

    function getAngle(x: number, y: number) {
        let radius = PIXEL_REAL_SIZE * Math.sqrt((x * x) + (y * y));
        let alfaGrad = 0;

        for (let i = 1; i < lidarAngleCamera.length; i++) {
            if (radius >= lidarRealImageSize[i - 1] && radius <= lidarRealImageSize[i]) {
                const in_min = lidarRealImageSize[i - 1]; 
                const in_max = lidarRealImageSize[i];
                const out_min = lidarAngleCamera[i - 1];
                const out_max = lidarAngleCamera[i];
                alfaGrad = (radius - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
                break;
            }
        }
        return alfaGrad;
    }

    for (let y = 0, r = row0; y < 60; r++, y++) {
        for (let x = 0, c = col0; x < 160; c++, x++) {
            const column = c - 0.5;
            const row    = r - 0.5;
            const angle_grad = getAngle(column, row);
            const angle_rad = angle_grad * (Math.PI / 180);

            const hyp_sq = (column * column) + (row * row);
            const hyp = Math.sqrt(hyp_sq);
            const sin_angle = Math.sin(angle_rad);
            
            const x_val = column * (sin_angle / hyp);
            const y_val = row    * (sin_angle / hyp);
            const z_val = Math.cos(angle_rad);

            const exactIdx = x + (y * 160);
            tablex[exactIdx] = x_val;
            tabley[exactIdx] = y_val;
            tablez[exactIdx] = z_val;
        }
    }
    // console.log("Distortion tables initialized");
}

// Initialize on load
initDistortion3D();

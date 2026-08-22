/**
 * CygLiDAR D1 – 3D Lens Distortion Tables
 *
 * Ported from the official reference implementation (firstnode.py / lidar.py).
 * These high-resolution tables (100 entries each) accurately model the fisheye
 * lens distortion of the D1 sensor.
 *
 * angleCamera[i] – angle in degrees for the i-th radial sample
 * realImageSize[i] – sensor image radius (in pixel-real units) for sample i
 * PIXEL_REAL_SIZE  – physical size per pixel in mm (0.02)
 *
 * The look-up tables tablex / tabley / tablez store pre-computed direction
 * cosines for every pixel (col + row × 160).  Call initDistortion3D() once
 * at startup; after that, computing a 3-D point is just:
 *
 *   x = dist * tablex[idx]
 *   y = dist * tabley[idx]
 *   z = dist * tablez[idx]
 */

export const PIXEL_REAL_SIZE = 0.02;

/** Angular look-up table: 100 entries, 0 → 64.93° */
export const angleCamera: number[] = [
     0.000000,  0.649278,  1.298556,  1.947834,  2.597113,
     3.246391,  3.895669,  4.544947,  5.194225,  5.843503,
     6.492782,  7.142060,  7.791338,  8.440616,  9.089894,
     9.739172, 10.388451, 11.037729, 11.687007, 12.336285,
    12.985563, 13.634841, 14.284120, 14.933398, 15.582676,
    16.231954, 16.881232, 17.530510, 18.179789, 18.829067,
    19.478345, 20.127623, 20.776901, 21.426179, 22.075457,
    22.724736, 23.374014, 24.023292, 24.672570, 25.321848,
    25.971126, 26.620405, 27.269683, 27.918961, 28.568239,
    29.217517, 29.866795, 30.516074, 31.165352, 31.814630,
    32.463908, 33.113186, 33.762464, 34.411743, 35.061021,
    35.710299, 36.359577, 37.008855, 37.658133, 38.307412,
    38.956690, 39.605968, 40.255246, 40.904524, 41.553802,
    42.203080, 42.852359, 43.501637, 44.150915, 44.800193,
    45.449471, 46.098749, 46.748028, 47.397306, 48.046584,
    48.695862, 49.345140, 49.994418, 50.643697, 51.292975,
    51.942253, 52.591531, 53.240809, 53.890087, 54.539366,
    55.188644, 55.837922, 56.487200, 57.136478, 57.785756,
    58.435035, 59.084313, 59.733591, 60.382869, 61.032147,
    61.681425, 62.330703, 62.979982, 63.629260, 64.278538,
];

/** Radial image-size look-up table: 100 entries (in sensor pixel units) */
export const realImageSize: number[] = [
    0.000000, 0.009109, 0.018221, 0.027340, 0.036469,
    0.045612, 0.054770, 0.063949, 0.073151, 0.082379,
    0.091637, 0.100928, 0.110256, 0.119622, 0.129032,
    0.138487, 0.147992, 0.157548, 0.167160, 0.176831,
    0.186563, 0.196359, 0.206223, 0.216158, 0.226167,
    0.236252, 0.246417, 0.256665, 0.266998, 0.277420,
    0.287933, 0.298541, 0.309246, 0.320052, 0.330961,
    0.341977, 0.353103, 0.364342, 0.375698, 0.387174,
    0.398773, 0.410500, 0.422359, 0.434354, 0.446488,
    0.458768, 0.471197, 0.483782, 0.496527, 0.509438,
    0.522522, 0.535786, 0.549236, 0.562880, 0.576726,
    0.590783, 0.605060, 0.619565, 0.634311, 0.649306,
    0.664563, 0.680093, 0.695909, 0.712025, 0.728453,
    0.745209, 0.762308, 0.779765, 0.797597, 0.815821,
    0.834455, 0.853516, 0.873023, 0.892996, 0.913455,
    0.934419, 0.955910, 0.977950, 1.000560, 1.023764,
    1.047585, 1.072049, 1.097183, 1.123014, 1.149573,
    1.176892, 1.205008, 1.233960, 1.263789, 1.294543,
    1.326272, 1.359031, 1.392875, 1.427865, 1.464057,
    1.501507, 1.540263, 1.580362, 1.621823, 1.664646,
];

// ---------------------------------------------------------------------------
// Pre-computed direction tables (indexed by pixel = col + row × 160)
// ---------------------------------------------------------------------------
export const tablex = new Float32Array(160 * 60);
export const tabley = new Float32Array(160 * 60);
export const tablez = new Float32Array(160 * 60);

/**
 * Linear interpolation between two table values.
 */
function interpolate(xin: number, x0: number, y0: number, x1: number, y1: number): number {
    if (Math.abs(x1 - x0) < Number.EPSILON) return y0;
    return ((xin - x0) * (y1 - y0) / (x1 - x0)) + y0;
}

/**
 * Look up the off-axis angle (in degrees) for a given radial image position.
 * Uses the realImageSize / angleCamera tables from the reference implementation.
 */
function getAngle(col: number, row: number): number {
    const radius = PIXEL_REAL_SIZE * Math.sqrt(col * col + row * row);
    let alfaGrad = 0;
    for (let i = 1; i < realImageSize.length; i++) {
        if (radius >= realImageSize[i - 1] && radius <= realImageSize[i]) {
            alfaGrad = interpolate(
                radius,
                realImageSize[i - 1], angleCamera[i - 1],
                realImageSize[i],     angleCamera[i]
            );
            break;
        }
    }
    // If radius exceeds the last table entry, return the maximum angle
    if (alfaGrad === 0 && radius > realImageSize[realImageSize.length - 1]) {
        alfaGrad = angleCamera[angleCamera.length - 1];
    }
    return alfaGrad;
}

/**
 * Populate tablex / tabley / tablez for all 9 600 pixels.
 *
 * Each table entry is a unit-direction-cosine component such that:
 *   x_world = dist_mm * tablex[idx]
 *   y_world = dist_mm * tabley[idx]
 *   z_world = dist_mm * tablez[idx]
 *
 * Formula (from distort3DLens in firstnode.py):
 *   c  = col_centered – 0.5
 *   r  = row_centered – 0.5
 *   rp = sqrt(c² + r²)                   (pixel distance from centre)
 *   angleRad = radians(getAngle(c, r))
 *   rua = sin(angleRad)
 *   tablex = (c * rua / rp) * 0.001      (convert mm → m)
 *   tabley = (r * rua / rp) * 0.001
 *   tablez = cos(angleRad) * 0.001
 */
export function initDistortion3D(): void {
    const WIDTH  = 160;
    const HEIGHT = 60;
    const offset_x = 0;
    const offset_y = 0;
    const r0 = 1 - (HEIGHT / 2) + offset_x; // −29
    const c0 = 1 - (WIDTH  / 2) + offset_y; // −79

    for (let row = 0; row < HEIGHT; row++) {
        for (let col = 0; col < WIDTH; col++) {
            const c = (col + c0) - 0.5;
            const r = (row + r0) - 0.5;

            const angleGrad = getAngle(c, r);
            const angleRad  = angleGrad * (Math.PI / 180);

            const rp  = Math.sqrt(c * c + r * r);
            const rua = Math.sin(angleRad);

            const idx = col + row * WIDTH;

            if (rp < 1e-9) {
                // Pixel at optical centre → pure forward direction
                tablex[idx] = 0;
                tabley[idx] = 0;
                tablez[idx] = 0.001;
            } else {
                // Scale factor: 0.001 converts mm → m
                tablex[idx] = (c * rua / rp) * 0.001;
                tabley[idx] = (r * rua / rp) * 0.001;
                tablez[idx] = Math.cos(angleRad) * 0.001;
            }
        }
    }
}

// Initialise once at module load
initDistortion3D();

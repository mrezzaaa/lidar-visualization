export interface Command{
    deviceinfo : Buffer,
    baudrate : Buffer;
    scan3D : Buffer;
    scan2D : Buffer;
    shutdown: Buffer;
    sensitivity:Buffer;
    frequency:Buffer;
    pulse:Buffer;
}


export const Command : Command = {
    deviceinfo : Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]),
    baudrate: Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA, checkSum(Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA]), 7)]),
    scan3D: Buffer.from([0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A]),
    scan2D: Buffer.from([0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03]),
    shutdown: Buffer.from([0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00]),
    sensitivity: Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00,0x11, 0xFA, 0x03]),
    frequency: Buffer.from([0x5A, 0x77, 0x03, 0x00, 0x00, 0x00]),
    pulse: Buffer.from([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x67, 0x78]),
};

export const LidarError2D = [
    16000,
    16001,
    16002,
    16003,
    16004,
];

export const LidarSpec = {
    hfov : 120,
    vfov : 65,
    epsilon : 0.75,
    width : 160,
    height: 60,
}

export const lidarAngleCamera = [
    0.000000,  0.649278,  1.298556,  1.947834,  2.597113,  3.246391, 3.895669,
    4.544947,  5.194225,  5.843503,  6.492782,  7.142060,  7.791338, 8.440616,
    9.089894,  9.739172,  10.388451, 11.037729, 11.687007, 12.336285,
    12.985563, 13.634841, 14.284120, 14.933398, 15.582676, 16.231954,
    16.881232, 17.530510, 18.179789, 18.829067, 19.478345, 20.127623,
    20.776901, 21.426179, 22.075457, 22.724736, 23.374014, 24.023292,
    24.672570, 25.321848, 25.971126, 26.620405, 27.269683, 27.918961,
    28.568239, 29.217517, 29.866795, 30.516074, 31.165352, 31.814630,
    32.463908, 33.113186, 33.762464, 34.411743, 35.061021, 35.710299,
    36.359577, 37.008855, 37.658133, 38.307412, 38.956690, 39.605968,
    40.255246, 40.904524, 41.553802, 42.203080, 42.852359, 43.501637,
    44.150915, 44.800193, 45.449471, 46.098749, 46.748028, 47.397306,
    48.046584, 48.695862, 49.345140, 49.994418, 50.643697, 51.292975,
    51.942253, 52.591531, 53.240809, 53.890087, 54.539366, 55.188644,
    55.837922, 56.487200, 57.136478, 57.785756, 58.435035, 59.084313,
    59.733591, 60.382869, 61.032147, 61.681425, 62.330703, 62.979982,
    63.629260, 64.278538, 64.927816
]
export const lidarRealImageSize = [
        0.000000, 0.009109, 0.018221, 0.027340, 0.036469, 0.045612, 0.054770, 0.063949,
        0.073151, 0.082379, 0.091637, 0.100928, 0.110256, 0.119622, 0.129032,
        0.138487, 0.147992, 0.157548, 0.167160, 0.176831, 0.186563, 0.196359,
        0.206223, 0.216158, 0.226167, 0.236252, 0.246417, 0.256665, 0.266998,
        0.277420, 0.287933, 0.298541, 0.309246, 0.320052, 0.330961, 0.341977,
        0.353103, 0.364342, 0.375698, 0.387174, 0.398773, 0.410500, 0.422359,
        0.434354, 0.446488, 0.458768, 0.471197, 0.483782, 0.496527, 0.509438,
        0.522522, 0.535786, 0.549236, 0.562880, 0.576726, 0.590783, 0.605060,
        0.619565, 0.634311, 0.649306, 0.664563, 0.680093, 0.695909, 0.712025,
        0.728453, 0.745209, 0.762308, 0.779765, 0.797597, 0.815821, 0.834455,
        0.853516, 0.873023, 0.892996, 0.913455, 0.934419, 0.955910, 0.977950,
        1.000560, 1.023764, 1.047585, 1.072049, 1.097183, 1.123014, 1.149573,
        1.176892, 1.205008, 1.233960, 1.263789, 1.294543, 1.326272, 1.359031,
        1.392875, 1.427865, 1.464057, 1.501507, 1.540263, 1.580362, 1.621823,
        1.664646, 1.708800
]
export const lidarPixelRealSize = 0.02;
export const lidartablex: number[] = Array(LidarSpec.width * LidarSpec.height).fill(0);
export const lidartabley: number[] = Array(LidarSpec.width * LidarSpec.height).fill(0);
export const lidartablez: number[] = Array(LidarSpec.width * LidarSpec.height).fill(0);

export const LidarError3D = [4080,4081,4082,4083,4084,4085,4086,4087,4088,4089];

export const LidarResponse = {
    deviceinfo : "5a77ff070010",
    scan2D : "5a77ff430101",
    scan3D : "5a77ff413808",
}




export function checkSum(buff: Buffer, size: number): number {
    let checksum = 0;
    const offset = 3;
    for (let x = offset; x < size - 1; x++) {
        checksum ^= buff[x];
    }
    return checksum;
}


export function interpolate(xin:number,x0:number,y0:number,x1:number,y1:number){
    if ((Math.abs(x1 - x0) < LidarSpec.epsilon)){
        return y0
    }
    else{
        return ((xin - x0) * (y1 - y0) / (x1 - x0)) + y0
    }
}
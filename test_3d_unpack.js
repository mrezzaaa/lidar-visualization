// Unit test: CygLiDAR D1 3D unpacking, 2D Little-Endian, and Checksum validation
// Run: node test_3d_unpack.js

// 1. Pack 2 x 12-bit pixels into 3 bytes (as defined in CygLiDAR D1 User Manual §13)
function pack12bit(A, B) {
    const byte0 = (A >> 4) & 0xFF;
    const byte1 = ((A & 0x0F) << 4) | ((B >> 8) & 0x0F);
    const byte2 = B & 0xFF;
    return [byte0, byte1, byte2];
}

// 2. Unpack 3 bytes into 2 x 12-bit pixels (as defined in CygLiDAR D1 User Manual §13)
function unpack12bit(b0, b1, b2) {
    const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
    const dist1 = ((b1 & 0x0F) << 8) | b2;
    return [dist0, dist1];
}

// 3. Decode 16-bit Little-Endian (for 2D distance and Payload Length)
function decode16bitLE(lsb, msb) {
    return lsb | (msb << 8);
}

// 4. Validate Checksum (XOR bytes from index 3 to length-2)
function validateChecksum(packet) {
    const len = packet.length;
    if (len < 5) return false;
    const receivedCS = packet[len - 1];
    let calcCS = 0;
    for (let i = 3; i < len - 1; i++) {
        calcCS ^= packet[i];
    }
    return calcCS === receivedCS;
}

// 5. 3D Range & Error Filter (50mm to 2000mm, error codes 4080..4083)
function isValid3DDepth(d) {
    const MIN_RANGE = 50;
    const MAX_RANGE = 2000;
    const ERROR_CODE_MIN = 4080;
    return d !== 0 && d >= MIN_RANGE && d <= MAX_RANGE && d < ERROR_CODE_MIN;
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log(`  PASS: ${msg}`);
    } else {
        failed++;
        console.error(`  FAIL: ${msg}`);
    }
}

console.log('=== 1. 12-bit Unpacking (Manual §13 Example: 0x5D 0xC7 0xD0) ===');
{
    const [a, b] = unpack12bit(0x5D, 0xC7, 0xD0);
    assert(a === 1500, `Pixel A = ${a} mm (expected 1500 mm / 0x5DC)`);
    assert(b === 2000, `Pixel B = ${b} mm (expected 2000 mm / 0x7D0)`);
}

console.log('\n=== 2. Round-Trip 12-Bit Packing & Unpacking ===');
{
    const testPairs = [
        [1500, 2000],
        [50, 2000],
        [350, 1200],
        [4080, 4081],
        [4082, 4083]
    ];
    for (const [inA, inB] of testPairs) {
        const [b0, b1, b2] = pack12bit(inA, inB);
        const [outA, outB] = unpack12bit(b0, b1, b2);
        assert(outA === inA && outB === inB, `Round-trip (${inA}, ${inB}) -> bytes [0x${b0.toString(16)}, 0x${b1.toString(16)}, 0x${b2.toString(16)}] -> decoded (${outA}, ${outB})`);
    }
}

console.log('\n=== 3. 16-Bit Little-Endian Decoding (2D Distance & Payload Length) ===');
{
    // Manual §10 Example: DC 05 -> 0x05DC -> 1500 mm
    const dist2D = decode16bitLE(0xDC, 0x05);
    assert(dist2D === 1500, `2D sample DC 05 -> ${dist2D} mm (expected 1500)`);

    // Payload Length: 41 38 -> 0x3841 -> 14401 bytes
    const payloadLen3D = decode16bitLE(0x41, 0x38);
    assert(payloadLen3D === 14401, `3D payload length 41 38 -> ${payloadLen3D} bytes (expected 14401)`);
}

console.log('\n=== 4. Checksum Validation ===');
{
    const cmd3D = Buffer.from('5A77FF020008000A', 'hex');
    assert(validateChecksum(cmd3D) === true, 'Run 3D command checksum (0x0A) is valid');

    const cmd2D = Buffer.from('5A77FF0200010003', 'hex');
    assert(validateChecksum(cmd2D) === true, 'Run 2D command checksum (0x03) is valid');
}

console.log('\n=== 5. 3D Range & Error Filter (50mm - 2000mm) ===');
{
    assert(isValid3DDepth(50),   '50 mm -> valid (min range)');
    assert(isValid3DDepth(1500), '1500 mm -> valid');
    assert(isValid3DDepth(2000), '2000 mm -> valid (max range)');

    assert(!isValid3DDepth(0),    '0 mm -> invalid');
    assert(!isValid3DDepth(49),   '49 mm -> invalid (< 50 mm)');
    assert(!isValid3DDepth(2001), '2001 mm -> invalid (> 2000 mm)');
    assert(!isValid3DDepth(4080), '4080 -> invalid (LIMIT_FOR_VALID_DATA)');
    assert(!isValid3DDepth(4081), '4081 -> invalid (LOW_AMPLITUDE)');
    assert(!isValid3DDepth(4082), '4082 -> invalid (ADC_OVERFLOW)');
    assert(!isValid3DDepth(4083), '4083 -> invalid (SATURATION)');
}

console.log(`\n========================================`);
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);

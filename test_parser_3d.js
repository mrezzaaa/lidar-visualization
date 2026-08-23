// Unit tests: CygLiDAR D1 Parser — 3D unpacking, checksum, filters
// Run: node test_parser_3d.js

// ---- 12-bit pack/unpack (matches manual §13) ----

function pack12bit(a, b) {
    const byte0 = (a >> 4) & 0xFF;
    const byte1 = ((a & 0x0F) << 4) | ((b >> 8) & 0x0F);
    const byte2 = b & 0xFF;
    return [byte0, byte1, byte2];
}

function unpack12bit(b0, b1, b2) {
    const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
    const dist1 = ((b1 & 0x0F) << 8) | b2;
    return [dist0, dist1];
}

// ---- Checksum ----

function checksumXOR(packet, start, end) {
    let cs = 0;
    for (let i = start; i < end; i++) cs ^= packet[i];
    return cs;
}

function checksumSUM(packet, start, end) {
    let cs = 0;
    for (let i = start; i < end; i++) cs = (cs + packet[i]) & 0xFF;
    return cs;
}

function buildPacket(payloadHeader, payloadBytes) {
    const payloadLen = payloadBytes.length + 1; // includes payload header byte
    // Total: 3 sync + 2 length + 1 header + payloadBytes + 1 checksum
    const buf = Buffer.alloc(3 + 2 + 1 + payloadBytes.length + 1);
    buf[0] = 0x5A;
    buf[1] = 0x77;
    buf[2] = 0xFF;
    buf[3] = payloadLen & 0xFF;         // LSB
    buf[4] = (payloadLen >> 8) & 0xFF;  // MSB
    buf[5] = payloadHeader;
    payloadBytes.copy(buf, 6);
    // checksum = XOR buffer[3..len-2]
    let cs = 0;
    for (let i = 3; i < buf.length - 1; i++) cs ^= buf[i];
    buf[buf.length - 1] = cs;
    return buf;
}

// ---- Filters ----

function isValidDepth(d) {
    return d >= 50 && d < 3850 && d < 4080 && (d & 0x000F) !== 0x000F;
}

// ---- Tests ----

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

console.log('=== 12-bit pack/unpack round-trip ===');
{
    const pairs = [
        [1500, 2000],
        [50, 4095],
        [0, 3850],
        [4080, 4081],
        [511, 3871],
        [2303, 2191],
    ];
    for (const [a, b] of pairs) {
        const packed = pack12bit(a, b);
        const [da, db] = unpack12bit(packed[0], packed[1], packed[2]);
        assert(da === a && db === b, `round-trip ${a}, ${b} → ${packed.map(x=>'0x'+x.toString(16).padStart(2,'0')).join(' ')} → ${da}, ${db}`);
    }
}

console.log('\n=== Manual §13 example: 0x5D 0xC7 0xD0 ===');
{
    const [a, b] = unpack12bit(0x5D, 0xC7, 0xD0);
    assert(a === 1500, `pixel A = ${a} (expected 1500)`);
    assert(b === 2000, `pixel B = ${b} (expected 2000)`);
}

console.log('\n=== Checksum: Run 3D command (5A 77 FF 02 00 08 00 0A) ===');
{
    const pkt = Buffer.from('5A77FF020008000A', 'hex');
    assert(pkt.length === 8, 'packet length = 8 bytes');
    assert(checksumXOR(pkt, 3, pkt.length - 1) === pkt[pkt.length - 1], 'XOR checksum matches');
}

console.log('\n=== Checksum: built 3D payload packet ===');
{
    const payload = Buffer.alloc(14400, 0x00);
    payload[0] = 0x08; // payload header
    const pkt = buildPacket(0x08, payload);
    assert(pkt.length === 14407, `packet length = ${pkt.length} (expected 14407)`);
    assert(pkt[3] === 0x41 && pkt[4] === 0x38, 'payload length = 0x3841 (14401)');
    assert(pkt[5] === 0x08, 'payload header = 0x08');
    assert(checksumXOR(pkt, 3, pkt.length - 1) === pkt[pkt.length - 1], 'XOR checksum matches');
}

console.log('\n=== Checksum algorithm diagnostics (custom packet) ===');
{
    // Build a small packet where XOR and SUM give different results
    const buf = Buffer.alloc(7);
    buf[0] = 0x5A; buf[1] = 0x77; buf[2] = 0xFF;
    buf[3] = 0x03; // payload len LSB = 3
    buf[4] = 0x00; // payload len MSB = 0
    buf[5] = 0x08; // payload header
    buf[6] = 0x00; // checksum (to be computed)
    // Use payload bytes that make XOR != SUM: 0xFF, 0x01, 0x01
    // XOR: 0x03 ^ 0x00 ^ 0x08 ^ 0xFF ^ 0x01 ^ 0x01 = 0xFA
    // SUM: (0x03 + 0x00 + 0x08 + 0xFF + 0x01 + 0x01) & 0xFF = 0x03
    // But we only checksum from index 3 to len-2 (index 5 for a 7-byte packet)
    // XOR[3..5]: 0x03 ^ 0x00 ^ 0x08 = 0x0B
    // SUM[3..5]: (0x03 + 0x00 + 0x08) & 0xFF = 0x0B
    // Still the same! Let me use a longer packet.
    // For a 10-byte packet with bytes 3..8 in checksum:
    // XOR[3..8] vs SUM[3..8] will differ with enough variety.
    const buf2 = Buffer.alloc(10);
    buf2[0] = 0x5A; buf2[1] = 0x77; buf2[2] = 0xFF;
    buf2[3] = 0x06; // payload len = 6 + 1 = 7? No, let's keep it simple.
    // Actually, let's just verify the property with known values:
    const testBytes = Buffer.from([0x03, 0x00, 0x08, 0xFF, 0x01, 0x01]);
    const xorVal = checksumXOR(testBytes, 0, testBytes.length);
    const sumVal = checksumSUM(testBytes, 0, testBytes.length);
    assert(xorVal !== sumVal, `XOR=0x${xorVal.toString(16)} differs from SUM=0x${sumVal.toString(16)} (confirms XOR algorithm)`);

    // Now test the actual packet boundaries
    const pkt = Buffer.from('5A77FF020008000A', 'hex');
    const received = pkt[pkt.length - 1];
    const xorFull = checksumXOR(pkt, 0, pkt.length - 1);
    const sumFull = checksumSUM(pkt, 0, pkt.length - 1);
    const xor3 = checksumXOR(pkt, 3, pkt.length - 1);
    const sum3 = checksumSUM(pkt, 3, pkt.length - 1);

    assert(xor3 === received, 'XOR[3..len-2] matches received');
    assert(xorFull !== received, 'XOR[0..len-2] does NOT match (sync header excluded)');
}

console.log('\n=== Error / sentinel filter ===');
{
    const errors = [4080, 4081, 4082, 4083];
    const sentinels = [3871, 511, 2303, 2191];
    const valid = [1500, 2000, 50, 3849];

    for (const d of errors) assert(!isValidDepth(d), `${d} = error code → invalid`);
    for (const d of sentinels) assert(!isValidDepth(d), `${d} (0x${d.toString(16).padStart(3,'0').toUpperCase()}) = sentinel → invalid`);
    for (const d of valid) assert(isValidDepth(d), `${d} = valid`);

    assert(!isValidDepth(0), '0 = invalid');
    assert(!isValidDepth(49), '49 = invalid (< 50)');
    assert(!isValidDepth(3850), '3850 = invalid (>= 3850)');
    assert(!isValidDepth(3851), '3851 = invalid (> 3850)');
    assert(!isValidDepth(4079), '4079 = invalid (error/sentinel range)');
    assert(!isValidDepth(4095), '4095 = invalid (max 12-bit)');
}

console.log('\n=== Sentinel nibble pattern ===');
{
    for (let low = 0x0; low <= 0xF; low++) {
        const val = 0x100 | low; // 256 + low
        const shouldInvalid = low === 0xF;
        const actual = isValidDepth(val);
        assert(actual === !shouldInvalid,
            `0x${val.toString(16).padStart(3,'0').toUpperCase()} low-nibble=${low.toString(16)} → ${actual ? 'valid' : 'invalid'} (expected ${!shouldInvalid ? 'valid' : 'invalid'})`);
    }
}

console.log('\n=== Row-major index mapping ===');
{
    const W = 160, H = 60;
    for (const [row, col, expected] of [[0,0,0],[0,159,159],[1,0,160],[59,159,9599]]) {
        const idx = col + row * W;
        assert(idx === expected, `row=${row} col=${col} → idx=${idx} (expected ${expected})`);
    }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

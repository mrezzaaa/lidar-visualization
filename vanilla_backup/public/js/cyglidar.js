// --- 3D MATH TABLES ---
const tablex = new Float32Array(160 * 60);
const tabley = new Float32Array(160 * 60);
const tablez = new Float32Array(160 * 60);

// Initial Distortion Calculation (Ported from lidar.ts)
function initDistortion3D() {
    console.log("Initializing 3D Distortion Tables...");
    const width = 160;
    const height = 60;
    const _sensor_point_size_mm = 0.02; // PIXEL_REAL_SIZE
    const _center_point_offset_x = 0.0;
    const _center_point_offset_y = 0.0;
    const row0 = 1 - (height / 2) + _center_point_offset_x;
    const col0 = 1 - (width / 2) + _center_point_offset_y;

    function getAngle(x, y) {
        let radius = _sensor_point_size_mm * Math.sqrt((x * x) + (y * y));
        let alfaGrad = 0;
        // lidarAngleCamera and lidarRealImageSize should be loaded from 3d_constants.js
        if (typeof lidarAngleCamera === 'undefined' || typeof lidarRealImageSize === 'undefined') {
            console.error("3d_constants.js not loaded!");
            return 0;
        }

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
}

// Call init immediately
initDistortion3D();

// --- WEBSERIAL LOGIC ---
let port, reader, writer, keepReading = false;
let serialBuffer = new Uint8Array(0);
let frames = 0;

setInterval(() => { 
    const counter = document.getElementById('fpsCounter');
    if(counter) {
        if (frames > 0) {
            counter.innerText = `FPS: ${frames}`;
            counter.style.color = 'lime';
        } else {
            counter.innerText = `FPS: 0 (No Data)`;
            counter.style.color = 'red';
        }
    }
    frames = 0; 
}, 1000);

// COMMANDS
const CMD = {
    scan2D: new Uint8Array([0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03]),
    scan3D: new Uint8Array([0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A]),
    scanDual: new Uint8Array([0x5a, 0x77, 0xff, 0x02, 0x00, 0x07, 0x00, 0x05]),
    stop:   new Uint8Array([0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00]),
    info:   new Uint8Array([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]),
    freq:   new Uint8Array([0x5A, 0x77, 0x03, 0x00, 0x00, 0x00]), 
    pulse:  new Uint8Array([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x67, 0x78])
};

async function connectSerial() {
    if (!navigator.serial) return alert("WebSerial not supported");
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: parseInt(document.getElementById('baudRate').value) });
        keepReading = true;
        updateUI(true);
        readLoop();
    } catch (err) { console.error(err); alert("Connection Failed: " + err.message); }
}

async function disconnectSerial() {
    keepReading = false;
    if (reader) await reader.cancel();
    if (port) await port.close();
    updateUI(false);
}

async function sendCommand(data) {
    if (!port || !port.writable) return;
    const writer = port.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
    console.log("Sent:", data);
}

// UI Actions
async function startScan() {
    const mode = document.getElementById('scanMode').value;
    if (mode === '2D') await sendCommand(CMD.scan2D);
    else if (mode === '3D') await sendCommand(CMD.scan3D);
    else await sendCommand(CMD.scanDual);
}
async function stopScan() { await sendCommand(CMD.stop); }
async function getDeviceInfo() { await sendCommand(CMD.info); }
async function setFrequency() { await sendCommand(CMD.freq); } 
async function setPulse() { await sendCommand(CMD.pulse); }   

async function readLoop() {
    reader = port.readable.getReader();
    while (keepReading) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                const newBuffer = new Uint8Array(serialBuffer.length + value.length);
                newBuffer.set(serialBuffer);
                newBuffer.set(value, serialBuffer.length);
                serialBuffer = newBuffer;
                try {
                    processBuffer();
                } catch (e) {
                    console.error("Parse error:", e);
                    // Optional: Reset buffer if stuck?
                    // serialBuffer = new Uint8Array(0); 
                }
            }
        } catch (error) { console.error(error); break; }
    }
}

// --- PARSER ---
function processBuffer() {
    if (serialBuffer.length > 500000) {
        serialBuffer = serialBuffer.slice(serialBuffer.length - 100000);
    }

    // HEADER_3D: 5A 77 FF 41 38 08 (Defined by user req)
    // Actually [3] and [4] are length, [5] is type.
    
    while (serialBuffer.length >= 6) { 
        // 1. Check for 3D Header specifically first (Strategy: Header-to-Header)
        // Pattern: 5A 77 FF 41 38 08
        let header3DIdx = -1;
        // Optimization: Only search if we haven't identified a packet yet
        for(let i=0; i < serialBuffer.length - 5; i++) {
             if (serialBuffer[i] === 0x5A && serialBuffer[i+1] === 0x77 && serialBuffer[i+2] === 0xFF && 
                 serialBuffer[i+3] === 0x41 && serialBuffer[i+4] === 0x38 && serialBuffer[i+5] === 0x08) {
                 header3DIdx = i;
                 break;
             }
        }

        if (header3DIdx !== -1) {
            // Found a 3D header!
            if (header3DIdx > 0) {
                // discard noise before 3D header
                serialBuffer = serialBuffer.slice(header3DIdx);
                continue;
            }

            // Now we are at [0] == 5A ... 08
            // Search for NEXT 3D header to define end of this packet
            let nextHeaderIdx = -1;
            for(let i=6; i < serialBuffer.length - 5; i++) {
                 if (serialBuffer[i] === 0x5A && serialBuffer[i+1] === 0x77 && serialBuffer[i+2] === 0xFF && 
                     serialBuffer[i+3] === 0x41 && serialBuffer[i+4] === 0x38 && serialBuffer[i+5] === 0x08) {
                     nextHeaderIdx = i;
                     break;
                 }
            }

            if (nextHeaderIdx === -1) {
                // Next header not found yet. Wait for more data.
                // UNLESS buffer is absurdly large (safety break)
                if (serialBuffer.length > 40000) { // > 2 frames worth
                     // Something is wrong, maybe missed a header. 
                     // Let's try to process what we have based on length?
                     // Or just wait. Let's wait.
                     // But if it grows too big, we might OOM.
                     // Slice if > 100k
                }
                return;
            }

            // We have a start (0) and an end (nextHeaderIdx).
            // The packet is serialBuffer.slice(0, nextHeaderIdx) ?? 
            // Wait, does the next header start immediately? 
            // Usually yes.
            // Checksum is the byte BEFORE nextHeaderIdx?
            // "kita ambil checksum sebelum second header response 3d"
            
            const packet = serialBuffer.slice(0, nextHeaderIdx);
            
            // Validate Checksum
            // Packet structure: Header(6) + Payload + Checksum(1)
            // So packet length = nextHeaderIdx.
            // Checksum is at packet[packet.length-1].
            
            const receivedCS = packet[packet.length-1];
            // Calculate CS: XOR from offset 3 to length-2
            let calcCS = 0;
            for(let i=3; i < packet.length - 1; i++) {
                calcCS ^= packet[i];
            }
            
            if (calcCS === receivedCS) {
                parse3D(packet, packet.length - 6 - 1); // logic will handle parsing
                frames++;
            } else {
                console.warn("3D Checksum Fail", calcCS, receivedCS);
            }
            
            // Consume this packet
            serialBuffer = serialBuffer.slice(nextHeaderIdx);
            continue;
        }

        // 2. If NO 3D header found, fall back to Standard Generic Parsing (for 2D/Info)
        // Search for Generic Header 5A 77 FF
        let headIdx = -1;
        for(let i=0; i < serialBuffer.length - 5; i++) {
                if (serialBuffer[i] === 0x5A && serialBuffer[i+1] === 0x77 && serialBuffer[i+2] === 0xFF) {
                    headIdx = i;
                    break;
                }
        }

        if (headIdx === -1) {
             if (serialBuffer.length > 2000) { 
                 serialBuffer = serialBuffer.slice(serialBuffer.length - 1000);
             }
             return;
        }

        if (headIdx > 0) {
            serialBuffer = serialBuffer.slice(headIdx);
            continue;
        }

        // Standard Length-Based Parsing for Non-3D (or if 3D Header check skipped/failed)
        const lenLSB = serialBuffer[3];
        const lenMSB = serialBuffer[4];
        const payloadLen = (lenMSB << 8) | lenLSB; 
        const packetLen = 6 + payloadLen; 

        if (serialBuffer.length < packetLen) return; 

        const type = serialBuffer[5];
        const packet = serialBuffer.slice(0, packetLen);
        
        if (type === 0x01) { // 2D (Standard or Dual)
            parse2D(packet, payloadLen);
            frames++;
        } else if (type === 0x08) { 
            // Should have been caught by 3D logic above, but if not (e.g. single frame at end of stream?)
            // parse3D(packet, payloadLen); 
            // frames++;
        } else if (type === 0x10) { // Info
            parseInfo(packet);
        }

        serialBuffer = serialBuffer.slice(packetLen);
    }
}

function parseInfo(pkt) {
    const ver = `${pkt[6].toString(16)}.${pkt[7].toString(16)}.${pkt[8].toString(16)}`;
    const hw = `${pkt[9].toString(16)}.${pkt[10].toString(16)}.${pkt[11].toString(16)}`;
    const infoVer = document.getElementById('infoVer');
    const infoHW = document.getElementById('infoHW');
    const infoSerial = document.getElementById('infoSerial');
    
    if(infoVer) infoVer.innerText = ver;
    if(infoHW) infoHW.innerText = hw;
    if(infoSerial) infoSerial.innerText = "Detected";
}

// 2D Parsing Logic (Moved from index.html)
function parse2D(pkt, payloadLen) {
    if (typeof pointsGeometry === 'undefined') {
        console.warn("Visualization not initialized yet, skipping 2D parse");
        return;
    }
    // We access global cloud, cloud3D objects from index.html
    if (typeof cloud !== 'undefined') cloud.visible = true;
    if (typeof cloud3D !== 'undefined') cloud3D.visible = false;
    
    const dataLen = payloadLen - 1;
    const numPoints = Math.floor(dataLen / 2); 
    const statPoints = document.getElementById('statPoints');
    if(statPoints) statPoints.innerText = numPoints;

    const MAX_POINTS = 1000;
    const tempPositions = new Float32Array(MAX_POINTS * 3);
    const tempColors = new Float32Array(MAX_POINTS * 3);
    
    let validCount = 0;
    let pIndex = 0;

    for(let i=0; i<numPoints; i++) {
        if (pIndex >= MAX_POINTS*3) break;

        const off = 6 + (i*2);
        const dist = (pkt[off] << 8) | pkt[off+1]; // Big Endian
        
        const step = 120.0 / (numPoints - 1 || 1); 
        const angleDeg = -60 + (i * step);
        const angleRad = angleDeg * (Math.PI/180);

        if (dist > 0 && dist < 10000 && dist < 16000) {
            const dm = dist/1000.0;
            tempPositions[pIndex] = -Math.sin(angleRad) * dm; 
            tempPositions[pIndex+1] = 0;
            tempPositions[pIndex+2] = Math.cos(angleRad) * dm;

            const hue = (1.0 - Math.min(dm/3, 1)) * 0.3;
            // Need THREE.Color, assume global THREE
            const col = new THREE.Color().setHSL(hue, 1, 0.5);
            tempColors[pIndex] = col.r;
            tempColors[pIndex+1] = col.g;
            tempColors[pIndex+2] = col.b;

            pIndex += 3;
            validCount++;
        }
    }

    if (typeof pointsGeometry !== 'undefined') {
        const positions = pointsGeometry.attributes.position.array;
        const colors = pointsGeometry.attributes.color.array;
        
        let lineIndex = 0;
        let cleanPoints = []; 

        for(let i=0; i<validCount-1; i++) {
            const x1 = tempPositions[i*3];
            const y1 = tempPositions[i*3+1];
            const z1 = tempPositions[i*3+2];
            
            const x2 = tempPositions[(i+1)*3];
            const y2 = tempPositions[(i+1)*3+1];
            const z2 = tempPositions[(i+1)*3+2];

            const dx = x2 - x1;
            const dz = z2 - z1;
            const segLenSq = dx*dx + dz*dz;
            
            if (segLenSq < 0.09) { 
                positions[lineIndex*3] = x1;
                positions[lineIndex*3+1] = y1;
                positions[lineIndex*3+2] = z1;
                
                positions[(lineIndex+1)*3] = x2;
                positions[(lineIndex+1)*3+1] = y2;
                positions[(lineIndex+1)*3+2] = z2;

                colors[lineIndex*3] = tempColors[i*3];
                colors[lineIndex*3+1] = tempColors[i*3+1];
                colors[lineIndex*3+2] = tempColors[i*3+2];

                colors[(lineIndex+1)*3] = tempColors[(i+1)*3];
                colors[(lineIndex+1)*3+1] = tempColors[(i+1)*3+1];
                colors[(lineIndex+1)*3+2] = tempColors[(i+1)*3+2];

                lineIndex += 2;
                cleanPoints.push({x: x1, y: z1}); 
            }
        }

        pointsGeometry.attributes.position.needsUpdate = true;
        pointsGeometry.attributes.color.needsUpdate = true;
        pointsGeometry.setDrawRange(0, lineIndex); 
        pointsGeometry.computeBoundingSphere();
        
        const statValid = document.getElementById('statValid');
        if(statValid) statValid.innerText = validCount;
        
        // SLAM (if isMapping global is set)
        if (typeof isMapping !== 'undefined' && isMapping && cleanPoints.length > 10) {
            handleSlam(cleanPoints);
        }
    }
}

// Separate function to keep parse2D clean-ish
function handleSlam(cleanPoints) {
    if (typeof robotPose === 'undefined' || typeof mapGeo === 'undefined' || typeof mapIndex === 'undefined') return;
    
    // Using globals: robotPose, mapGeo, mapIndex, MAP_SIZE
    const cos = Math.cos(robotPose.theta);
    const sin = Math.sin(robotPose.theta);
    const gPos = mapGeo.attributes.position.array;
    
    if (frames % 5 === 0) {
        const scanPoints = [];
        for(let i=0; i<cleanPoints.length; i++) {
            const lx = cleanPoints[i].x;
            const lz = cleanPoints[i].y;
            const gx = lx * cos - lz * sin + robotPose.x;
            const gz = lx * sin + lz * cos + robotPose.y;
            scanPoints.push({x: gx, y: 0, z: gz});
        }
        
        if (typeof VoxelGridFilter !== 'undefined') {
            const voxelFilter = new VoxelGridFilter(0.05);
            const filtered = voxelFilter.filter(scanPoints);
            
            for(let i=0; i<filtered.length; i++) {
                if (mapIndex >= 20000) break; // MAP_SIZE hardcoded safe
                
                gPos[mapIndex*3] = filtered[i].x;
                gPos[mapIndex*3+1] = 0;
                gPos[mapIndex*3+2] = filtered[i].z;
                mapIndex++;
            }
            
            mapGeo.attributes.position.needsUpdate = true;
            mapGeo.setDrawRange(0, mapIndex);
            mapGeo.computeBoundingSphere();
        }
    }
}

// ------------------------------------------------------------------
// REQUESTED PARSE3D STUB
// ------------------------------------------------------------------
/**
 * Handles 3D scan data (Header: 5A 77 FF 41 38 08)
 * @param {Uint8Array} pkt - The complete packet buffer (Header + Payload + Checksum)
 * @param {number} payloadLen - The length of the payload
 */
function parse3D(pkt, payloadLen) {
    // 1. Packet is already validated by processBuffer (Header + Checksum)
    // Header is 5A 77 FF 41 38 08.
    
    // We can directly proceed to parsing logic.
    // The packet includes Header (6) + Data + Checksum (1).
    // payloadLen was passed but might be irrelevant if we slice manually. 
    // Actually in the new processBuffer call: parse3D(packet, ...);
    
    // Header (6 bytes)
    // Checksum (1 byte at end)
    
    // Data range: 6 to length-1
    const dataStart = 6;
    const dataEnd = pkt.length - 1;
    const dataLen = dataEnd - dataStart;
    
    if (dataLen !== 19200) { // 9600 * 2 ?? No?
        // Wait, 160*60 = 9600 pixels.
        // If 12 bits per pixel packed?
        // 9600 * 1.5 = 14400 bytes.
        // User header has length 0x3841 (14401).
        // 14401 - 1 (Type 08) = 14400 bytes.
        // So payload is indeed 14400 bytes (Data) + 1 (CS?).
        // No, length includes checksum? 
        // Let's assume raw data is 14400 bytes.
        // dataLen should be 14400.
        // console.log("3D Data Len:", dataLen);
    }

    // --- EXAMPLE 1: Data Parsing using Hex String (Easier to read) ---
    /*
    const dataStart = 6;
    const dataEnd = pkt.length - 1; // Exclude Checksum
    let hexData = '';
    
    // Slow but readable method
    for (let i = dataStart; i < dataEnd; i++) {
        hexData += pkt[i].toString(16).padStart(2, '0');
    }
    
    // Expected: 28800 hex chars (14400 bytes * 2 chars)
    // Each distance is 12 bits -> 3 hex chars.
    // Pixel 0 = hexData.substr(0, 3) -> parseHex
    // Pixel 1 = hexData.substr(3, 3)
    */

    // --- EXAMPLE 2: Bit Shifting (High Performance) ---
    /*
    // Each 3 bytes = 2 pixels (12 bits each)
    // Byte 0: [P0_11...P0_4] (Top 8 bits of Pixel 0)
    // Byte 1: [P0_3...P0_0 | P1_11...P1_8] (Low 4 bits of P0, High 4 of P1)
    // Byte 2: [P1_7...P1_0] (Low 8 bits of Pixel 1)
    
    let dataIndex = 6;
    for (let i = 0; i < 9600; i += 2) {
        const b0 = pkt[dataIndex];
        const b1 = pkt[dataIndex+1];
        const b2 = pkt[dataIndex+2];
        
        const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
        const dist1 = ((b1 & 0x0F) << 8) | b2;
        
        // Use dist0, dist1...
        dataIndex += 3;
    }
    */
}

function updateUI(connected) {
    const btnConnect = document.getElementById('btnConnect');
    const btnDisconnect = document.getElementById('btnDisconnect');
    const badge = document.getElementById('statusBadge');
    
    if(btnConnect) btnConnect.classList.toggle('hidden', connected);
    if(btnDisconnect) btnDisconnect.classList.toggle('hidden', !connected);
    if(badge) {
        badge.innerText = connected ? "Connected" : "Disconnected";
        badge.className = `status-badge ${connected ? 'status-connected' : 'status-disconnected'}`;
    }
}

// --- RESTORED VISUALIZATION LOGIC ---

let useMeshMode = false;
const rawDistances = new Uint16Array(9600);
let latestScanData = null;

// Depth Map Context
let depthCtx = null;
let depthImageData = null;

function getDepthContext() {
    if (!depthCtx) {
        const c = document.getElementById('depthCanvas');
        if (c) {
            depthCtx = c.getContext('2d');
            depthImageData = depthCtx.createImageData(160, 60);
        }
    }
    return depthCtx;
}

function toggleMeshMode() {
    useMeshMode = !useMeshMode;
    if (typeof cloud3D !== 'undefined') cloud3D.visible = !useMeshMode;
    if (typeof mesh3D !== 'undefined') mesh3D.visible = useMeshMode;
    
    const btn = document.getElementById('btnMeshToggle');
    if (btn) btn.textContent = useMeshMode ? 'Switch to Points' : 'Switch to Mesh';
}

function renderDepthMap() {
    const ctx = getDepthContext();
    if (!ctx) return;

    const width = 160;
    
    for (let idx = 0; idx < 9600; idx++) {
        const row = Math.floor(idx / width);
        const col = idx % width;
        
        const distance = rawDistances[idx];
        
        let r, g, b;
        
        if (distance >= 4080) {
            r = g = b = 0;
        } else {
            const normalized = Math.min(distance / 3000.0, 1.0);
            const hue = (1.0 - normalized) * 240; 
            
            const c = 1.0;
            const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
            
            if (hue < 60) { r = c; g = x; b = 0; }
            else if (hue < 120) { r = x; g = c; b = 0; }
            else if (hue < 180) { r = 0; g = c; b = x; }
            else if (hue < 240) { r = 0; g = x; b = c; }
            else { r = x; g = 0; b = c; }
        }
        
        const pixelIdx = (row * width + col) * 4;
        depthImageData.data[pixelIdx + 0] = r * 255;
        depthImageData.data[pixelIdx + 1] = g * 255;
        depthImageData.data[pixelIdx + 2] = b * 255;
        depthImageData.data[pixelIdx + 3] = 255;
    }
    
    ctx.putImageData(depthImageData, 0, 0);
}

function setPoint3D(idx, rawDist, pos, col) {
    if (idx >= 9600) return;
    
    rawDistances[idx] = rawDist;
    const isError = rawDist >= 4080;
    
    const pos_x = rawDist * tablex[idx];
    const pos_y = rawDist * tabley[idx];
    const pos_z = rawDist * tablez[idx];
    
    const MM2M = 0.001;
    
    pos[idx*3]     = (isError ? 0 :  pos_x * MM2M);
    pos[idx*3+1]   = (isError ? 0 : -pos_y * MM2M);
    pos[idx*3+2]   = (isError ? 0 : -pos_z * MM2M);

    let hue, saturation, lightness;
    
    if (isError) {
        hue = 0; saturation = 0; lightness = 0.1;
    } else {
        const normalized = Math.min(rawDist/3000, 1);
        
        if (normalized < 0.3) {
            hue = 0.5; saturation = 1.0; lightness = 0.6;
        } else if (normalized < 0.6) {
            hue = 0.5 - (normalized - 0.3) * 0.6;
            saturation = 1.0; lightness = 0.5;
        } else {
            hue = 0.15 - (normalized - 0.6) * 0.3;
            saturation = 1.0; lightness = 0.4;
        }
    }
    
    // Assume THREE is global
    if (typeof THREE !== 'undefined') {
        const c = new THREE.Color().setHSL(hue, saturation, lightness);
        col[idx*3] = c.r; col[idx*3+1] = c.g; col[idx*3+2] = c.b;
    }
}

function exportScanToCSV() {
    if (!latestScanData && !rawDistances) {
        alert('No scan data available.');
        return;
    }
    const dataSource = latestScanData || rawDistances;
    
    let csv = 'Row';
    for (let c = 0; c < 160; c++) {
        csv += `,C${c}`;
    }
    csv += '\n';
    
    for (let r = 0; r < 60; r++) {
        csv += `R${r}`;
        for (let c = 0; c < 160; c++) {
            const idx = c + (r * 160);
            const dist = dataSource[idx];
            csv += `,${dist >= 4080 ? 0 : dist}`;
        }
        csv += '\n';
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lidar_scan_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Attach listeners that might have been lost if index.html script ran before this file defined them?
// Actually index.html buttons use onclick="functionName()". So as long as these are global, it works.
// We just need to make sure the export button listener is attached if it wasn't inline.
// In index.html original: exportBtn.addEventListener('click', exportScanToCSV);
// We should re-attach it here just in case.
window.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportScanBtn');
    if (exportBtn) {
       // Remove old listeners? No, just add.
       exportBtn.addEventListener('click', exportScanToCSV);
    }
});

// ==========================================
// VISUALIZATION & INTERACTION LOGIC
// (Moved from index.html)
// ==========================================

// GLOBAL VARIABLES FOR THREE.JS
// These are used by parse2D and other functions in this file
let scene, camera, renderer, controls;
let cloud, cloud3D, mesh3D, globalMap, robotGroup;
let pointsGeometry, mapGeo, geo3D, meshGeo3D;
let markerGeo, markerMat, hoverMarker;
let mouse, raycaster, tooltip;
let isMapping = false;
let mapIndex = 0;
let robotPose = { x: 0, y: 0, theta: 0 };

// Initialize Visualization
function initVisualization() {
    console.log("initVisualization() STARTED");
    const container = document.getElementById('canvas-container');
    if (!container) {
        console.error("Canvas container not found!");
        return;
    }

    // --- SCENE SETUP ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); // Dark gray, not pure black

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 10;
    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        100
    );
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Initial Resize to ensure fit
    const initWidth = container.clientWidth;
    const initHeight = container.clientHeight;
    renderer.setSize(initWidth, initHeight);
    camera.aspect = initWidth / initHeight; // Update aspect for Ortho? 
    // Wait, OrthographicCamera uses left/right/top/bottom, not aspect directly?
    // Actually the init code uses aspect to calculate frustum.
    // Let's re-run the camera setup logic or specific update here if needed.
    // The event listener handles resize, let's manually trigger it or just set it right here.
    // The existing code calculated aspect/frustum above.
    
    console.log(`Renderer initialized: ${initWidth}x${initHeight}`);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Helpers
    scene.add(new THREE.GridHelper(10, 20, 0x444444, 0x222222));
    scene.add(new THREE.AxesHelper(1));

    // --- INTERACTION ---
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    raycaster.params.Line.threshold = 0.2;
    raycaster.params.Points.threshold = 0.2;

    markerGeo = new THREE.SphereGeometry(0.1, 16, 16);
    markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    hoverMarker = new THREE.Mesh(markerGeo, markerMat);
    hoverMarker.visible = false;
    scene.add(hoverMarker);
    
    tooltip = document.getElementById('tooltip');

    window.addEventListener('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (tooltip) {
            tooltip.style.left = event.clientX + 15 + 'px';
            tooltip.style.top = event.clientY + 15 + 'px';
        }
    });

    window.addEventListener('resize', () => {
        if (!container) return;
        const aspect = container.clientWidth / container.clientHeight;
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // --- OBJECTS ---
    
    // 1. Live 2D Cloud
    const MAX_POINTS = 1000;
    pointsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3 * 2);
    const colors = new Float32Array(MAX_POINTS * 3 * 2);
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(-positions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cloud = new THREE.LineSegments(pointsGeometry, new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 }));
    scene.add(cloud);

    // 2. Global Map
    const MAP_SIZE = 20000;
    mapGeo = new THREE.BufferGeometry();
    const mapPos = new Float32Array(MAP_SIZE * 3);
    mapGeo.setAttribute('position', new THREE.BufferAttribute(mapPos, 3));
    const mapMat = new THREE.PointsMaterial({ size: 0.05, color: 0x888888 });
    globalMap = new THREE.Points(mapGeo, mapMat);
    globalMap.frustumCulled = false;
    scene.add(globalMap);

    // 3. 3D Cloud
    const POINTS_3D = 9600;
    geo3D = new THREE.BufferGeometry();
    const pos3D = new Float32Array(POINTS_3D * 3);
    const col3D = new Float32Array(POINTS_3D * 3);
    geo3D.setAttribute('position', new THREE.BufferAttribute(pos3D, 3));
    geo3D.setAttribute('color', new THREE.BufferAttribute(col3D, 3));
    const mat3D = new THREE.PointsMaterial({ 
        size: 0.05, 
        vertexColors: true,
        sizeAttenuation: true,
        opacity: 1.0
    });
    cloud3D = new THREE.Points(geo3D, mat3D);
    cloud3D.frustumCulled = false;
    scene.add(cloud3D);

    // 4. 3D Mesh
    meshGeo3D = new THREE.BufferGeometry();
    meshGeo3D.setAttribute('position', new THREE.BufferAttribute(pos3D, 3));
    meshGeo3D.setAttribute('color', new THREE.BufferAttribute(col3D, 3));
    const matMesh3D = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: false,
        shininess: 30
    });
    mesh3D = new THREE.Mesh(meshGeo3D, matMesh3D);
    mesh3D.frustumCulled = false;
    mesh3D.visible = false;
    scene.add(mesh3D);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Robot Pose
    robotGroup = new THREE.Group();
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,0), 0.5, 0x00ff00);
    robotGroup.add(arrow);
    scene.add(robotGroup);

    // Start Animation Loop
    animate();
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;
    
    controls.update();

    // Raycasting Logic
    raycaster.setFromCamera(mouse, camera);
    const objectsToCheck = [cloud, globalMap]; // checking 2D cloud and map
    if (cloud3D.visible) objectsToCheck.push(cloud3D);
    if (mesh3D.visible) objectsToCheck.push(mesh3D);

    const intersects = raycaster.intersectObjects(objectsToCheck);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const dist = hit.point.distanceTo(new THREE.Vector3(0,0,0));
        
        hoverMarker.visible = true;
        hoverMarker.position.copy(hit.point);
        
        const scale = 1 + Math.sin(Date.now() * 0.01) * 0.3;
        hoverMarker.scale.set(scale, scale, scale);

        if(tooltip) {
            tooltip.innerText = `Dist: ${dist.toFixed(2)}m`;
            tooltip.classList.remove('hidden');
        }
        document.body.style.cursor = 'crosshair';
    } else {
        hoverMarker.visible = false;
        if(tooltip) tooltip.classList.add('hidden');
        document.body.style.cursor = 'default';
    }

    renderer.render(scene, camera);
}

// SLAM Functions
function toggleMapping() {
    isMapping = !isMapping;
    const btn = document.getElementById('btnMap');
    if (btn) {
        btn.innerText = isMapping ? "Stop Map" : "Start Map";
        btn.className = isMapping ? "btn btn-primary" : "btn btn-secondary";
    }
}

function resetMap() {
    mapIndex = 0;
    if (mapGeo) mapGeo.setDrawRange(0, 0);
    robotPose = { x:0, y:0, theta:0 };
    if (robotGroup) {
        robotGroup.position.set(0,0,0);
        robotGroup.rotation.y = 0;
    }
}

// Mesh Rebuild (called from parse3D potentially, or if logic requires it)
function rebuildMesh(pos3D) {
    if (typeof SurfaceReconstruction !== 'undefined') {
        // Warning: This is expensive to run every frame. 
        // Only run when needed or throttling.
        const meshIndices = SurfaceReconstruction.gridBasedMesh(pos3D, 160, 60, 0.2);
        meshGeo3D.setIndex(meshIndices);
        meshGeo3D.computeVertexNormals();
    }
}

// Keyboard Teleop
window.addEventListener('keydown', (e) => {
    const speed = 0.1;
    const rotSpeed = 0.1;
    
    switch(e.key.toLowerCase()) {
        case 'w': robotPose.x -= Math.sin(robotPose.theta)*speed; robotPose.y += Math.cos(robotPose.theta)*speed; break; 
        case 's': robotPose.x += Math.sin(robotPose.theta)*speed; robotPose.y -= Math.cos(robotPose.theta)*speed; break;
        case 'a': robotPose.theta += rotSpeed; break;
        case 'd': robotPose.theta -= rotSpeed; break;
    }

    if (robotGroup) {
        robotGroup.position.set(robotPose.x, 0, robotPose.y);
        robotGroup.rotation.y = robotPose.theta + Math.PI;
    }
});

// Start everything
// Start everything
function verifyAndStart() {
    console.log("Checking DOM state for CygLiDAR Visualization...");
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVisualization);
    } else {
        initVisualization();
    }
}
verifyAndStart();

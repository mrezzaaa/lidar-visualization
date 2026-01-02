import { tablex, tabley, tablez } from './Constants3D';

export interface Point2D {
    x: number;
    y: number;
    z: number;
    color?: number; // Debug/Custom color
}

export interface DeviceInfo {
    ver: string;
    hw: string;
}

export type ParserMode = 'bitshift' | 'hexstring';

interface ParserCallbacks {
    on2D?: (points: Point2D[]) => void;
    on3D?: (points: Float32Array, distances: Uint16Array) => void;
    onInfo?: (info: DeviceInfo) => void;
}

/**
 * Handles buffering and parsing of Lidar packets.
 */
export class Parser {
    private buffer: Uint8Array;
    private hexBuffer: string = '';  // For hexstring mode accumulation
    public frames: number;
    public parserMode: ParserMode = 'bitshift';
    
    private on2D: (points: Point2D[]) => void;
    private on3D: (points: Float32Array, distances: Uint16Array) => void;
    private onInfo: (info: DeviceInfo) => void;

    constructor(callbacks: ParserCallbacks) {
        this.buffer = new Uint8Array(0);
        this.frames = 0;
        
        this.on2D = callbacks.on2D || (() => {});
        this.on3D = callbacks.on3D || (() => {});
        this.onInfo = callbacks.onInfo || (() => {});
    }

    setParserMode(mode: ParserMode) {
        console.log(`[Parser] Mode changing: ${this.parserMode} → ${mode}`);
        this.parserMode = mode;
    }

    /**
     * TEST METHOD: Generate flat depth grid (160x60) with all depths at 1500mm
     * This tests the depth camera projection without real sensor data
     */
    generateTestFlatGrid() {
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║       TEST: Generating Flat Depth Grid (1500mm)      ║');
        console.log('╚═══════════════════════════════════════════════════════╝');

        const GRID_WIDTH = 160;
        const GRID_HEIGHT = 60;
        const FLAT_DEPTH = 1500; // mm
        const totalPixels = GRID_WIDTH * GRID_HEIGHT;

        const points = new Float32Array(totalPixels * 4);
        const distances = new Uint16Array(totalPixels);

        // Generate flat grid: all pixels at 1500mm depth
        for (let i = 0; i < totalPixels; i++) {
            distances[i] = FLAT_DEPTH;
            this.computePointDepthCamera(i, FLAT_DEPTH, GRID_WIDTH, GRID_HEIGHT, points);
        }

        // Log sample points for verification
        console.log('\n[Test Grid] Sample 3D coordinates:');
        for (let row = 0; row < 3; row++) {
            const samples = [];
            for (let col = 0; col < 5; col++) {
                const idx = row * GRID_WIDTH + col;
                const x = points[idx * 4].toFixed(3);
                const y = points[idx * 4 + 1].toFixed(3);
                const z = points[idx * 4 + 2].toFixed(3);
                samples.push(`R${row}C${col}:(${x},${y},${z})`);
            }
            console.log('  ' + samples.join(' | '));
        }

        console.log('\n[Test Grid] Expected: Flat rectangular grid at Z ≈ -1.5m');
        console.log('═══════════════════════════════════════════════════════\n');

        // Send to visualization
        this.on3D(points, distances);
    }

    pushData(data: Uint8Array | string) {
        if (typeof data === 'string') {
            // HEXSTRING MODE: Accumulate hex string
            this.hexBuffer += data;
            // Removed noisy log - only log on packet extraction
            
            // Process hex buffer for header-to-header extraction
            this.processHexBuffer();
        } else {
            // BITSHIFT MODE: Existing path, DO NOT MODIFY
            const newBuffer = new Uint8Array(this.buffer.length + data.length);
            newBuffer.set(this.buffer);
            newBuffer.set(data, this.buffer.length);
            this.buffer = newBuffer;
            
            // Log small packets (likely INFO responses)
            if (data.length < 20) {
                console.log('[Parser] RX:', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            }
            
            this.processBuffer();
        }
    }

    private processBuffer() {
        if (this.buffer.length > 500000) {
            this.buffer = this.buffer.slice(this.buffer.length - 100000);
        }

        // Header Definitions
        // 2D: 5A 77 FF 43 01 01
        // 3D: 5A 77 FF 41 38 08
        // INFO: 5A 77 FF 07 00 10
        const H2D = [0x5A, 0x77, 0xFF, 0x43, 0x01, 0x01];
        const H3D = [0x5A, 0x77, 0xFF, 0x41, 0x38, 0x08];
        const HINFO = [0x5A, 0x77, 0xFF, 0x07, 0x00, 0x10];

        while (true) {
            // 1. Search for ANY Header Start
            let firstHeaderIdx = -1;
            let firstHeaderType = -1; // 1=2D, 8=3D, 16=INFO

            for(let i=0; i < this.buffer.length - 6; i++) {
                // Check INFO first (shortest payload)
                if (this.matchHeader(i, HINFO)) {
                    firstHeaderIdx = i;
                    firstHeaderType = 16;
                    break;
                }
                // Check 2D
                if (this.matchHeader(i, H2D)) {
                    firstHeaderIdx = i;
                    firstHeaderType = 1;
                    break;
                }
                // Check 3D
                if (this.matchHeader(i, H3D)) {
                    firstHeaderIdx = i;
                    firstHeaderType = 8;
                    break;
                }
            }
            
            // Debug: if no header found and we have data, log it
            if (firstHeaderIdx === -1 && this.buffer.length > 0 && this.buffer.length < 50) {
                console.log('[Parser] No header match. Buffer:', Array.from(this.buffer.slice(0, Math.min(20, this.buffer.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            }

            if (firstHeaderIdx === -1) {
                 // No header found in entire buffer
                 // Keep visible window small to prevent overflow if no header ever comes
                 if (this.buffer.length > 50000) {
                     this.buffer = this.buffer.slice(this.buffer.length - 10000);
                 }
                 return; 
            }

            // Discard data before first header
            if (firstHeaderIdx > 0) {
                this.buffer = this.buffer.slice(firstHeaderIdx);
                // Restart search from 0
                continue;
            }

            // Special case: INFO packet is fixed length (13 bytes total)
            if (firstHeaderType === 16) {
                console.log('[Parser] INFO header detected!');
                const infoPacketLength = 13;
                if (this.buffer.length >= infoPacketLength) {
                    const packet = this.buffer.slice(0, infoPacketLength);
                    console.log('[Parser] INFO packet full:', Array.from(packet).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                    
                    // Validate checksum
                    const len = packet.length;
                    const receivedCS = packet[len - 1];
                    let calcCS = 0;
                    for(let i=3; i < len - 1; i++) {
                        calcCS ^= packet[i];
                    }
                    
                    console.log('[Parser] Checksum - Received:', '0x' + receivedCS.toString(16), 'Calculated:', '0x' + calcCS.toString(16));
                    
                    if (calcCS === receivedCS) {
                        this.frames++;
                        console.log('[Parser] Checksum OK - calling parseInfo()');
                        this.parseInfo(packet);
                    } else {
                        console.warn('[Parser] Checksum FAILED for INFO packet');
                    }
                    
                    // Advance buffer past INFO packet
                    this.buffer = this.buffer.slice(infoPacketLength);
                    continue;
                } else {
                    console.log('[Parser] Waiting for complete INFO packet. Have:', this.buffer.length, 'Need: 13');
                    // Wait for complete INFO packet
                    return;
                }
            }

            // Special case for 2D: Use FIXED LENGTH (more stable than header-to-header)
            // 2D packet structure:
            // Header: 6 bytes (0x5A 0x77 0xFF 0xF3 0x00 0x01)
            // Data: 160 points × 2 bytes = 320 bytes
            // Checksum: 1 byte
            // Total: 327 bytes
            if (firstHeaderType === 1) {
                const FIXED_2D_LENGTH = 327;
                
                if (this.buffer.length >= FIXED_2D_LENGTH) {
                    const packet = this.buffer.slice(0, FIXED_2D_LENGTH);
                    
                    // Validate checksum
                    const len = packet.length;
                    const receivedCS = packet[len - 1];
                    let calcCS = 0;
                    for(let i=3; i < len - 1; i++) {
                        calcCS ^= packet[i];
                    }
                    
                    if (calcCS === receivedCS) {
                        this.frames++;
                        const realPayloadLen = 320; // Fixed 320 bytes data
                        this.parse2D(packet, realPayloadLen);
                    } else {
                        // Bad checksum - try to parse anyway (legacy behavior)
                        const realPayloadLen = 320;
                        this.parse2D(packet, realPayloadLen);
                        this.frames++;
                    }
                    
                    // Advance buffer by fixed length
                    this.buffer = this.buffer.slice(FIXED_2D_LENGTH);
                    continue;
                } else {
                    // Wait for complete 2D packet
                    return;
                }
            }

            // For 3D: Search for the SECOND Header
            let secondHeaderIdx = -1;
            
            // Start searching AFTER the current header (offset 6)
            for(let i=6; i < this.buffer.length - 6; i++) {
                 if (this.matchHeader(i, H2D) || this.matchHeader(i, H3D)) {
                     secondHeaderIdx = i;
                     break;
                 }
            }

            if (secondHeaderIdx === -1) {
                // Second header not found yet.
                // We need to wait for more data.
                // Safety: If buffer grows massive without a second header, something is wrong.
                if (this.buffer.length > 40000) {
                    // console.warn("Buffer huge implies missing next header?");
                }
                return;
            }

            // 3. Extract logic: "ambil mulai dari yang first sampai checksum sebelum header second"
            // The packet is from 0 to secondHeaderIdx.
            const packet = this.buffer.slice(0, secondHeaderIdx);
            
            // Checksum Validation
            // calculated from [3]...[len-2]
            // received is [len-1]
            const len = packet.length;
            const receivedCS = packet[len - 1];
            let calcCS = 0;
            for(let i=3; i < len - 1; i++) {
                calcCS ^= packet[i];
            }

            if (calcCS === receivedCS) {
                this.frames++;
                if (firstHeaderType === 8) {
                     this.parse3D(packet);
                } else if (firstHeaderType === 1) {
                     const realPayloadLen = Math.max(0, len - 7);
                     this.parse2D(packet, realPayloadLen);
                } else if (firstHeaderType === 16) {
                     this.parseInfo(packet);
                }
            } else {
                 console.warn(`[Parser] Checksum FAILED (H2H). Type: ${firstHeaderType} Len: ${len}`);
                 // Legacy Force Parse
                 if (firstHeaderType === 1) {
                     // console.warn("Forcing 2D Parse (Legacy)");
                     const realPayloadLen = Math.max(0, len - 7);
                     this.parse2D(packet, realPayloadLen);
                     this.frames++;
                 }
            }

            // 4. Advance buffer: "baru lanjut proses seterusnya"
            // The 'second header' becomes the 'first header' for the next iteration.
            this.buffer = this.buffer.slice(secondHeaderIdx);
        }
    }

    /**
     * Process hex buffer - detect headers and extract packets (header-to-header)
     * LOGGING ONLY for Phase 4 - user verification required before parsing
     */
    private processHexBuffer() {
        // Prevent buffer overflow
        if (this.hexBuffer.length > 100000) {
            console.warn('[Parser] Hex buffer overflow, trimming...');
            this.hexBuffer = this.hexBuffer.slice(-50000);
        }

        const H2D_STR = "5a77ff430101";
        const H3D_STR = "5a77ff413808";
        const HINFO_STR = "5a77ff0700";

        // Find first header
        const h2dIdx = this.hexBuffer.indexOf(H2D_STR);
        const h3dIdx = this.hexBuffer.indexOf(H3D_STR);
        const hInfoIdx = this.hexBuffer.indexOf(HINFO_STR);

        const candidates = [
            { idx: h2dIdx, type: '2D', header: H2D_STR },
            { idx: h3dIdx, type: '3D', header: H3D_STR },
            { idx: hInfoIdx, type: 'INFO', header: HINFO_STR }
        ].filter(c => c.idx >= 0);

        if (candidates.length === 0) {
            // No headers found yet
            return;
        }

        // Get earliest header
        candidates.sort((a, b) => a.idx - b.idx);
        const first = candidates[0];

        // Discard data before first header
        if (first.idx > 0) {
            // console.log(`[Parser] Discarding ${first.idx} chars before ${first.type} header`);
            this.hexBuffer = this.hexBuffer.slice(first.idx);
        }

        // ============================================================
        // 2D MODE: Use FIXED LENGTH extraction (more stable)
        // ============================================================
        if (first.type === '2D') {
            const FIXED_2D_LENGTH = 658; // Header(12) + Data(644) + CS(2)
            
            if (this.hexBuffer.length < FIXED_2D_LENGTH) {
                return; // Wait silently
            }
            
            const packetString = this.hexBuffer.slice(0, FIXED_2D_LENGTH);
            // console.log(`[Parser] 2D FIXED-LENGTH EXTRACTED: ${FIXED_2D_LENGTH} chars`);
            
            this.parse2DHex(packetString);
            this.hexBuffer = this.hexBuffer.slice(FIXED_2D_LENGTH);
            this.frames++;
            return; // Exit early for 2D
        }

        // ============================================================
        // 3D MODE: Use FIXED LENGTH extraction (more stable)
        // ============================================================
        if (first.type === '3D') {
            const FIXED_3D_LENGTH = 28814; // Header(12) + Data(28800) + CS(2)
            
            if (this.hexBuffer.length < FIXED_3D_LENGTH) {
                return; // Wait silently
            }
            
            const packetString = this.hexBuffer.slice(0, FIXED_3D_LENGTH);
            // console.log(`[Parser] 3D FIXED-LENGTH EXTRACTED: ${FIXED_3D_LENGTH} chars`);
            
            this.parse3DHex(packetString);
            this.hexBuffer = this.hexBuffer.slice(FIXED_3D_LENGTH);
            this.frames++;
            return; // Exit early for 3D
        }

        // ============================================================
        // INFO MODE: Use HEADER-TO-HEADER extraction
        // ============================================================
        // Find next header (for header-to-header extraction)
        const searchStart = first.header.length;
        const nextCandidates = [
            { idx: this.hexBuffer.indexOf(H2D_STR, searchStart), type: '2D' },
            { idx: this.hexBuffer.indexOf(H3D_STR, searchStart), type: '3D' },
            { idx: this.hexBuffer.indexOf(HINFO_STR, searchStart), type: 'INFO' }
        ].filter(c => c.idx > 0);

        if (nextCandidates.length === 0) {
            return; // Wait silently for next header
        }

        nextCandidates.sort((a, b) => a.idx - b.idx);
        const next = nextCandidates[0];

        // Extract packet (header-to-header)
        const packetString = this.hexBuffer.slice(0, next.idx);

        // DETAILED LOGGING FOR USER VERIFICATION
        // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        // console.log(`[Parser] PACKET EXTRACTED (${first.type})`);
        // console.log(`  ┌─ Start: ${first.type} header at position 0`);
        // console.log(`  ├─ End: ${next.type} header at position ${next.idx}`);
        // console.log(`  ├─ Total length: ${packetString.length} chars (${packetString.length / 2} bytes)`);
        // console.log(`  ├─ First 60 chars: ${packetString.substring(0, 60)}`);
        // console.log(`  └─ Last 60 chars: ${packetString.substring(packetString.length - 60)}`);
        // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Phase 5: Parse packet based on type
        if (first.type === 'INFO') this.parseInfoHex(packetString);
        else if (first.type === '2D') this.parse2DHex(packetString);
        else if (first.type === '3D') this.parse3DHex(packetString);

        // Advance buffer to next header
        this.hexBuffer = this.hexBuffer.slice(next.idx);
    }

    private matchHeader(offset: number, pattern: number[]): boolean {
        for(let i=0; i<pattern.length; i++) {
            if (this.buffer[offset+i] !== pattern[i]) return false;
        }
        return true;
    }

    private parse3D(pkt: Uint8Array) {
        // pkt includes Header(6) + Data + Checksum(1)
        // Data starts at 6
        const dataStart = 6;
        const dataEnd = pkt.length - 1; 

        // 9600 pixels (160x60)
        // Output format: Float32Array [x, y, z, c, x, y, z, c, ...]
        const totalPixels = 160 * 60;
        const points = new Float32Array(totalPixels * 4); 
        const distances = new Uint16Array(totalPixels);

        let dataIndex = dataStart;
        
        // Loop through 9600 pixels, 2 pixels at a time (3 bytes)
        for (let i = 0; i < totalPixels; i += 2) {
            // Bounds check
            if (dataIndex + 2 >= dataEnd) {
                // console.warn("Boundary reached at pixel", i);
                break;
            }
            
            const b0 = pkt[dataIndex];
            const b1 = pkt[dataIndex+1];
            const b2 = pkt[dataIndex+2];
            
            // Pixel i (12 bits)
            const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
            // Pixel i+1 (12 bits)
            const dist1 = ((b1 & 0x0F) << 8) | b2;
            
            distances[i] = dist0;
            distances[i+1] = dist1;

            this.computePoint(i, dist0, points);
            this.computePoint(i+1, dist1, points);
            
            dataIndex += 3;
        }
        
        this.on3D(points, distances);
    }

    /**
     * Legacy: Compute 3D point using lookup tables (for bitshift mode)
     */
    private computePoint(idx: number, dist: number, points: Float32Array) {
        // Sensor spec: 50mm - 2000mm valid range
        // 3D Error codes: 4080-4095 (0xFF0-0xFFF) indicate errors/out-of-range
        const MIN_RANGE = 50;
        const MAX_RANGE = 2000;
        const ERROR_CODE_MIN = 4080; // 0xFF0
        
        // Reject if:
        // 1. Zero (no measurement)
        // 2. Below minimum range
        // 3. Above maximum range  
        // 4. Error code range (4080-4095)
        if (dist === 0 || dist < MIN_RANGE || dist > MAX_RANGE || dist >= ERROR_CODE_MIN) {
             points[idx*4] = 0;
             points[idx*4+1] = 0;
             points[idx*4+2] = 0;
             points[idx*4+3] = 0; 
             return;
        }

        const MM2M = 0.001;
        
        const x = dist * tablex[idx] * MM2M;
        const y = -dist * tabley[idx] * MM2M; 
        const z = -dist * tablez[idx] * MM2M; 
        
        // Simple Hue Color Mapping
        const normalized = Math.min(dist / 3000.0, 1.0);
        const hue = (1.0 - normalized) * 0.7; // Red to Blue/Purple

        points[idx*4] = x;
        points[idx*4+1] = y;
        points[idx*4+2] = z;
        points[idx*4+3] = hue;
    }

    /**
     * Compute 3D point for DEPTH CAMERA using row/column-based projection
     * @param idx Linear index in the depth grid (0-9599)
     * @param dist Depth value in millimeters
     * @param gridWidth Width of depth grid (160)
     * @param gridHeight Height of depth grid (60)
     * @param points Output Float32Array
     */
    private computePointDepthCamera(
        idx: number, 
        dist: number, 
        gridWidth: number, 
        gridHeight: number, 
        points: Float32Array
    ) {
        const MIN_RANGE = 50;
        const MAX_RANGE = 2000;      // 3D depth camera spec: 50-2000mm
        const ERROR_CODE_MIN = 4080;
        
        // Reject invalid measurements
        if (dist === 0 || dist < MIN_RANGE || dist > MAX_RANGE || dist >= ERROR_CODE_MIN) {
            points[idx*4] = 0;
            points[idx*4+1] = 0;
            points[idx*4+2] = 0;
            points[idx*4+3] = 0;
            return;
        }

        // Convert linear index to row/column
        // This maps the linear data index to the actual grid position
        const row = Math.floor(idx / gridWidth);  // Which row (0-59)
        const col = idx % gridWidth;              // Which column (0-159)

        // Depth camera FOV (degrees) - FROM MANUAL
        const H_FOV = 120; // Horizontal field of view
        const V_FOV = 65;  // Vertical field of view (manual says 65°, not 60°!)

        // Calculate angles based on row/col position in grid
        // Column 0 = leftmost = -60°, Column 159 = rightmost = +60°
        // Row 0 = topmost = +30°, Row 59 = bottommost = -30°
        const colAngleRad = ((col / (gridWidth - 1)) - 0.5) * H_FOV * (Math.PI / 180);
        const rowAngleRad = (0.5 - (row / (gridHeight - 1))) * V_FOV * (Math.PI / 180);

        // Convert depth to meters
        const MM2M = 0.001;
        const depthM = dist * MM2M;

        // PINHOLE CAMERA MODEL (Planar Projection)
        // Z = depth along camera axis (constant for same depth)
        // X = horizontal offset calculated from column angle
        // Y = vertical offset calculated from row angle
        const z = -depthM;                        // Depth along Z-axis
        const x = z * Math.tan(colAngleRad);     // Use col angle for X
        const y = z * Math.tan(rowAngleRad);     // Use row angle for Y

        // Color mapping based on depth
        const normalized = Math.min(dist / 2000.0, 1.0);
        const hue = (1.0 - normalized) * 0.7; // Red (close) to Blue (far)

        points[idx*4] = x;
        points[idx*4+1] = -y;
        points[idx*4+2] = -z;
        points[idx*4+3] = hue;
    }

    private parse2D(pkt: Uint8Array, payloadLen: number) {
         if (this.parserMode === 'hexstring') {
             this.parse2DHexString(pkt, payloadLen);
         } else {
             this.parse2DBitShift(pkt, payloadLen);
         }
    }
    
    private parse2DBitShift(pkt: Uint8Array, payloadLen: number) {
         const dataLen = payloadLen - 1;
         const numPoints = Math.floor(dataLen / 2);
         const points: Point2D[] = [];
         const MAX_POINTS = 1000;
         
         for(let i=0; i<numPoints; i++) {
             if (points.length >= MAX_POINTS) break;

             const off = 6 + (i*2);
             const dist = (pkt[off] << 8) | pkt[off+1];

             const step = 120.0 / (numPoints - 1 || 1); 
             const angleDeg = -60 + (i * step);
             const angleRad = angleDeg * (Math.PI/180);

             if (dist > 0 && dist < 10000 && dist < 16000) {
                 const dm = dist/1000.0;
                 const x = -Math.sin(angleRad) * dm;
                 const z = Math.cos(angleRad) * dm;
                 
                 // const hue = (1.0 - Math.min(dm/3, 1)) * 0.3; 
                 // Removing 'c' property. Use generic color for now.
                 points.push({ x, y: 0, z, color: 0x00ff00 }); 
             }
         }
         
         this.on2D(points);
         // console.log("[Parser] 2D BitShift - Points:", points.length);
    }
    
    private parse2DHexString(pkt: Uint8Array, payloadLen: number) {
         // 16-bit parsing per user manual spec
         // Data Type: 16 bit (2 bytes per distance)
         // Error codes: 16000-16004
         
         // Convert packet to hex string
         const hexData = Array.from(pkt).map(b => b.toString(16).padStart(2, '0')).join('');
         
         // console.log(`[Parser HexString] Packet hex (first 40): ${hexData.substring(0, 40)}...`);
         
         // Remove header "5a77ff430101" (12 hex chars = 6 bytes)
         const dataWithoutHeader = hexData.substring(12);
         
         // Remove checksum (last 2 hex chars)
         const dataOnly = dataWithoutHeader.substring(0, dataWithoutHeader.length - 2);
         
         // console.log(`[Parser HexString] Data length: ${dataOnly.length} hex chars, Expected: ${160 * 4} for 160 points`);
         
         const points: Point2D[] = [];
         const errorCodes = [16000, 16001, 16002, 16003, 16004];
         
         // Parse 16-bit values: 4 hex chars per point (2 bytes)
         for (let i = 0; i < dataOnly.length; i += 4) {
             if (i + 4 > dataOnly.length) break;
             
             // Extract 4 hex chars = 16 bits = 2 bytes (LSB+MSB)
             const distHex = dataOnly.substring(i, i + 4);
             const dist = parseInt(distHex, 16);
             
             // Calculate point index from byte position
             const pointIndex = i / 4;
             
             // Skip error codes
             if (errorCodes.includes(dist)) {
                 continue;
             }
             
             // Calculate angle: -60° to +60° at 0.75° steps
             const angleDeg = -60 + (pointIndex * 0.75);
             const angleRad = angleDeg * (Math.PI / 180);
             
             // Filter valid range (200-8000mm per spec)
             if (dist >= 200 && dist <= 8000) {
                 const dm = dist / 1000.0;
                 const x = -Math.sin(angleRad) * dm;
                 const z = Math.cos(angleRad) * dm;
                 points.push({ x, y: 0, z, color: 0x00ff00 });
             }
         }
         
         this.on2D(points);
         // console.log(`[Parser] 2D HexString - Valid points: ${points.length} / ${Math.floor(dataOnly.length / 4)} total`);
    }

    /**
     * Parse INFO packet from hexstring (Phase 5)
     * Input: full packet as hexstring
     */
    private parseInfoHex(packetStr: string) {
        // Remove header (first 12 chars)
        const dataStr = packetStr.slice(12);
        
        // Parse firmware version (chars 0-5 → bytes 0-2)
        const fw1 = parseInt(dataStr.slice(0, 2), 16);
        const fw2 = parseInt(dataStr.slice(2, 4), 16);
        const fw3 = parseInt(dataStr.slice(4, 6), 16);
        
        // Parse hardware version (chars 6-11 → bytes 3-5)
        const hw1 = parseInt(dataStr.slice(6, 8), 16);
        const hw2 = parseInt(dataStr.slice(8, 10), 16);
        const hw3 = parseInt(dataStr.slice(10, 12), 16);
        
        const ver = `${fw1}.${fw2}.${fw3}`;
        const hw = `${hw1}.${hw2}.${hw3}`;
        
        this.onInfo({ ver, hw });
        console.log(`[Parser] Device Info (Hex Mode): FW=${ver}, HW=${hw}`);
    }

    /**
     * Parse 2D scan from hexstring (Phase 5)
     * Input: full packet as hexstring, 4 chars (16-bit) per distance
     * Format: LSB+MSB per angle, 0.75° resolution from -60° to +60°
     */
    private parse2DHex(packetStr: string) {
        // Remove header (12 chars) and checksum (last 2 chars)
        const dataStr = packetStr.slice(12, packetStr.length - 2);
        
        // 2D uses 16-bit (4 hex chars) per distance
        if (dataStr.length % 4 !== 0) {
            console.warn(`[Parser] 2D Hex skipped - invalid length: ${dataStr.length} (not divisible by 4)`);
            // Skip this packet but continue processing
            return;
        }
        
        // Sanity check: expected ~161 points × 4 = ~644 chars
        // Allow range 100-2000 chars to handle variations
        if (dataStr.length < 100 || dataStr.length > 2000) {
            console.warn(`[Parser] 2D Hex skipped - unexpected size: ${dataStr.length} chars`);
            return;
        }
        
        const numPoints = dataStr.length / 4;
        const points: Point2D[] = [];
        
        for (let i = 0; i < numPoints; i++) {
            // Read 4 hex chars = 16-bit value (LSB+MSB)
            const hexChars = dataStr.substring(i * 4, i * 4 + 4);
            const dist = parseInt(hexChars, 16);
            
            // Angle: -60° to +60° based on point index
            const angleRad = (-60 + (i * (120.0 / (numPoints - 1 || 1)))) * (Math.PI / 180);

            if (!isNaN(dist) && dist > 50 && dist < 16000) {
                const dm = dist * 0.001;
                points.push({ 
                    x: -Math.sin(angleRad) * dm, 
                    y: 0, 
                    z: Math.cos(angleRad) * dm, 
                    color: 0x00ff00 
                });
            }
        }
        
        console.log(`[Parser] 2D Hex Mode (16-bit): ${points.length}/${numPoints} valid points`);
        this.on2D(points);
    }

    /**
     * Parse 3D scan from hexstring - DEPTH CAMERA MODE
     * Input: full packet as hexstring
     * Format: 160x60 depth grid, 12-bit PACKED (2 pixels per 3 bytes)
     * Layout: Row-major order [R0C0, R0C1, ..., R0C159, R1C0, R1C1, ...]
     * Example from manual: 0x5D 0xC7 0xD0 → R0C0=0x5DC (1500mm), R0C1=0x7D0 (2000mm)
     */
    private parse3DHex(packetStr: string) {
        // Remove header (12 chars) and checksum (last 2 chars)
        const dataStr = packetStr.slice(12, packetStr.length - 2);
        
        // 12-bit packed: 3 bytes (6 hex chars) = 2 pixels
        // 9600 pixels = 4800 groups × 6 chars = 28800 chars ✓
        if (dataStr.length !== 28800) {
            console.error(`[Parser] 3D Hex CRITICAL: expected 28800 chars, got ${dataStr.length}`);
            return;
        }

        // Depth camera grid parameters
        const GRID_WIDTH = 160;  // columns
        const GRID_HEIGHT = 60;   // rows
        const totalPixels = GRID_WIDTH * GRID_HEIGHT; // 9600

        const points = new Float32Array(totalPixels * 4);
        const distances = new Uint16Array(totalPixels);
        
        let validCount = 0;
        
        // Process 2 pixels at a time (6 hex chars = 3 bytes)
        // Format: byte0 byte1 byte2 → pixel0=(byte0<<4)|(byte1>>4), pixel1=((byte1&0xF)<<8)|byte2
        for (let i = 0; i < totalPixels; i += 2) {
            const hexStart = (i / 2) * 6; // 6 hex chars for 2 pixels

            // Read 6 hex chars (3 bytes) for 2 pixels
            const b0 = parseInt(dataStr.substring(hexStart, hexStart + 2), 16);
            const b1 = parseInt(dataStr.substring(hexStart + 2, hexStart + 4), 16);
            const b2 = parseInt(dataStr.substring(hexStart + 4, hexStart + 6), 16);
            
            // Extract 12-bit values (BIG ENDIAN - MSB first)
            // Pixel i: first 12 bits (byte0 + high nibble of byte1)
            const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
            // Pixel i+1: last 12 bits (low nibble of byte1 + byte2)
            const dist1 = ((b1 & 0x0F) << 8) | b2;
            
            distances[i] = dist0;
            distances[i + 1] = dist1;
            
            // Compute 3D points with row/column awareness
            this.computePointDepthCamera(i, dist0, GRID_WIDTH, GRID_HEIGHT, points);
            this.computePointDepthCamera(i + 1, dist1, GRID_WIDTH, GRID_HEIGHT, points);
            
            // Count valid points
            const MIN_RANGE = 50;
            const MAX_RANGE = 2000;
            const ERROR_CODE_MIN = 4080;
            
            if (dist0 >= MIN_RANGE && dist0 <= MAX_RANGE && dist0 < ERROR_CODE_MIN) validCount++;
            if (dist1 >= MIN_RANGE && dist1 <= MAX_RANGE && dist1 < ERROR_CODE_MIN) validCount++;
        }
        
        // DEBUG: Compare both parsing methods
        console.log('\n🔍 [PARSING DEBUG] Comparing methods:');
        console.log('Raw hex (first 30 chars):', dataStr.substring(0, 30));
        
        // Method 1: Bit-packed (current)
        const test1 = [];
        for (let i = 0; i < 10; i += 2) {
            const hs = (i / 2) * 6;
            const b0 = parseInt(dataStr.substring(hs, hs + 2), 16);
            const b1 = parseInt(dataStr.substring(hs + 2, hs + 4), 16);
            const b2 = parseInt(dataStr.substring(hs + 4, hs + 6), 16);
            const d0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
            const d1 = ((b1 & 0x0F) << 8) | b2;
            test1.push(`${d0}`, `${d1}`);
        }
        console.log('Method 1 (bit-packed):', test1.join(', '));
        
        // Method 2: 3-char per pixel
        const test2 = [];
        for (let i = 0; i < 10; i++) {
            const hex3 = dataStr.substring(i * 3, i * 3 + 3);
            const d = parseInt(hex3, 16);
            test2.push(`${d}`);
        }
        console.log('Method 2 (3-char):', test2.join(', '));
        console.log('');
        
        // ═══════════════════════════════════════════════════════
        // DEPTH GRID LOGGING
        // ═══════════════════════════════════════════════════════
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║         DEPTH CAMERA GRID (160×60)                    ║');
        console.log('╚═══════════════════════════════════════════════════════╝');
        
        // Log first row (R0C0 through R0C9)
        console.log('\n[Depth Grid] First Row (R0C0 - R0C9):');
        const row0Samples = [];
        for (let col = 0; col < 10; col++) {
            const idx = col; // First row
            row0Samples.push(`R0C${col}=${distances[idx]}mm`);
        }
        console.log(row0Samples.join(', '));
        
        // Log sample from middle row (R30C0 - R30C9)
        console.log('\n[Depth Grid] Middle Row (R30C0 - R30C9):');
        const row30Samples = [];
        for (let col = 0; col < 10; col++) {
            const idx = 30 * GRID_WIDTH + col;
            row30Samples.push(`R30C${col}=${distances[idx]}mm`);
        }
        console.log(row30Samples.join(', '));
        
        // Log raw hex samples for debugging
        console.log('\n[Raw Hex] First 30 chars (10 pixels):');
        console.log(dataStr.substring(0, 30));
        console.log('Parsed as:', dataStr.match(/.{3}/g)?.slice(0, 10).map(h => `${h}=${parseInt(h,16)}mm`).join(', '));
        
        // Log statistics
        let minDist = Infinity, maxDist = 0, sumDist = 0;
        for (let i = 0; i < totalPixels; i++) {
            if (distances[i] > 0 && distances[i] < 4080) {
                minDist = Math.min(minDist, distances[i]);
                maxDist = Math.max(maxDist, distances[i]);
                sumDist += distances[i];
            }
        }
        const avgDist = validCount > 0 ? sumDist / validCount : 0;
        
        console.log('\n[3D Stats]');
        console.log(`  Total pixels: ${totalPixels}`);
        console.log(`  Valid points: ${validCount} (${(validCount/totalPixels*100).toFixed(1)}%)`);
        console.log(`  Depth range: ${minDist}mm - ${maxDist}mm`);
        console.log(`  Average depth: ${avgDist.toFixed(1)}mm`);
        
        // Log sample 3D coordinates
        console.log('\n[3D Coordinates] Sample points:');
        for (let i = 0; i < 5; i++) {
            const row = Math.floor(i / GRID_WIDTH);
            const col = i % GRID_WIDTH;
            const idx = i * 4;
            console.log(`  R${row}C${col}: depth=${distances[i]}mm → (x=${points[idx].toFixed(3)}, y=${points[idx+1].toFixed(3)}, z=${points[idx+2].toFixed(3)})`);
        }
        
        console.log('═══════════════════════════════════════════════════════\n');
        
        this.on3D(points, distances);
    }

    private parseInfo(pkt: Uint8Array) {
        // Response format: 5A 77 FF 07 00 10 F/W1 F/W2 F/W3 H/W1 H/W2 H/W3 CS
        // Bytes 6-8: Firmware version
        // Bytes 9-11: Hardware version
        const ver = `${pkt[6]}.${pkt[7]}.${pkt[8]}`;
        const hw = `${pkt[9]}.${pkt[10]}.${pkt[11]}`;
        this.onInfo({ ver, hw });
        console.log(`[Parser] Device Info: FW=${ver}, HW=${hw}`);
    }
}



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

export type MatrixScanOrder = 
    | 'row-major' 
    | 'col-major' 
    | 'col-major-flip-y' 
    | 'full-reverse' 
    | 'flip-x' 
    | 'flip-y' 
    | 'zigzag-horizontal';

export type YAxisDirection = 'up' | 'down';

interface ParserCallbacks {
    on2D?: (points: Point2D[]) => void;
    on3D?: (points: Float32Array, distances: Uint16Array) => void;
    onInfo?: (info: DeviceInfo) => void;
}

/**
 * Handles buffering and parsing of Lidar packets.
 */
export class Parser {
    // 3Mbps optimization: Pre-allocate 2MB buffer to avoid GC pressure
    private buffer: Uint8Array = new Uint8Array(2_000_000); 
    private bufferLength: number = 0; // Valid data length
    private readOffset: number = 0;   // Current read position
    
    // Rate Limiting & GC Optimization
    private last3DTime: number = 0;
    private first3DLogged: boolean = false;   // Dump raw distances once (frame #1)
    private _headerLogged: boolean = false;   // Header log
    private lastStatsTime: number = 0;        // Throttle stats log
    private depthFilterEnabled = false;
    public matrixScanOrder: MatrixScanOrder = 'row-major';
    public sentinelFilterEnabled: boolean = false;
    public yAxisDirection: YAxisDirection = 'up';
    public mirrorX: boolean = false;

    private reusablePoints: Float32Array;      // 160*60*4 = 38,400 floats
    private reusableDistances: Uint16Array;    // 160*60 = 9,600 ints

    private hexBuffer: string = '';  
    public frames: number;
    public parserMode: ParserMode = 'bitshift';
    
    private on2D: (points: Point2D[]) => void;
    private on3D: (points: Float32Array, distances: Uint16Array) => void;
    private onInfo: (info: DeviceInfo) => void;

    constructor(callbacks: ParserCallbacks) {
        this.frames = 0;
        
        const totalPixels = 160 * 60;
        this.reusablePoints = new Float32Array(totalPixels * 4);
        this.reusableDistances = new Uint16Array(totalPixels);

        this.on2D = callbacks.on2D || (() => {});
        this.on3D = callbacks.on3D || (() => {});
        this.onInfo = callbacks.onInfo || (() => {});
    }

    setParserMode(mode: ParserMode) {
        this.parserMode = mode;
        this.readOffset = 0;
        this.bufferLength = 0;
        this.hexBuffer = '';
    }

    setDepthFilter(enabled: boolean) {
        this.depthFilterEnabled = enabled;
    }

    setMatrixScanOrder(order: MatrixScanOrder) {
        this.matrixScanOrder = order;
    }

    setSentinelFilter(enabled: boolean) {
        this.sentinelFilterEnabled = enabled;
    }

    setYAxisDirection(dir: YAxisDirection) {
        this.yAxisDirection = dir;
    }

    setMirrorX(mirror: boolean) {
        this.mirrorX = mirror;
    }

    setLowAmpShadows(enabled: boolean) {
        this.showLowAmpShadows = enabled;
    }

    /**
     * TEST METHOD: Generate flat depth grid (160x60) with all depths at 1500mm
     * This tests the depth camera projection without real sensor data
     */
    generateTestFlatGrid() {
        // console.log('╔═══════════════════════════════════════════════════════╗');
        // console.log('║       TEST: Generating Flat Depth Grid (1500mm)      ║');
        // console.log('╚═══════════════════════════════════════════════════════╝');

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

        // Send to visualization
        this.on3D(points, distances);
    }

    pushData(data: Uint8Array | string) {
        if (typeof data === 'string') {
            // HEXSTRING MODE: Accumulate hex string
            this.hexBuffer += data;
            this.processHexBuffer();
        } else {
            // BITSHIFT MODE: Accumulate byte buffer
            // 1. Compact buffer if needed (if readOffset is far ahead or buffer is full)
            if (this.readOffset > 1_000_000 || (this.bufferLength + data.length > this.buffer.length)) {
                this.compactBuffer();
            }

            // 2. Append new data
            if (this.bufferLength + data.length > this.buffer.length) {
                console.warn("[Parser] Buffer overflow resizing!");
                const newB = new Uint8Array(this.buffer.length * 2);
                newB.set(this.buffer.subarray(0, this.bufferLength));
                this.buffer = newB;
            }

            this.buffer.set(data, this.bufferLength);
            this.bufferLength += data.length;

            // 3. Process available packets
            this.processBuffer();
        }
    }

    private compactBuffer() {
        if (this.readOffset === 0) return;
        
        // Move valid data (readOffset -> bufferLength) to start (0)
        // copyWithin is fast (memmove)
        this.buffer.copyWithin(0, this.readOffset, this.bufferLength);
        
        this.bufferLength -= this.readOffset;
        this.readOffset = 0;
    }

    public processBuffer() {
        // Header Definitions matched byte-by-byte
        const H2D   = [0x5A, 0x77, 0xFF, 0x43, 0x01, 0x01];
        const H3D   = [0x5A, 0x77, 0xFF, 0x41, 0x38, 0x08];
        const HINFO = [0x5A, 0x77, 0xFF, 0x07, 0x00, 0x10];

        while (true) {
            // Available data length
            const available = this.bufferLength - this.readOffset;
            if (available < 6) break; // Need at least header size

            // 1. Search for ANY Header Start using readOffset
            let firstHeaderIdx = -1;
            let firstHeaderType = -1; // 1=2D, 8=3D, 16=INFO

            // Scan limits: check up to available-6
            const scanEnd = this.bufferLength - 6; 
            
            // Optimization: Use indexOf for the first byte (0x5A) then check rest
            // Scan for 0x5A
            for(let i = this.readOffset; i < scanEnd; i++) {
                if (this.buffer[i] === 0x5A) {
                    // Check rest of header
                    if (this.matchHeader(i, HINFO)) {
                        firstHeaderIdx = i; firstHeaderType = 16; break;
                    }
                    if (this.matchHeader(i, H2D)) {
                        firstHeaderIdx = i; firstHeaderType = 1; break;
                    }
                    if (this.matchHeader(i, H3D)) {
                        firstHeaderIdx = i; firstHeaderType = 8; break;
                    }
                }
            }
            
            if (firstHeaderIdx === -1) {
                 // No header found in entire available window
                 // We can discard everything except maybe the last few bytes (fragments of a header)
                 this.readOffset = Math.max(this.readOffset, this.bufferLength - 6);
                 return; 
            }

            // Discard garbage before first header
            if (firstHeaderIdx > this.readOffset) {
                this.readOffset = firstHeaderIdx;
            }

            // Available bytes starting from header
            const payloadAvailable = this.bufferLength - this.readOffset;

            // ============================================================
            // INFO Packet (Fixed 13 bytes)
            // ============================================================
            if (firstHeaderType === 16) {
                const INFO_LEN = 13;
                if (payloadAvailable >= INFO_LEN) {
                    // Extract using subarray (view)
                    const packet = this.buffer.subarray(this.readOffset, this.readOffset + INFO_LEN);
                    
                    if (this.validateChecksum(packet)) {
                        this.frames++;
                        this.parseInfo(packet);
                    }
                    this.readOffset += INFO_LEN;
                    continue;
                } else {
                    return; // Wait for more data
                }
            }

            // ============================================================
            // 2D Packet (Fixed 327 bytes)
            // ============================================================
            if (firstHeaderType === 1) {
                const FIXED_2D_LENGTH = 327;
                
                if (payloadAvailable >= FIXED_2D_LENGTH) {
                    const packet = this.buffer.subarray(this.readOffset, this.readOffset + FIXED_2D_LENGTH);
                    
                    if (this.validateChecksum(packet)) {
                        this.frames++;
                        this.parse2D(packet, 320);
                    } else {
                        // Legacy: Force parse even if bad checksum
                        this.frames++;
                        this.parse2D(packet, 320); 
                    }
                    this.readOffset += FIXED_2D_LENGTH;
                    continue;
                } else {
                    return; // Wait
                }
            }

            // ============================================================
            // 3D Packet (Fixed 14407 bytes)
            // ============================================================
            if (firstHeaderType === 8) {
                // Header (6) + Data (160*60*1.5 = 14400) + Checksum (1) = 14407 bytes
                const FIXED_3D_LENGTH = 14407;

                if (payloadAvailable >= FIXED_3D_LENGTH) {
                    const packet = this.buffer.subarray(this.readOffset, this.readOffset + FIXED_3D_LENGTH);

                    this.frames++;
                    this.parse3D(packet);
                    this.readOffset += FIXED_3D_LENGTH;
                    continue;
                } else {
                    return; // Wait for full packet
                }
            }
        }
    }

    private matchHeader(offset: number, pattern: number[]): boolean {
        for(let i=0; i<pattern.length; i++) {
            if (this.buffer[offset+i] !== pattern[i]) return false;
        }
        return true;
    }

    private validateChecksum(packet: Uint8Array): boolean {
        const len = packet.length;
        if (len < 5) return false;
        
        const receivedCS = packet[len - 1];
        let calcCS = 0;
        for (let i = 3; i < len - 1; i++) {
            calcCS ^= packet[i];
        }
        return calcCS === receivedCS;
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

    private parse3D(pkt: Uint8Array) {
        // Rate Limiting: Check BEFORE heavy parsing loop
        // Only emit 3D data max 30 times per second (33ms)
        const now = performance.now();
        if (now - this.last3DTime < 33) {
            return; // Skip this frame entirely (saving CPU)
        }
        this.last3DTime = now;

        // One-time frame-header snapshot for debugging checksum / frame-boundary issues.
        if (!this._headerLogged) {
            this._headerLogged = true;
            const hex = Array.from(pkt.subarray(0, Math.min(pkt.length, 16)))
                .map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
            const plen = (pkt[4] << 8) | pkt[3];
            console.log(
                `%c[Parser] 3D frame header (first 16 bytes):\n` +
                `  ${hex}\n` +
                `  payloadLen=${plen}  payloadHdr=0x${pkt[5].toString(16).padStart(2,'0')}  frameTotal=${pkt.length}B`,
                'color: #818CF8;'
            );
        }

        // pkt includes Header(6) + Data + Checksum(1)
        // Data starts at 6
        const dataStart = 6;
        const dataEnd = pkt.length - 1; 

        // 9600 pixels (160x60)
        // Output format: Float32Array [x, y, z, c, x, y, z, c, ...]
        const GRID_WIDTH = 160;
        const GRID_HEIGHT = 60;
        const totalPixels = GRID_WIDTH * GRID_HEIGHT;
        
        // REUSE BUFFERS: Do not allocate new arrays every frame
        // Use the pre-allocated class members
        const points = this.reusablePoints;
        const distances = this.reusableDistances;

        // Clear previous data (optional but good for safety)
        // points.fill(0); 
        // distances.fill(0);

        let dataIndex = dataStart;

        // Pass 1 — unpack the 12-bit packed depth grid.
        // 2 pixels per 3 bytes (KNOWLEDGE.md §13). Projection happens in pass 2
        // so an optional spatial filter can run on the full grid first.
        const W = GRID_WIDTH;
        const H = GRID_HEIGHT;

        for (let s = 0; s < totalPixels; s += 2) {
            // Bounds check
            if (dataIndex + 2 >= dataEnd) {
                break;
            }

            const b0 = pkt[dataIndex];
            const b1 = pkt[dataIndex + 1];
            const b2 = pkt[dataIndex + 2];

            // 12-bit packed unpacking — matches manual §13 formula EXACTLY.
            // Encoding (for reference):
            //   byte0 = (A >> 4) & 0xFF
            //   byte1 = ((A & 0x0F) << 4) | ((B >> 8) & 0x0F)
            //   byte2 = B & 0xFF
            // Decoding:
            //   A = (byte0 << 4) | (byte1 >> 4)
            //   B = ((byte1 & 0x0F) << 8) | byte2
            const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
            const dist1 = ((b1 & 0x0F) << 8) | b2;

            // Dynamically map stream sequence to 2D grid index
            const idx0 = this.getGridIndex(s, W, H);
            const idx1 = this.getGridIndex(s + 1, W, H);

            distances[idx0] = dist0;
            distances[idx1] = dist1;

            dataIndex += 3;
        }

        // Optional denoise: 3x3 median filter on the depth image. The 12-bit
        // stream carries depth only (no amplitude/confidence channel), so a
        // median filter is the practical equivalent of the requested
        // amplitude/confidence thresholding — it removes lone wild spikes.
        // Only active when the "Noise Filter" UI is set away from Raw.
        if (this.depthFilterEnabled) {
            this.applyDepthMedianFilter(distances, GRID_WIDTH, GRID_HEIGHT);
        }

        // Pass 2 — project valid depths to 3D points.
        for (let i = 0; i < totalPixels; i++) {
            this.computePointDepthCamera(i, distances[i], GRID_WIDTH, GRID_HEIGHT, points);
        }

        // First-frame raw distance diagnostics (fires once, independent of frames
        // counter which is already incremented in processBuffer before parse3D).
        if (!this.first3DLogged) {
            this.first3DLogged = true;
            let min = Infinity, max = -Infinity;
            let cnt_error = 0, cnt_tooclose = 0, cnt_valid = 0;
            for (let i = 0; i < totalPixels; i++) {
                const d = distances[i];
                if (d < 50) cnt_tooclose++;
                else if (d >= 4080) cnt_error++;
                else { cnt_valid++; if (d < min) min = d; if (d > max) max = d; }
            }
            // Print 5 representative rows: top, 1/4, middle, 3/4, bottom
            const printRow = (row: number) => {
                let s = `Row ${String(row).padStart(2)}: `;
                for (let c = 0; c < 160; c += 8) {
                    const d = distances[row * GRID_WIDTH + c];
                    s += String(d).padStart(5);
                }
                return s;
            };
            console.log(
                `%c[Parser] 3D FRAME DIAGNOSTICS (Order: ${this.matrixScanOrder})\n` +
                `  valid=${cnt_valid}  error-code=${cnt_error}  too-close=${cnt_tooclose}\n` +
                `  valid range: ${min === Infinity ? '-' : min} – ${max === -Infinity ? '-' : max} mm\n` +
                `  ── Sample cols (every 8th): 0, 8, 16, ... 152 ──\n` +
                `  ${printRow(0)}\n` +
                `  ${printRow(15)}\n` +
                `  ${printRow(29)}\n` +
                `  ${printRow(44)}\n` +
                `  ${printRow(59)}`,
                'color: #818CF8; font-weight: bold;'
            );
        }

        // Per-frame stats (throttled to ~1 Hz): valid vs discarded points.
        {
            const tnow = performance.now();
            if (tnow - this.lastStatsTime > 1000) {
                this.lastStatsTime = tnow;
                let valid = 0;
                for (let i = 0; i < totalPixels; i++) {
                    const d = distances[i];
                    if (d >= 50 && d < 4080 && (!this.sentinelFilterEnabled || (d & 0xFF) !== 0xFF)) valid++;
                }
                console.log(
                    `%c[Parser] 3D stats — valid: ${valid}/${totalPixels}, ` +
                    `discarded: ${totalPixels - valid}` +
                    `${this.depthFilterEnabled ? ' (median filter ON)' : ''}`,
                    'color: #34D399;'
                );
            }
        }
        
        this.on3D(points, distances);
    }

    /**
     * Map a linear stream index (0..9599) to target (col + row * W) grid index
     * according to the selected MatrixScanOrder.
     */
    private getGridIndex(s: number, W: number, H: number): number {
        let col = 0;
        let row = 0;

        switch (this.matrixScanOrder) {
            case 'col-major':
                row = s % H;
                col = Math.floor(s / H);
                break;
            case 'col-major-flip-y':
                row = (H - 1) - (s % H);
                col = Math.floor(s / H);
                break;
            case 'full-reverse': {
                const rev = (W * H - 1) - s;
                col = rev % W;
                row = Math.floor(rev / W);
                break;
            }
            case 'flip-x':
                row = Math.floor(s / W);
                col = (W - 1) - (s % W);
                break;
            case 'flip-y':
                row = (H - 1) - Math.floor(s / W);
                col = s % W;
                break;
            case 'zigzag-horizontal':
                row = Math.floor(s / W);
                col = (row % 2 === 0) ? (s % W) : ((W - 1) - (s % W));
                break;
            case 'row-major':
            default:
                col = s % W;
                row = Math.floor(s / W);
                break;
        }

        col = Math.max(0, Math.min(W - 1, col));
        row = Math.max(0, Math.min(H - 1, row));

        return col + row * W;
    }

    public showLowAmpShadows: boolean = true;

    /**
     * Compute 3D point using the CygLiDAR D1 fisheye lens distortion tables.
     *
     * Matches the official reference implementation (firstnode.py / distort3DLens):
     *   x_world (m) = dist_mm * tablex[idx]
     *   y_world (m) = dist_mm * tabley[idx]
     *   z_world (m) = dist_mm * tablez[idx]
     *
     * @param idx   Pixel linear index  (col + row × 160), range 0-9599
     * @param dist  Raw 12-bit distance value in mm
     * @param points Output Float32Array [x, y, z, hue, ...]
     */
    private computePointDepthCamera(
        idx: number,
        dist: number,
        _gridWidth: number,
        _gridHeight: number,
        points: Float32Array
    ) {
        const MIN_RANGE      = 50;
        const MAX_RANGE      = 4079;
        const ERROR_CODE_MIN = 4080;

        let renderDist = dist;
        let isShadowRay = false;

        // 4081 = LOW_AMPLITUDE (No reflection / out of range / shadow)
        if (dist === 4081 && this.showLowAmpShadows) {
            renderDist = 3000; // Project to far depth boundary (3.0 meters)
            isShadowRay = true;
        } else {
            let isInvalid = dist === 0 || dist < MIN_RANGE || dist >= MAX_RANGE || dist >= ERROR_CODE_MIN;
            if (this.sentinelFilterEnabled && (dist & 0xFF) === 0xFF) {
                isInvalid = true;
            }

            if (isInvalid) {
                points[idx * 4    ] = 0;
                points[idx * 4 + 1] = 0;
                points[idx * 4 + 2] = 0;
                points[idx * 4 + 3] = 0;
                return;
            }
        }

        // Coordinate projection:
        // +X = Right (tablex)
        // +Y = Up (-tabley when yAxisDirection is 'up', +tabley when 'down')
        // +Z = Forward (tablez)
        const ySign = this.yAxisDirection === 'up' ? -1 : 1;
        const xSign = this.mirrorX ? -1 : 1;

        const x =  xSign * renderDist * tablex[idx];
        const y =  ySign * renderDist * tabley[idx];
        const z =  renderDist * tablez[idx];

        // Hue: If shadow ray, mark hue = -1.0, else distance gradient (Red=close, Blue=far)
        const hue = isShadowRay ? -1.0 : (1.0 - Math.min(renderDist / 3000.0, 1.0)) * 0.7;

        points[idx * 4    ] = x;
        points[idx * 4 + 1] = y;
        points[idx * 4 + 2] = z;
        points[idx * 4 + 3] = hue;
    }

    /**
     * 3×3 median filter on the depth grid (in place on `distances`).
     */
    private applyDepthMedianFilter(distances: Uint16Array, w: number, h: number) {
        const out = new Uint16Array(distances.length);
        out.set(distances);
        const isInvalid = (d: number) => d === 0 || d < 50 || d >= 4080 || (d & 0xFF) === 0xFF;

        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const idx = col + row * w;
                if (isInvalid(distances[idx])) continue;

                const vals: number[] = [];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const r = row + dr;
                        const c = col + dc;
                        if (r < 0 || r >= h || c < 0 || c >= w) continue;
                        const v = distances[c + r * w];
                        if (!isInvalid(v)) vals.push(v);
                    }
                }

                if (vals.length >= 5) {
                    vals.sort((a, b) => a - b);
                    out[idx] = vals[vals.length >> 1];
                }
            }
        }

        distances.set(out);
    }

    private parse2D(pkt: Uint8Array, payloadLen: number) {
         if (this.parserMode === 'hexstring') {
             this.parse2DHexString(pkt, payloadLen);
         } else {
             this.parse2DBitShift(pkt, payloadLen);
         }
    }
    
    private parse2DBitShift(pkt: Uint8Array, _payloadLen: number) {
         const HEADER_SIZE = 6;
         const dataBytes = pkt.length - 7; // Exclude 6 header bytes and 1 checksum byte
         const numPoints = Math.floor(dataBytes / 2);
         const points: Point2D[] = [];
         
         for (let i = 0; i < numPoints; i++) {
             const off = HEADER_SIZE + (i * 2);
             if (off + 1 >= pkt.length - 1) break;

             // 2D distance is 16-bit LITTLE ENDIAN (LSB first): LSB | (MSB << 8)
             const dist = pkt[off] | (pkt[off + 1] << 8);

             const angleDeg = -60 + (i * 0.75);
             const angleRad = angleDeg * (Math.PI / 180);

             // Filter valid 2D range: 200 to 8000 mm (< 16000 error codes)
             if (dist >= 200 && dist <= 8000) {
                 const dm = dist * 0.001;
                 const xSign = this.mirrorX ? 1 : -1;
                 const x = xSign * Math.sin(angleRad) * dm;
                 const z =  Math.cos(angleRad) * dm;
                 
                 points.push({ x, y: 0, z, color: 0x00ff00 }); 
             }
         }
         
         this.on2D(points);
    }
    
    private parse2DHexString(pkt: Uint8Array, _payloadLen: number) {
         const hexData = Array.from(pkt).map(b => b.toString(16).padStart(2, '0')).join('');
         const dataWithoutHeader = hexData.substring(12);
         const dataOnly = dataWithoutHeader.substring(0, dataWithoutHeader.length - 2);
         
         const points: Point2D[] = [];
         
         // Parse 16-bit Little Endian: LSB (chars 0..1), MSB (chars 2..3)
         for (let i = 0; i < dataOnly.length; i += 4) {
             if (i + 4 > dataOnly.length) break;
             
             const lsb = parseInt(dataOnly.substring(i, i + 2), 16);
             const msb = parseInt(dataOnly.substring(i + 2, i + 4), 16);
             const dist = lsb | (msb << 8);
             
             const pointIndex = i / 4;
             const angleDeg = -60 + (pointIndex * 0.75);
             const angleRad = angleDeg * (Math.PI / 180);
             
             if (dist >= 200 && dist <= 8000) {
                 const dm = dist / 1000.0;
                 const xSign = this.mirrorX ? 1 : -1;
                 const x = xSign * Math.sin(angleRad) * dm;
                 const z = Math.cos(angleRad) * dm;
                 points.push({ x, y: 0, z, color: 0x00ff00 });
             }
         }
         
         this.on2D(points);
    }

    /**
     * Parse INFO packet from hexstring (Phase 5)
     * Input: full packet as hexstring
     */
    private parseInfoHex(packetStr: string) {
        console.log(
            `%c[RX 🠔 Device] Response (INFO Hex, ${packetStr.length / 2} bytes): %c${packetStr.toUpperCase()}`,
            'color: #10B981; font-weight: bold;',
            'color: #34D399; font-family: monospace; font-weight: bold;'
        );
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
                const xSign = this.mirrorX ? -1 : 1;
                points.push({ 
                    x: xSign * Math.sin(angleRad) * dm,
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

            // 12-bit unpacking — matches manual §13 formula exactly.
            // A = (byte0 << 4) | (byte1 >> 4)
            // B = ((byte1 & 0x0F) << 8) | byte2
            const dist0 = (b0 << 4) | ((b1 & 0xF0) >> 4);
            const dist1 = ((b1 & 0x0F) << 8) | b2;

            const idx0 = this.getGridIndex(i, GRID_WIDTH, GRID_HEIGHT);
            const idx1 = this.getGridIndex(i + 1, GRID_WIDTH, GRID_HEIGHT);

            distances[idx0] = dist0;
            distances[idx1] = dist1;
        }

        // Pass 2: compute points
        for (let i = 0; i < totalPixels; i++) {
            this.computePointDepthCamera(i, distances[i], GRID_WIDTH, GRID_HEIGHT, points);
            if (distances[i] >= 50 && distances[i] < 4080 && (!this.sentinelFilterEnabled || (distances[i] & 0xFF) !== 0xFF)) {
                validCount++;
            }
        }

        console.log(`[Parser] 3D Hex Mode: ${validCount}/${totalPixels} valid points`);
        this.on3D(points, distances);
    }

    private parseInfo(pkt: Uint8Array) {
        const hex = Array.from(pkt).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        console.log(
            `%c[RX 🠔 Device] Response (INFO, ${pkt.length} bytes): %c${hex}`,
            'color: #10B981; font-weight: bold;',
            'color: #34D399; font-family: monospace; font-weight: bold;'
        );
        // Response format: 5A 77 FF 07 00 10 F/W1 F/W2 F/W3 H/W1 H/W2 H/W3 CS
        // Bytes 6-8: Firmware version
        // Bytes 9-11: Hardware version
        const ver = `${pkt[6]}.${pkt[7]}.${pkt[8]}`;
        const hw = `${pkt[9]}.${pkt[10]}.${pkt[11]}`;
        this.onInfo({ ver, hw });
        console.log(`[Parser] Device Info: FW=${ver}, HW=${hw}`);
    }
}

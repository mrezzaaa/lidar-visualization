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

    pushData(data: Uint8Array) {
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
                 // console.warn(`CS Fail (H2H). Type: ${firstHeaderType} Len: ${len}`);
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

    private computePoint(idx: number, dist: number, points: Float32Array) {
        if (dist >= 4080) { // Invalid / Low Intensity
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
         console.log("[Parser] 2D BitShift - Points:", points.length);
    }
    
    private parse2DHexString(pkt: Uint8Array, payloadLen: number) {
         // 16-bit parsing per user manual spec
         // Data Type: 16 bit (2 bytes per distance)
         // Error codes: 16000-16004
         
         // Convert packet to hex string
         const hexData = Array.from(pkt).map(b => b.toString(16).padStart(2, '0')).join('');
         
         console.log(`[Parser HexString] Packet hex (first 40): ${hexData.substring(0, 40)}...`);
         
         // Remove header "5a77ff430101" (12 hex chars = 6 bytes)
         const dataWithoutHeader = hexData.substring(12);
         
         // Remove checksum (last 2 hex chars)
         const dataOnly = dataWithoutHeader.substring(0, dataWithoutHeader.length - 2);
         
         console.log(`[Parser HexString] Data length: ${dataOnly.length} hex chars, Expected: ${160 * 4} for 160 points`);
         
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
         console.log(`[Parser] 2D HexString - Valid points: ${points.length} / ${Math.floor(dataOnly.length / 4)} total`);
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

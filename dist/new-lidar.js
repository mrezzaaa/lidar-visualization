"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSerialPorts = exports.CygLidarD1 = void 0;
const serialport_1 = require("serialport");
const events_1 = require("events");
// ==================== Protocol Constants ====================
const PROTOCOL = {
    // Header bytes
    NORMAL_MODE: 0x5A,
    PRODUCT_CODE: 0x77,
    DEFAULT_ID: 0xFF,
    // Commands
    DEVICE_INFO: 0x10,
    SEND_DEPTH_2D: 0x01,
    SEND_DEPTH_3D: 0x08,
    SEND_STOP: 0x02,
    INTEGRATION_TIME: 0x0C,
    FREQUENCY_CHANNEL: 0x0F,
    SET_BAUDRATE: 0x12,
    COMMAND_DATA: 0x00,
    // Payload headers
    PACKET_HEADER_2D: 0x01,
    PACKET_HEADER_3D: 0x08,
    PACKET_HEADER_DEVICE_INFO: 0x10,
    // 2D Error codes
    INVALID_DATA_2D: 16000,
    LOW_AMPLITUDE_2D: 16001,
    ADC_OVERFLOW_2D: 16002,
    SATURATION_2D: 16003,
    BAD_PIXEL_2D: 16004,
    // 3D Error codes
    INVALID_DATA_3D: 4080,
    LOW_AMPLITUDE_3D: 4081,
    ADC_OVERFLOW_3D: 4082,
    SATURATION_3D: 4083,
    BAD_PIXEL_3D: 4084,
    // Data dimensions
    IMAGE_WIDTH: 160,
    IMAGE_HEIGHT: 60,
    ANGLE_INCREMENT_2D: 0.75,
    HORIZONTAL_ANGLE: 120.0,
};
const BAUDRATES = {
    0: 3000000,
    1: 921600,
    2: 115200,
    3: 57600,
};
// ==================== Main Class ====================
class CygLidarD1 extends events_1.EventEmitter {
    constructor() {
        super();
        this.port = null;
        this.serialData = ''; // String-based like lidar.ts!
        this.isConnected = false;
        this.currentBaudrate = 115200;
        this.currentPort = '';
        this.skipStopOnDisconnect = false;
    }
    // ==================== Connection Management ====================
    async connect(portPath, baudrate = 115200) {
        try {
            if (this.isConnected) {
                throw new Error('Already connected. Disconnect first.');
            }
            this.currentPort = portPath;
            this.currentBaudrate = baudrate;
            this.port = new serialport_1.SerialPort({
                path: "/dev/cu.usbserial-A5069RR4",
                baudRate: baudrate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                // Optimize for high-speed (3M baud) reception on macOS
                highWaterMark: 1048576, // 1MB buffer instead of default 64KB
            });
            return new Promise((resolve, reject) => {
                this.port.on('open', () => {
                    console.log(`Connected to ${portPath} at ${baudrate} baud`);
                    this.isConnected = true;
                    this.emit('connected', { port: portPath, baudrate });
                    resolve(true);
                });
                this.port.on('error', (err) => {
                    console.error('Serial port error:', err);
                    this.emit('error', err);
                    reject(err);
                });
                this.port.on('data', (data) => {
                    this.handleIncomingData(data);
                });
                this.port.on('close', () => {
                    console.log('Serial port closed');
                    this.isConnected = false;
                    this.emit('disconnected');
                });
            });
        }
        catch (error) {
            console.error('Failed to connect:', error);
            this.emit('error', error);
            return false;
        }
    }
    async disconnect() {
        if (!this.isConnected || !this.port) {
            return;
        }
        // Stop scanning first (unless we're changing baudrate)
        if (!this.skipStopOnDisconnect) {
            await this.stopScan();
        }
        this.skipStopOnDisconnect = false;
        return new Promise((resolve) => {
            this.port.close((err) => {
                if (err) {
                    console.error('Error closing port:', err);
                }
                this.port = null;
                this.isConnected = false;
                this.serialData = ''; // Clear string data
                resolve();
            });
        });
    }
    // ==================== Baudrate Management ====================
    async setBaudrate(mode) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        if (!(mode in BAUDRATES)) {
            throw new Error('Invalid baudrate mode. Use 0 (3M), 1 (921.6k), 2 (115.2k), or 3 (57.6k)');
        }
        const newBaudrate = BAUDRATES[mode];
        try {
            // Send baudrate change command
            console.log(`[CMD] Set Baudrate - Mode: ${mode}, New Baudrate: ${newBaudrate}`);
            await this.sendCommand([PROTOCOL.SET_BAUDRATE, mode]);
            // Wait for the sensor to process the command and switch baudrate
            // The sensor needs time to change its baudrate
            console.log('Waiting for sensor to change baudrate...');
            await this.delay(500);
            // Disconnect current connection without sending stop command
            const currentPort = this.currentPort;
            this.skipStopOnDisconnect = true;
            await this.disconnect();
            // Wait before reconnecting
            await this.delay(300);
            // Reconnect with new baudrate
            console.log(`Reconnecting at ${newBaudrate} baud...`);
            const success = await this.connect(currentPort, newBaudrate);
            if (success) {
                console.log(`Baudrate changed to ${newBaudrate}`);
                this.emit('baudrateChanged', newBaudrate);
            }
            return success;
        }
        catch (error) {
            console.error('Failed to change baudrate:', error);
            this.emit('error', error);
            return false;
        }
    }
    // ==================== Device Information ====================
    async getDeviceInfo() {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        console.log('[CMD] Get Device Info');
        await this.sendCommand([PROTOCOL.DEVICE_INFO, PROTOCOL.COMMAND_DATA]);
    }
    // ==================== Scan Control ====================
    async startScan(mode) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        const command = mode === '2D' ? PROTOCOL.SEND_DEPTH_2D : PROTOCOL.SEND_DEPTH_3D;
        console.log(`[CMD] Start ${mode} Scan - Command: 0x${command.toString(16).padStart(2, '0')}`);
        await this.sendCommand([command, PROTOCOL.COMMAND_DATA]);
        console.log(`Started ${mode} scanning`);
    }
    async stopScan() {
        if (!this.isConnected) {
            return;
        }
        console.log('[CMD] Stop Scan');
        await this.sendCommand([PROTOCOL.SEND_STOP, PROTOCOL.COMMAND_DATA]);
        console.log('Stopped scanning');
    }
    // ==================== Configuration ====================
    async setFrequency(channel) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        if (channel < 0 || channel > 15) {
            throw new Error('Frequency channel must be between 0 and 15');
        }
        console.log(`[CMD] Set Frequency - Channel: ${channel} (0x${channel.toString(16).padStart(2, '0')})`);
        await this.sendCommand([PROTOCOL.FREQUENCY_CHANNEL, channel]);
        console.log(`Set frequency channel to ${channel}`);
    }
    async setIntegrationTime(value, mode = 'auto') {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        if (value < 0 || value > 10000) {
            throw new Error('Integration time must be between 0 and 10000 us');
        }
        let MSB = (value & 0xFF00) >> 8;
        const LSB = value & 0x00FF;
        // Set bit 6 if manual mode
        if (mode === 'manual') {
            MSB |= (1 << 6);
        }
        console.log(`[CMD] Set Integration Time - Value: ${value}us, Mode: ${mode}, LSB: 0x${LSB.toString(16).padStart(2, '0')}, MSB: 0x${MSB.toString(16).padStart(2, '0')}`);
        await this.sendCommand([PROTOCOL.INTEGRATION_TIME, LSB, MSB]);
        console.log(`Set integration time to ${value} us (${mode} mode)`);
    }
    // ==================== Command Builder ====================
    async sendCommand(payload) {
        if (!this.port || !this.isConnected) {
            throw new Error('Not connected');
        }
        const command = [
            PROTOCOL.NORMAL_MODE,
            PROTOCOL.PRODUCT_CODE,
            PROTOCOL.DEFAULT_ID,
            payload.length & 0xFF,
            0x00, // LENGTH_MSB (always 0 for short commands)
        ];
        // Add payload
        command.push(...payload);
        // Calculate checksum (XOR from LENGTH_LSB to end of payload)
        let checksum = 0;
        for (let i = 3; i < command.length; i++) {
            checksum ^= command[i];
        }
        command.push(checksum);
        const buffer = Buffer.from(command);
        return new Promise((resolve, reject) => {
            this.port.write(buffer, (err) => {
                if (err) {
                    console.error('Error sending command:', err);
                    reject(err);
                }
                else {
                    console.log('[SENT]', buffer.toString('hex').toUpperCase(), '|', buffer);
                    resolve();
                }
            });
        });
    }
    // ==================== Data Reception & Parsing ====================
    handleIncomingData(data) {
        // String-based approach from lidar.ts (STABLE!)
        this.serialData += data.toString('hex');
        console.log('[RX] Received', data.length, 'bytes, serialData length:', this.serialData.length / 2, 'bytes');
        // Process using string detection (lidar.ts line 60-68)
        this.processSerialData();
    }
    processSerialData() {
        const SCAN_2D_HEADER = '5a77ff430101'; // From config.ts LidarResponse.scan2D
        const EXPECTED_2D_LENGTH = 160 * 4 + 18; // 658 hex chars (lidar.ts line 64)
        // Check for 2D scan data
        if (this.serialData.includes(SCAN_2D_HEADER) && this.serialData.length >= EXPECTED_2D_LENGTH) {
            console.log('[PARSE] 2D data detected');
            this.handle2DData();
        }
        // Could add 3D and device info checks here
    }
    handle2DData() {
        // Header for 161 points (Payload size 323 = 0x0143)
        // 5A 77 FF (Head) + 43 01 (Len LE) + 01 (Type) -> 5a77ff430101
        const HEADER_2D = '5a77ff430101';
        const POINTS_COUNT = 161;
        // Packet: 3(Head)+2(Len)+1(Type)+322(Data)+1(CS) = 329 bytes
        const TOTAL_BYTES = 329;
        const HEX_LEN = TOTAL_BYTES * 2;
        const headerPos = this.serialData.indexOf(HEADER_2D);
        // 1. Buffer Maintenance: If no header found and buffer grows too large, clear it
        if (headerPos === -1) {
            if (this.serialData.length > HEX_LEN * 2) {
                // Buffer growing with garbage? Clear it to prevent memory leak
                this.serialData = '';
            }
            return;
        }
        // 2. Align Buffer: Remove data before header
        if (headerPos > 0) {
            this.serialData = this.serialData.substring(headerPos);
        }
        // 3. Wait for Full Packet
        if (this.serialData.length < HEX_LEN) {
            return;
        }
        // 4. Extract Packet
        const packetHex = this.serialData.substring(0, HEX_LEN);
        const buffer = Buffer.from(packetHex, 'hex');
        // 5. Verify Checksum (Start from Index 3 to End-1)
        let calcCS = 0;
        for (let i = 3; i < TOTAL_BYTES - 1; i++) {
            calcCS ^= buffer[i];
        }
        const recvCS = buffer[TOTAL_BYTES - 1];
        if (calcCS !== recvCS) {
            console.warn(`[2D] Checksum mismatch: Calc ${calcCS.toString(16)} != Recv ${recvCS.toString(16)}`);
            // We warn but allow processing to maintain data flow (Soft Validation)
        }
        // 6. Process 161 Points
        const points = [];
        const HFOV = 120.0;
        const STEP = 0.75;
        for (let i = 0; i < POINTS_COUNT; i++) {
            const offset = 6 + (i * 2);
            // EMPIRICAL EVIDENCE: Big Endian works!
            // Log Data: '07 4e' -> BE: 1870mm (Valid Wall) | LE: 19975 (Error)
            const msb = buffer[offset];
            const lsb = buffer[offset + 1];
            const distance = (msb << 8) | lsb;
            const angle = (-HFOV / 2) + (i * STEP);
            if (distance >= 16000 || distance > 10000) {
                points.push({ angle, distance: 0, intensity: 0 });
            }
            else {
                points.push({ angle, distance, intensity: 0 });
            }
        }
        // console.log(`[2D] Scanned ${points.filter(p=>p.distance>0).length}/${POINTS_COUNT} valid points.`);
        this.emit('2dData', points);
        // 7. Advance Buffer
        this.serialData = this.serialData.substring(HEX_LEN);
    }
    // ==================== Packet Processing ====================
    processPacket(packet) {
        const payloadHeader = packet[5];
        switch (payloadHeader) {
            case PROTOCOL.PACKET_HEADER_DEVICE_INFO:
                this.processDeviceInfo(packet);
                break;
            case PROTOCOL.PACKET_HEADER_2D:
                this.process2DData(packet);
                break;
            case PROTOCOL.PACKET_HEADER_3D:
                this.process3DData(packet);
                break;
            default:
                console.warn('[PARSE] Unknown payload header: 0x' + payloadHeader.toString(16));
        }
    }
    processDeviceInfo(packet) {
        // Device info format: [header(6)] [0x10] [HW_VER(2)] [FW_VER(2)] [SERIAL(4)] [checksum]
        // Total: 6 + 1 + 2 + 2 + 4 = 15 bytes + checksum
        const hwMajor = packet[7];
        const hwMinor = packet[8];
        const fwMajor = packet[9];
        const fwMinor = packet[10];
        const serial = Buffer.from([packet[11], packet[12], packet[13], packet[14]]);
        const deviceInfo = {
            hwVersion: `${hwMajor}.${hwMinor}`,
            fwVersion: `${fwMajor}.${fwMinor}`,
            serialNumber: serial.toString('hex').toUpperCase(),
        };
        console.log('Device Info:', deviceInfo);
        this.emit('deviceInfo', deviceInfo);
    }
    process2DData(packet) {
        const points = [];
        const numPoints = PROTOCOL.IMAGE_WIDTH; // 160
        const startAngle = -60; // -60 degrees
        // 2D data format: 3 bytes per point (FROM lidar-scanner.ts line 84-101)
        // Each point: [distance_LSB, distance_MSB, intensity]
        // Payload: 6 (header) + 480 (160 points * 3 bytes) + checksum
        for (let i = 0; i < numPoints; i++) {
            const offset = 6 + (i * 3); // 3 bytes per point!
            if (offset + 2 >= packet.length)
                break;
            // Read as Little Endian uint16 (lidar-scanner.ts line 86)
            const distance = packet.readUInt16LE(offset);
            const intensity = packet[offset + 2];
            // Skip error codes (lidar-scanner.ts line 92-95)
            if (distance >= 16000 && distance <= 16004) {
                continue;
            }
            const angle = startAngle + (i * PROTOCOL.ANGLE_INCREMENT_2D);
            points.push({
                angle,
                distance,
                intensity,
            });
        }
        console.log('[2D] Processed', points.length, 'valid points out of', numPoints);
        if (points.length > 0) {
            this.emit('2dData', points);
        }
        else {
            console.warn('[2D] No valid points in this frame');
        }
    }
    process3DData(packet) {
        const points = [];
        const width = PROTOCOL.IMAGE_WIDTH; // 160
        const height = PROTOCOL.IMAGE_HEIGHT; // 60
        // 3D data uses 12-bit packing: 3 bytes for 2 pixels
        // Format: [AAAA AAAA] [AAAA BBBB] [BBBB BBBB]
        //         [byte0    ] [byte1    ] [byte2    ]
        //         A = first pixel (12 bits), B = second pixel (12 bits)
        let pixelIndex = 0;
        let offset = 6; // Skip header
        while (pixelIndex < width * height && offset + 2 < packet.length) {
            const byte0 = packet[offset];
            const byte1 = packet[offset + 1];
            const byte2 = packet[offset + 2];
            // First pixel (12 bits)
            const distance1 = (byte0 << 4) | (byte1 >> 4);
            const x1 = pixelIndex % width;
            const y1 = Math.floor(pixelIndex / width);
            if (distance1 < PROTOCOL.INVALID_DATA_3D) {
                points.push({ x: x1, y: y1, distance: distance1 });
            }
            pixelIndex++;
            // Second pixel (12 bits)
            if (pixelIndex < width * height) {
                const distance2 = ((byte1 & 0x0F) << 8) | byte2;
                const x2 = pixelIndex % width;
                const y2 = Math.floor(pixelIndex / width);
                if (distance2 < PROTOCOL.INVALID_DATA_3D) {
                    points.push({ x: x2, y: y2, distance: distance2 });
                }
                pixelIndex++;
            }
            offset += 3;
        }
        if (points.length > 0) {
            this.emit('3dData', points);
        }
    }
    // ==================== Utility ====================
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isConnectedToDevice() {
        return this.isConnected;
    }
    getCurrentBaudrate() {
        return this.currentBaudrate;
    }
    getCurrentPort() {
        return this.currentPort;
    }
}
exports.CygLidarD1 = CygLidarD1;
// ==================== Port Listing Utility ====================
async function listSerialPorts() {
    const { SerialPort } = await Promise.resolve().then(() => __importStar(require('serialport')));
    const ports = await SerialPort.list();
    return ports.map(port => port.path);
}
exports.listSerialPorts = listSerialPorts;

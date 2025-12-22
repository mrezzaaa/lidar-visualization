import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

// ==================== Data Structures ====================

export interface DeviceInfo {
  hwVersion: string;
  fwVersion: string;
  serialNumber: string;
}

export interface LidarPoint2D {
  angle: number;      // degrees
  distance: number;   // mm
  intensity: number;  // 0-255
}

export interface LidarPoint3D {
  x: number;          // pixel column (0-159)
  y: number;          // pixel row (0-59)
  distance: number;   // mm
}

export type ScanMode = '2D' | '3D';
export type PulseMode = 'auto' | 'manual';

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

const BAUDRATES: { [key: number]: number } = {
  0: 3000000,
  1: 921600,
  2: 115200,
  3: 57600,
};

// ==================== Main Class ====================

export class CygLidarD1 extends EventEmitter {
  private port: SerialPort | null = null;
  private dataBuffer: Buffer = Buffer.alloc(0);
  private isConnected: boolean = false;
  private currentBaudrate: number = 115200;
  private currentPort: string = '';
  private skipStopOnDisconnect: boolean = false;

  // Packet parsing state
  private parsingState: 'HEADER1' | 'HEADER2' | 'HEADER3' | 'LENGTH_LSB' | 'LENGTH_MSB' | 'PAYLOAD_HEADER' | 'PAYLOAD_DATA' | 'CHECKSUM' = 'HEADER1';
  private packetBuffer: Buffer = Buffer.alloc(20000);
  private payloadSize: number = 0;
  private payloadCount: number = 0;

  constructor() {
    super();
  }

  // ==================== Connection Management ====================

  public async connect(portPath: string, baudrate: number = 115200): Promise<boolean> {
    try {
      if (this.isConnected) {
        throw new Error('Already connected. Disconnect first.');
      }

      this.currentPort = portPath;
      this.currentBaudrate = baudrate;

      this.port = new SerialPort({
        path: "/dev/cu.usbserial-A5069RR4", //portPath,
        baudRate: baudrate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        // Optimize for high-speed (3M baud) reception on macOS
        highWaterMark: 1048576,  // 1MB buffer instead of default 64KB
      });

      return new Promise((resolve, reject) => {
        this.port!.on('open', () => {
          console.log(`Connected to ${portPath} at ${baudrate} baud`);
          this.isConnected = true;
          this.emit('connected', { port: portPath, baudrate });
          resolve(true);
        });

        this.port!.on('error', (err) => {
          console.error('Serial port error:', err);
          this.emit('error', err);
          reject(err);
        });

        this.port!.on('data', (data: Buffer) => {
          this.handleIncomingData(data);
        });

        this.port!.on('close', () => {
          console.log('Serial port closed');
          this.isConnected = false;
          this.emit('disconnected');
        });
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      this.emit('error', error);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected || !this.port) {
      return;
    }

    // Stop scanning first (unless we're changing baudrate)
    if (!this.skipStopOnDisconnect) {
      await this.stopScan();
    }
    this.skipStopOnDisconnect = false;

    return new Promise((resolve) => {
      this.port!.close((err) => {
        if (err) {
          console.error('Error closing port:', err);
        }
        this.port = null;
        this.isConnected = false;
        this.dataBuffer = Buffer.alloc(0);
        this.resetParser();
        resolve();
      });
    });
  }

  // ==================== Baudrate Management ====================

  public async setBaudrate(mode: number): Promise<boolean> {
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
    } catch (error) {
      console.error('Failed to change baudrate:', error);
      this.emit('error', error);
      return false;
    }
  }

  // ==================== Device Information ====================

  public async getDeviceInfo(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }

    console.log('[CMD] Get Device Info');
    await this.sendCommand([PROTOCOL.DEVICE_INFO, PROTOCOL.COMMAND_DATA]);
  }

  // ==================== Scan Control ====================

  public async startScan(mode: ScanMode): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }

    const command = mode === '2D' ? PROTOCOL.SEND_DEPTH_2D : PROTOCOL.SEND_DEPTH_3D;
    console.log(`[CMD] Start ${mode} Scan - Command: 0x${command.toString(16).padStart(2, '0')}`);
    await this.sendCommand([command, PROTOCOL.COMMAND_DATA]);
    console.log(`Started ${mode} scanning`);
  }

  public async stopScan(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    console.log('[CMD] Stop Scan');
    await this.sendCommand([PROTOCOL.SEND_STOP, PROTOCOL.COMMAND_DATA]);
    console.log('Stopped scanning');
  }

  // ==================== Configuration ====================

  public async setFrequency(channel: number): Promise<void> {
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

  public async setIntegrationTime(value: number, mode: PulseMode = 'auto'): Promise<void> {
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

  private async sendCommand(payload: number[]): Promise<void> {
    if (!this.port || !this.isConnected) {
      throw new Error('Not connected');
    }

    const command: number[] = [
      PROTOCOL.NORMAL_MODE,
      PROTOCOL.PRODUCT_CODE,
      PROTOCOL.DEFAULT_ID,
      payload.length & 0xFF,  // LENGTH_LSB
      0x00,                    // LENGTH_MSB (always 0 for short commands)
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
      this.port!.write(buffer, (err) => {
        if (err) {
          console.error('Error sending command:', err);
          reject(err);
        } else {
          console.log('[SENT]', buffer.toString('hex').toUpperCase(), '|', buffer);
          resolve();
        }
      });
    });
  }

  // ==================== Data Reception & Parsing ====================

  private handleIncomingData(data: Buffer): void {
    // Add to buffer
    this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
    console.log('[RX] Received', data.length, 'bytes, buffer size:', this.dataBuffer.length);

    // Parse packets
    while (this.dataBuffer.length > 0) {
      const result = this.parseNextByte();
      if (!result) {
        break; // Need more data
      }
    }
  }

  private parseNextByte(): boolean {
    if (this.dataBuffer.length === 0) {
      return false;
    }

    const byte = this.dataBuffer[0];
    this.dataBuffer = this.dataBuffer.slice(1);

    switch (this.parsingState) {
      case 'HEADER1':
        if (byte === PROTOCOL.NORMAL_MODE) {
          this.packetBuffer[0] = byte;
          this.parsingState = 'HEADER2';
          console.log('[PARSE] Header1 found: 0x5A');
        }
        break;

      case 'HEADER2':
        if (byte === PROTOCOL.PRODUCT_CODE) {
          this.packetBuffer[1] = byte;
          this.parsingState = 'HEADER3';
          console.log('[PARSE] Header2 found: 0x77');
        } else {
          console.log('[PARSE] Expected 0x77, got', byte.toString(16));
          this.resetParser();
          if (byte === PROTOCOL.NORMAL_MODE) {
            this.packetBuffer[0] = byte;
            this.parsingState = 'HEADER2';
          }
        }
        break;

      case 'HEADER3':
        this.packetBuffer[2] = byte; // ID
        this.parsingState = 'LENGTH_LSB';
        break;

      case 'LENGTH_LSB':
        this.packetBuffer[3] = byte;
        this.parsingState = 'LENGTH_MSB';
        break;

      case 'LENGTH_MSB':
        this.packetBuffer[4] = byte;
        this.payloadSize = ((byte << 8) & 0xFF00) | (this.packetBuffer[3] & 0x00FF);
        this.payloadCount = 0;
        this.parsingState = 'PAYLOAD_HEADER';
        console.log('[PARSE] Payload size:', this.payloadSize, 'bytes');
        break;

      case 'PAYLOAD_HEADER':
        this.packetBuffer[5] = byte;
        this.payloadCount = 1;
        this.parsingState = 'PAYLOAD_DATA';
        console.log('[PARSE] Payload header: 0x' + byte.toString(16).padStart(2, '0'));
        break;

      case 'PAYLOAD_DATA':
        this.packetBuffer[5 + this.payloadCount] = byte;
        this.payloadCount++;

        if (this.payloadCount >= this.payloadSize) {
          this.parsingState = 'CHECKSUM';
        }
        break;

      case 'CHECKSUM':
        // Verify checksum
        let calculatedChecksum = 0;
        for (let i = 3; i < 6 + this.payloadSize; i++) {
          calculatedChecksum ^= this.packetBuffer[i];
        }

        if (calculatedChecksum === byte) {
          // Valid packet - process it
          console.log('[PARSE] ✓ Checksum OK, total packet size:', 6 + this.payloadSize, 'bytes');
          this.processPacket(this.packetBuffer.slice(0, 6 + this.payloadSize));
        } else {
          console.error('[PARSE] ✗ Checksum mismatch!', 'Expected:', calculatedChecksum, 'Got:', byte);
        }

        this.resetParser();
        break;
    }

    return true;
  }

  private resetParser(): void {
    this.parsingState = 'HEADER1';
    this.payloadCount = 0;
    this.payloadSize = 0;
  }

  // ==================== Packet Processing ====================

  private processPacket(packet: Buffer): void {
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

  private processDeviceInfo(packet: Buffer): void {
    // Device info format: [header(6)] [0x10] [HW_VER(2)] [FW_VER(2)] [SERIAL(4)] [checksum]
    // Total: 6 + 1 + 2 + 2 + 4 = 15 bytes + checksum
    
    const hwMajor = packet[7];
    const hwMinor = packet[8];
    const fwMajor = packet[9];
    const fwMinor = packet[10];
    
    const serial = Buffer.from([packet[11], packet[12], packet[13], packet[14]]);

    const deviceInfo: DeviceInfo = {
      hwVersion: `${hwMajor}.${hwMinor}`,
      fwVersion: `${fwMajor}.${fwMinor}`,
      serialNumber: serial.toString('hex').toUpperCase(),
    };

    console.log('Device Info:', deviceInfo);
    this.emit('deviceInfo', deviceInfo);
  }

  private process2DData(packet: Buffer): void {
    const points: LidarPoint2D[] = [];
    const numPoints = PROTOCOL.IMAGE_WIDTH; // 160
    const startAngle = -60; // -60 degrees

    // Data starts at byte 6, format: [distance_LSB, distance_MSB, intensity] per point
    for (let i = 0; i < numPoints; i++) {
      const offset = 6 + (i * 3);
      if (offset + 2 >= packet.length) break;

      const distanceLSB = packet[offset];
      const distanceMSB = packet[offset + 1];
      const distance = (distanceMSB << 8) | distanceLSB;
      const intensity = packet[offset + 2];

      // Skip error codes
      if (distance >= PROTOCOL.INVALID_DATA_2D) {
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
    } else {
      console.warn('[2D] No valid points in this frame');
    }
  }

  private process3DData(packet: Buffer): void {
    const points: LidarPoint3D[] = [];
    const width = PROTOCOL.IMAGE_WIDTH;  // 160
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public isConnectedToDevice(): boolean {
    return this.isConnected;
  }

  public getCurrentBaudrate(): number {
    return this.currentBaudrate;
  }

  public getCurrentPort(): string {
    return this.currentPort;
  }
}

// ==================== Port Listing Utility ====================

export async function listSerialPorts(): Promise<string[]> {
  const { SerialPort } = await import('serialport');
  const ports = await SerialPort.list();
  return ports.map(port => port.path);
}

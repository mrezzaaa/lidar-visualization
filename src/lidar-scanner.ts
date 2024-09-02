import { SerialPort } from 'serialport';

export interface LidarPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

export type ScanMode = '2D' | '3D';

export class LidarScanner {
  private port: SerialPort;
  private dataBuffer: Buffer = Buffer.alloc(0);
  private dataCallback: ((data: LidarPoint[], mode: ScanMode) => void) | null = null;
  private mode: ScanMode = '3D';
  private isScanning: boolean = false;
  private readonly MAX_BUFFER_SIZE = 160 * 60 * 3; // Maximum buffer size for a full 3D frame

  constructor(portPath: string) {
    this.port = new SerialPort({ path: portPath, baudRate: 115200 });
    
    this.port.on('open', () => console.log('Serial port opened'));
    this.port.on('error', (err) => console.error('Serial port error:', err));

    this.port.on('data', (data: Buffer) => {
      console.log('Received data from serial port:', data.toString('hex'));
      this.accumulateData(data);
    });
  }

  private accumulateData(data: Buffer): void {
    this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
    console.log('Accumulated data buffer length:', this.dataBuffer.length);

    while (this.dataBuffer.length >= 6) {
      const headerIndex = this.dataBuffer.indexOf(Buffer.from([0x5A, 0x77, 0xFF]));

      if (headerIndex === -1) {
        console.warn('Header not found, clearing buffer');
        this.dataBuffer = Buffer.alloc(0);
        return;
      }

      if (headerIndex > 0) {
        console.log('Non-header data found, discarding data before header');
        this.dataBuffer = this.dataBuffer.slice(headerIndex);
      }

      if (this.dataBuffer.length < 6) {
        console.log('Insufficient data for processing, waiting for more data');
        return;
      }

      const header = this.dataBuffer.slice(0, 6).toString('hex');
      console.log('Detected frame header:', header);

      if (header === "5a77ff413808") {
        // 3D data
        if (this.dataBuffer.length >= this.MAX_BUFFER_SIZE) {
          console.log('Processing 3D frame');
          const frame = this.dataBuffer.slice(0, this.MAX_BUFFER_SIZE);
          this.process3DData(frame);
          this.dataBuffer = this.dataBuffer.slice(this.MAX_BUFFER_SIZE);
        } else {
          console.log('Incomplete 3D frame, waiting for more data');
          return;
        }
      } else if (header === "5a77fff30001") {
        // 2D data
        const frameSize = 1000; // Adjust if necessary
        if (this.dataBuffer.length >= frameSize) {
          console.log('Processing 2D frame');
          const frame = this.dataBuffer.slice(0, frameSize);
          this.process2DData(frame);
          this.dataBuffer = this.dataBuffer.slice(frameSize);
        } else {
          console.log('Incomplete 2D frame, waiting for more data');
          return;
        }
      } else {
        console.warn('Unexpected header, discarding one byte and retrying');
        this.dataBuffer = this.dataBuffer.slice(1);
      }
    }
  }

  private process2DData(frame: Buffer): void {
    console.log("Processing 2D data frame of length", frame.length);
    const points: LidarPoint[] = [];
    for (let i = 6; i < frame.length - 2; i += 3) {
      const distance = frame.readUInt16LE(i);
      const intensity = frame[i + 2];
      const angle = (i - 6) / 3 * (2 * Math.PI / 360);
      points.push({
        x: distance * Math.cos(angle),
        y: distance * Math.sin(angle),
        z: 0,
        intensity
      });
    }
    console.log('Processed', points.length, '2D points');
    if (this.dataCallback) {
      this.dataCallback(points, '2D');
    }
  }

  private process3DData(frame: Buffer): void {
    console.log("Processing 3D data frame of length", frame.length);
    const points: LidarPoint[] = [];
    for (let i = 6; i < frame.length - 2; i += 3) {
      const distance = frame.readUInt16LE(i);
      const intensity = frame[i + 2];
      const horizontalAngle = ((i - 6) / 3) % 160 * (2 * Math.PI / 160);
      const verticalAngle = Math.floor((i - 6) / (3 * 160)) * (Math.PI / 60);
      points.push({
        x: distance * Math.cos(verticalAngle) * Math.cos(horizontalAngle),
        y: distance * Math.cos(verticalAngle) * Math.sin(horizontalAngle),
        z: distance * Math.sin(verticalAngle),
        intensity
      });
    }
    console.log('Processed', points.length, '3D points');
    if (this.dataCallback) {
      this.dataCallback(points, '3D');
    }
  }

  public initialize(mode: ScanMode = '3D'): void {
    this.mode = mode;
    const command = this.getCommand(mode);
    console.log(`Sending ${mode} mode command to serial port:`, command.toString('hex'));
    this.port.write(command, (err) => {
      if (err) console.error('Error sending command:', err);
      else {
        console.log(`${mode} mode initialized`);
        this.isScanning = true;
      }
    });
  }

  private getCommand(mode: ScanMode): Buffer {
    switch (mode) {
      case '2D':
        return Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x01, 0x00, 0x03]);
      case '3D':
        return Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x08, 0x00, 0x0A]);
      default:
        throw new Error('Invalid mode');
    }
  }

  public onData(callback: (data: LidarPoint[], mode: ScanMode) => void): void {
    this.dataCallback = callback;
  }

  public stopScan(): void {
    this.isScanning = false;
    const stopCommand = Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x02, 0x00, 0x00]);
    console.log('Sending stop command to serial port:', stopCommand.toString('hex'));
    this.port.write(stopCommand, (err) => {
      if (err) console.error('Error sending stop command:', err);
      else console.log('Stop command sent successfully');
    });
  }

  public shutdown(): void {
    this.stopScan();
    this.dataCallback = null;
    this.port.close((err) => {
      if (err) console.error('Error closing port:', err);
      else console.log('Port closed successfully');
    });
  }
}

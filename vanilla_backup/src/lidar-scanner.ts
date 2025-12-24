import { SerialPort } from 'serialport';

export interface LidarPoint {
  angle: number;
  distance: number;
  intensity: number;
}

export type ScanMode = '2D' | '3D';

export class LidarScanner {
  private port: SerialPort;
  private dataBuffer: Buffer = Buffer.alloc(0);
  private dataCallback: ((data: LidarPoint[], mode: ScanMode) => void) | null = null;
  private mode: ScanMode = '2D';
  private isScanning: boolean = false;

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
    // console.log('Accumulated data buffer length:', this.dataBuffer.length);
    console.log("Data buffer",this.dataBuffer.toString('hex'));
    while (this.dataBuffer.length >= 6) {
      const headerIndex = this.dataBuffer.indexOf(Buffer.from([0x5A, 0x77]));

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
    //   console.log('Detected frame header:', header);

      if (header.startsWith('5a77ff430101')) {
        // 2D data
        console.log("Parsing data")

        const frameSize = 640; // 6 (header) + 2 * 160 (data points) * 3 (bytes per point) + 2 (checksum)
        if (this.dataBuffer.length > 160 * 4) {
          console.log('Processing 2D frame');
          const frame = this.dataBuffer.slice(0, frameSize);
          this.process2DData(frame);
          this.dataBuffer = this.dataBuffer.slice(frameSize);
        } else {
        //   console.log('Incomplete 2D frame, waiting for more data');
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
    const numPoints = 160; // As per the specifications
    const startAngle = -60; // Starting angle in degrees
    const angleStep = 0.75; // Angle resolution in degrees

    for (let i = 0; i < numPoints; i++) {
      const offset = 6 + i * 3; // 6 bytes header, 3 bytes per point
      const distance = frame.readUInt16LE(offset) ;
      console.log("Distance at "+i+" is "+distance)
      const intensity = frame[offset + 2];
      const angle = startAngle + (i * angleStep);

      // Check for error codes
      if (distance >= 16000 && distance <= 16004) {
        console.log(`Error code detected at angle ${angle}: ${distance}`);
        continue; // Skip this point
      }

      points.push({
        angle: angle,
        distance: distance / 100,
        intensity: intensity
      });
    }

    console.log('Processed', points.length, '2D points');
    if (this.dataCallback) {
      this.dataCallback(points, '2D');
    }
  }

  public initialize(mode: ScanMode = '2D'): void {
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
import { SerialPort } from 'serialport';
import { Buffer } from 'buffer';
import { Command, getBaudRateCommand, lidarAngleCamera, LidarError2D, LidarError3D, lidarPixelRealSize, lidarRealImageSize, LidarResponse, LidarSpec, lidartablex, lidartabley, lidartablez } from './config';

export type ScanMode = '2D' | '3D';

export interface LidarPoint {
  x: number;
  y: number;
  z: number;
}

export class LidarScanner {
  private port: SerialPort | null = null;
  private serialdata: string = '';
  private dataCallback: ((points: LidarPoint[]) => void) | null = null;
  private statusCallback: ((status: string) => void) | null = null;
  private currentMode: ScanMode = '2D';
  private pendingResponse: { pattern: string, resolve: () => void } | null = null;
  private tablex = lidartablex;
  private tabley = lidartabley;
  private tablez = lidartablez;


  constructor() {}

  static async listPorts(): Promise<string[]> {
    const ports = await SerialPort.list();
    return ports.map(p => p.path);
  }

  connect(portPath: string, baudRate: number = 115200): Promise<void> {
    this.emitStatus(`Connecting to ${portPath} at ${baudRate}...`);
    return new Promise((resolve, reject) => {
        if (this.port && this.port.isOpen) {
            this.port.close();
        }
        
        this.port = new SerialPort({ path: portPath, baudRate: baudRate });

        this.port.on('open', async () => {
            this.emitStatus("Port opened. Stabilizing connection...");
            console.log(`Serial port ${portPath} opened at ${baudRate}`);
            
            // Wait for port stability
            await this.delay(500);

            try {
                // Get Device Info immediately after connection
                await this.sendCommandAndWait(Command.deviceinfo, LidarResponse.deviceinfo, "Getting Device Info...");
            } catch (e) {
                console.warn("Could not get device info immediately:", e);
                this.emitStatus("Warning: Device info check skipped.");
            }

            this.emitStatus("Connection Established.");
            resolve();
            
            // Start initialization (Config & Scan) sequence
            setTimeout(() => {
                this.initialize(this.currentMode);
            }, 500);
        });

        this.port.on('error', (err) => {
            console.error('Serial port error:', err);
             this.emitStatus(`Connection Error: ${err.message}`);
             reject(err);
        });

        this.port.on('data', (data: Buffer) => {
            this.dataListener(data.toString('hex'));
        });
    })
  }
 
  disconnect(): void {
      if (this.port && this.port.isOpen) {
          this.port.close((err) => {
              if (err) console.error('Error closing port:', err);
              else console.log('Serial port disconnected');
          });
      }
      this.port = null;
  }

  async initialize(mode: ScanMode): Promise<void> {
    this.currentMode = mode;
    this.emitStatus(`Initializing ${mode} scan mode (Async)`);
    // this.distort3DLens();
    this.Distortion3D();

    try {
        // Device info is already fetched in connect(), but we can do it again or skip. 
        // Let's keep the config sequence here.
        
        // Config commands do not send ACKs, so we just send them with a small delay
        if (this.port) {
             const rate = this.port.baudRate;
             const cmd = getBaudRateCommand(rate);
             this.emitStatus("Setting Baudrate...");
             this.port.write(cmd);
             await this.delay(100);
        }

        this.emitStatus("Setting Frequency...");
        this.port?.write(Command.frequency);
        await this.delay(100);

        this.emitStatus("Setting Pulse...");
        this.port?.write(Command.pulse);
        await this.delay(100);

        this.emitStatus("Setting Sensitivity...");
        this.port?.write(Command.sensitivity);
        await this.delay(100);
        
        this.emitStatus(`Starting ${mode} Scan...`);
        if (mode === '2D') this.scan2D();
        else this.scan3D();
    } catch (e: any) {
        this.emitStatus(`Initialization Error: ${e.message}`);
        console.error(e);
    }
  }

  private sendCommandAndWait(cmd: Buffer, expectedPattern: string, statusMsg: string, timeoutMs: number = 2000): Promise<void> {
      return new Promise((resolve, reject) => {
          this.emitStatus(statusMsg);
          this.pendingResponse = { pattern: expectedPattern, resolve };
          
          this.port?.write(cmd, (err) => {
              if (err) {
                  this.pendingResponse = null;
                  reject(err);
              }
          });

          setTimeout(() => {
              if (this.pendingResponse && this.pendingResponse.pattern === expectedPattern) {
                  console.warn(`Timeout waiting for ${statusMsg}`);
                  // We resolve anyway to continue sequence, but log warning
                   this.pendingResponse = null;
                   resolve();
              }
          }, timeoutMs);
      });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private dataListener(data: string): void {
    this.serialdata += data;
    
    // Check for pending response
    if (this.pendingResponse && this.serialdata.includes(this.pendingResponse.pattern)) {
        console.log(`Received expected response: ${this.pendingResponse.pattern}`);
        this.pendingResponse.resolve();
        this.pendingResponse = null;
        // Optionally consume the buffer so we don't re-trigger? 
        // For simple ACK, it might be fine.
        // But let's proceed to specific handlers.
    }

    if (this.serialdata.includes(LidarResponse.deviceinfo) && this.serialdata.length > 22) {
      this.handleDeviceInfo();
    } else if (this.serialdata.includes(LidarResponse.scan2D) && this.serialdata.length >= LidarSpec.width * 4 + 18) {
      this.handle2DData();
    } else if (this.serialdata.includes(LidarResponse.scan3D) && this.serialdata.length >= LidarSpec.width * LidarSpec.height * 4 + 2) {
      this.handle3DData();
    }
  }

  private handleDeviceInfo(): void {
    this.serialdata = this.serialdata.replace(LidarResponse.deviceinfo, '');
    console.log('Device info raw:', this.serialdata); 
    // Expecting 6 bytes (12 hex chars)
    if (this.serialdata.length < 12) return;

    let major = parseInt(this.serialdata.slice(0, 2), 16);
    let minor = parseInt(this.serialdata.slice(2, 4), 16);
    let patch = parseInt(this.serialdata.slice(4, 6), 16);
    let hw1 = parseInt(this.serialdata.slice(6, 8), 16);
    let hw2 = parseInt(this.serialdata.slice(8, 10), 16);
    let hw3 = parseInt(this.serialdata.slice(10, 12), 16);
    
    const info = {
        firmware: `${major}.${minor}.${patch}`,
        hardware: `${hw1}.${hw2}.${hw3}`
    };
    
    console.log(`Version ${info.firmware} HW: ${info.hardware}`);
    this.emitStatus(`Device Info: FW v${info.firmware}, HW v${info.hardware}`);
    
    // Also emit specific device info event if needed, but status is okay for now.
    // Let's modify callback to support type checking or just send a specific message format
    if (this.dataCallback) { 
        // We can't use dataCallback for this.
        // Let's rely on status for now or add a new event.
        // The user wants to "Get Device Info", likely explicitly.
    }
    
    this.serialdata = '';
  }

  private handle2DData(): void {
    this.serialdata = this.serialdata.replace(LidarResponse.scan2D, '');
    this.serialdata = this.serialdata.slice(0,this.serialdata.length );
    let points: LidarPoint[] = [];
    let offset = 0;
    let angle = -LidarSpec.hfov / 2;
    while (offset <=  this.serialdata.length ) {
        let distance = parseInt(this.serialdata.slice(offset, offset + 4), 16); // Convert to cm
        points.push(
            LidarError2D.includes(distance) ? { x: 0, y: 0, z: 0 }: {
                    x: Math.trunc(distance * Math.cos(angle * Math.PI / 180)) / 10,
                    y: Math.trunc(distance * Math.sin(angle * Math.PI / 180)) / 10,
                    z: 0,
                  }
        );
        angle += LidarSpec.epsilon;
        offset += 4;
    }
    if (this.dataCallback) {

      this.dataCallback(points.reverse());
    }
    this.serialdata = '';
  }

  private handle3DData(): void {
    this.serialdata = this.serialdata.replace(LidarResponse.scan3D, '');
    this.serialdata = this.serialdata.slice(0,this.serialdata.length);
    let points: LidarPoint[] = [];
    let offset = 3;
    console.log(this.serialdata, "length", this.serialdata.length)
    for(let i=0; i< LidarSpec.width * LidarSpec.height * 3 ; i += offset){
        let value = parseInt(this.serialdata.slice(i, i + offset), 16);
        if(!LidarError3D.includes(value)){
            console.log("Value at "+i+" is "+value)
            let data1 = value * this.tablex[i] / 10 | 0;
            let data2 = value * this.tabley[i] / 10 | 0;
            let data3 = value * this.tablez[i] / 10 | 0;
            points.push({
                x: data1,
                y: data2,
                z: data3
            })
        }
        else{
            points.push({
                x:0,
                y:0,
                z:0
            })
        }
    }

    if (this.dataCallback) {
      this.dataCallback(points);
    }

    this.serialdata = '';
  }

  onData(callback: (points: LidarPoint[]) => void): void {
    this.dataCallback = callback;
  }

  onStatus(callback: (status: string) => void): void {
      this.statusCallback = callback;
  }

  private emitStatus(msg: string): void {
      if (this.statusCallback) {
          this.statusCallback(msg);
      }
      console.log(msg);
  }

  getDeviceInfo(): void {
    if(!this.port) return;
    this.port.write(Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]), (err) => {
      if (err) console.log(err);
      console.info('Getting device info', Command.deviceinfo);
    });
  }

  scan3D(): void {
    if(!this.port) return;
    this.port.write(Command.scan3D, (err) => {
      if (err) console.log(err);
      console.info('Scanning 3D', Command.scan3D);
    });
  }

  scan2D(): void {
    if(!this.port) return;
    this.port.write(Command.scan2D, (err) => {
      if (err) console.log(err);
      console.info('Scanning 2D', Command.scan2D);
    });
  }

  setFrequency(): void {
    if(!this.port) return;
    this.port.write(Command.frequency, (err) => {
      if (err) console.log(err);
      console.info('Setting frequency', Command.frequency);
    });
  }
  
  setPulse(): void {
    if(!this.port) return;
    this.port.write(Command.pulse, (err) => {
      if (err) console.log(err);
      console.info('Setting pulse', Command.pulse);
    });
  }

  setSensitivity(): void {
    if(!this.port) return;
    this.port.write(Command.sensitivity, (err) => {
      if (err) console.log(err);
      console.info('Setting sensitivity', Command.sensitivity);
    });
  }

  setBaudrate(): void {
    if(!this.port) return;
    const rate = this.port.baudRate;
    const cmd = getBaudRateCommand(rate);
    this.port.write(cmd, (err) => {
      if (err) console.log(err);
      console.info(`Setting baudrate to ${rate}`, cmd);
    });
  }

  stopScan(): void {
    if(!this.port) return;
    this.port.write(Command.shutdown, (err) => {
      if (err) console.log(err);
      console.log('Stopping scan...');
    });
  }

  private Distortion3D(): void
  {
    let _sensor_point_size_mm: number = lidarPixelRealSize;
    let _sensor_width: number = LidarSpec.width;
    let _sensor_height: number = LidarSpec.height;
    let _center_point_offset_x: number = LidarSpec.width / 2; 
    let _center_point_offset_y: number = LidarSpec.height / 2;
    const number_of_columns = _sensor_width;
    const number_of_rows    = _sensor_height;

    const row0 = 1 - (number_of_rows / 2) + _center_point_offset_x;
    const col0 = 1 - (number_of_columns / 2) + _center_point_offset_y;

    for (let y = 0, r = row0; y < number_of_rows; r++, y++)
    {
      let max_check = 0.0;

      for (let x = 0, c = col0; x < number_of_columns; c++, x++)
      {
        const column = c - 0.5;
        const row    = r - 0.5;

        const angle_grad = this.getAngle(column, row, _sensor_point_size_mm);

        if (angle_grad > max_check) max_check = angle_grad;

        const angle_rad = angle_grad * (Math.PI / 180);

        const x_over_hypotenuse 			 = column * (Math.sin(angle_rad) / Math.sqrt((column * column) + (row * row)));
        const y_over_hypotenuse 			 = row    * (Math.sin(angle_rad) / Math.sqrt((column * column) + (row * row)));
        const focal_length_over_hypotenuse = Math.cos(angle_rad);

        this.tablex[x + (y * LidarSpec.width)] = x_over_hypotenuse;
        this.tabley[x + (y * LidarSpec.width)] = y_over_hypotenuse;
        this.tablez[x + (y * LidarSpec.width)] = focal_length_over_hypotenuse;
      }
    }
  }


  private distort3DLens(): void {
        console.log("Distorting lens");
        const offset_x = 0;
        const offset_y = 0;
        const r0 = 1 - (LidarSpec.height / 2) + offset_x;
        const c0 = 1 - (LidarSpec.width / 2) + offset_y;
        let maxcheck = 0;
        for (let row = 0; row < LidarSpec.height; row++) {
            maxcheck = 0;
            for (let col = 0; col < LidarSpec.width; col++) {
                const c = (col + c0) - 0.5;
                const r = (row + r0) - 0.5;
                const anglegrad = this.getAngle(c, r, lidarPixelRealSize);
                maxcheck = anglegrad > maxcheck ? anglegrad : maxcheck;
                const angleradians = (anglegrad * Math.PI) / 180;
                const rp = Math.sqrt((c * c) + (r * r));
                const rua = Math.sin(angleradians);
                this.tablex[col + (row * LidarSpec.width)] = (c * rua / rp) * 0.1;
                this.tabley[col + (row * LidarSpec.width)] = (r * rua / rp) * 0.1;
                this.tablez[col + (row * LidarSpec.width)] = (Math.cos(angleradians));
            }
        }
        console.log("Table x:", this.tablex);
        console.log("Table y:", this.tabley);
        console.log("Table z:", this.tablez);
    }

    private getAngle(x:number,y:number,sensorPointSizeMM:number){
        let radius = sensorPointSizeMM * Math.sqrt((x * x) + (y * y))
        let alfaGrad = 0;
        for (let i = 1; i < lidarAngleCamera.length; i++) {
            if (radius >= lidarRealImageSize[i - 1] && radius <= lidarRealImageSize[i]) {
                alfaGrad = this.map(radius, lidarRealImageSize[i - 1], lidarAngleCamera[i - 1], lidarRealImageSize[i], lidarAngleCamera[i]);
                break;
            }
        }
        return alfaGrad;
    }

    private map(x: number, in_min: number, in_max: number, out_min: number, out_max: number) {
        return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }

  shutdown(): void {
    if(!this.port) return;
    this.port.write(Command.shutdown, (err) => {
      if (err) console.log(err);
      console.log('Shutting down...');
    });
    this.port.close((err) => {
      if (err) console.log(err);
      console.log('Serial port closed');
    });
    this.port = null;
  }
}
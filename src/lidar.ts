import { SerialPort } from 'serialport';
import { Buffer } from 'buffer';
import { Command, lidarAngleCamera, LidarError2D, LidarError3D, lidarPixelRealSize, lidarRealImageSize, LidarResponse, LidarSpec, lidartablex, lidartabley, lidartablez } from './config';

export type ScanMode = '2D' | '3D';

export interface LidarPoint {
  x: number;
  y: number;
  z: number;
}

export class LidarScanner {
  private port: SerialPort;
  private serialdata: string = '';
  private dataCallback: ((points: LidarPoint[]) => void) | null = null;
  private currentMode: ScanMode = '2D';
  private tablex = lidartablex;
  private tabley = lidartabley;
  private tablez = lidartablez;


  constructor(portPath: string) {
    this.port = new SerialPort({ path: portPath, baudRate: 115200 });
    this.port.on('open', () => {
      console.log('Serial port opened');
      setTimeout(() => {
        this.initialize(this.currentMode);
      }, 1000);
    });
    this.port.on('error', (err) => console.error('Serial port error:', err));
    this.port.on('data', (data: Buffer) => {
      this.dataListener(data.toString('hex'));
    });
  }

  initialize(mode: ScanMode): void {
    this.currentMode = mode;
    console.log(`Initializing ${mode} scan mode`);
    // this.distort3DLens();
    this.Distortion3D();

    let sequence = [
      { fn: () => this.getDeviceInfo() },
      { fn: () => this.setBaudrate() },
      { fn: () => this.setFrequency() },
      { fn: () => this.setPulse() },
      { fn: () => this.setSensitivity() },
      { fn: () => (mode === '2D' ? this.scan2D() : this.scan3D()) },
    ];

    sequence.forEach((item, index) => {
      setTimeout(() => {
        console.log('Executing...', item.fn);
        item.fn();
      }, (index + 1) * 100);
    });
  }

  private dataListener(data: string): void {
    this.serialdata += data;
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
    console.log('Device info:', this.serialdata);
    let major = this.serialdata.slice(0, 2);
    let minor = this.serialdata.slice(2, 4);
    let patch = this.serialdata.slice(4, 6);
    let hw1 = this.serialdata.slice(6, 8);
    let hw2 = this.serialdata.slice(8, 10);
    let hw3 = this.serialdata.slice(10, 12);
    console.log(`Version ${parseInt(major, 16)}.${parseInt(minor, 16)}.${parseInt(patch, 16)} HW: ${parseInt(hw1, 16)}.${parseInt(hw2, 16)}.${parseInt(hw3, 16)}`);
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

  getDeviceInfo(): void {
    this.port.write(Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]), (err) => {
      if (err) console.log(err);
      console.info('Getting device info', Command.deviceinfo);
    });
  }

  scan3D(): void {
    this.port.write(Command.scan3D, (err) => {
      if (err) console.log(err);
      console.info('Scanning 3D', Command.scan3D);
    });
  }

  scan2D(): void {
    this.port.write(Command.scan2D, (err) => {
      if (err) console.log(err);
      console.info('Scanning 2D', Command.scan2D);
    });
  }

  setFrequency(): void {
    this.port.write(Command.frequency, (err) => {
      if (err) console.log(err);
      console.info('Setting frequency', Command.frequency);
    });
  }
  
  setPulse(): void {
    this.port.write(Command.pulse, (err) => {
      if (err) console.log(err);
      console.info('Setting pulse', Command.pulse);
    });
  }

  setSensitivity(): void {
    this.port.write(Command.sensitivity, (err) => {
      if (err) console.log(err);
      console.info('Setting sensitivity', Command.sensitivity);
    });
  }

  setBaudrate(): void {
    this.port.write(Command.baudrate, (err) => {
      if (err) console.log(err);
      console.info('Setting baudrate', Command.baudrate);
    });
  }

  stopScan(): void {
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
    this.port.write(Command.shutdown, (err) => {
      if (err) console.log(err);
      console.log('Shutting down...');
    });
    this.port.close((err) => {
      if (err) console.log(err);
      console.log('Serial port closed');
    });
  }
}
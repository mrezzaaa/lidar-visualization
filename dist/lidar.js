"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LidarScanner = void 0;
const serialport_1 = require("serialport");
const buffer_1 = require("buffer");
const config_1 = require("./config");
class LidarScanner {
    constructor(portPath) {
        this.serialdata = '';
        this.dataCallback = null;
        this.currentMode = '2D';
        this.tablex = config_1.lidartablex;
        this.tabley = config_1.lidartabley;
        this.tablez = config_1.lidartablez;
        this.port = new serialport_1.SerialPort({ path: portPath, baudRate: 115200 });
        this.port.on('open', () => {
            console.log('Serial port opened');
            setTimeout(() => {
                this.initialize(this.currentMode);
            }, 1000);
        });
        this.port.on('error', (err) => console.error('Serial port error:', err));
        this.port.on('data', (data) => {
            this.dataListener(data.toString('hex'));
        });
    }
    initialize(mode) {
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
    dataListener(data) {
        this.serialdata += data;
        if (this.serialdata.includes(config_1.LidarResponse.deviceinfo) && this.serialdata.length > 22) {
            this.handleDeviceInfo();
        }
        else if (this.serialdata.includes(config_1.LidarResponse.scan2D) && this.serialdata.length >= config_1.LidarSpec.width * 4 + 18) {
            this.handle2DData();
        }
        else if (this.serialdata.includes(config_1.LidarResponse.scan3D) && this.serialdata.length >= config_1.LidarSpec.width * config_1.LidarSpec.height * 4 + 2) {
            this.handle3DData();
        }
    }
    handleDeviceInfo() {
        this.serialdata = this.serialdata.replace(config_1.LidarResponse.deviceinfo, '');
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
    handle2DData() {
        this.serialdata = this.serialdata.replace(config_1.LidarResponse.scan2D, '');
        this.serialdata = this.serialdata.slice(0, this.serialdata.length);
        let points = [];
        let offset = 0;
        let angle = -config_1.LidarSpec.hfov / 2;
        while (offset <= this.serialdata.length) {
            let distance = parseInt(this.serialdata.slice(offset, offset + 4), 16); // Convert to cm
            points.push(config_1.LidarError2D.includes(distance) ? { x: 0, y: 0, z: 0 } : {
                x: Math.trunc(distance * Math.cos(angle * Math.PI / 180)) / 10,
                y: Math.trunc(distance * Math.sin(angle * Math.PI / 180)) / 10,
                z: 0,
            });
            angle += config_1.LidarSpec.epsilon;
            offset += 4;
        }
        if (this.dataCallback) {
            this.dataCallback(points.reverse());
        }
        this.serialdata = '';
    }
    handle3DData() {
        this.serialdata = this.serialdata.replace(config_1.LidarResponse.scan3D, '');
        this.serialdata = this.serialdata.slice(0, this.serialdata.length);
        let points = [];
        let offset = 3;
        console.log(this.serialdata, "length", this.serialdata.length);
        for (let i = 0; i < config_1.LidarSpec.width * config_1.LidarSpec.height * 3; i += offset) {
            let value = parseInt(this.serialdata.slice(i, i + offset), 16);
            if (!config_1.LidarError3D.includes(value)) {
                console.log("Value at " + i + " is " + value);
                let data1 = value * this.tablex[i] / 10 | 0;
                let data2 = value * this.tabley[i] / 10 | 0;
                let data3 = value * this.tablez[i] / 10 | 0;
                points.push({
                    x: data1,
                    y: data2,
                    z: data3
                });
            }
            else {
                points.push({
                    x: 0,
                    y: 0,
                    z: 0
                });
            }
        }
        if (this.dataCallback) {
            this.dataCallback(points);
        }
        this.serialdata = '';
    }
    onData(callback) {
        this.dataCallback = callback;
    }
    getDeviceInfo() {
        this.port.write(buffer_1.Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]), (err) => {
            if (err)
                console.log(err);
            console.info('Getting device info', config_1.Command.deviceinfo);
        });
    }
    scan3D() {
        this.port.write(config_1.Command.scan3D, (err) => {
            if (err)
                console.log(err);
            console.info('Scanning 3D', config_1.Command.scan3D);
        });
    }
    scan2D() {
        this.port.write(config_1.Command.scan2D, (err) => {
            if (err)
                console.log(err);
            console.info('Scanning 2D', config_1.Command.scan2D);
        });
    }
    setFrequency() {
        this.port.write(config_1.Command.frequency, (err) => {
            if (err)
                console.log(err);
            console.info('Setting frequency', config_1.Command.frequency);
        });
    }
    setPulse() {
        this.port.write(config_1.Command.pulse, (err) => {
            if (err)
                console.log(err);
            console.info('Setting pulse', config_1.Command.pulse);
        });
    }
    setSensitivity() {
        this.port.write(config_1.Command.sensitivity, (err) => {
            if (err)
                console.log(err);
            console.info('Setting sensitivity', config_1.Command.sensitivity);
        });
    }
    setBaudrate() {
        this.port.write(config_1.Command.baudrate, (err) => {
            if (err)
                console.log(err);
            console.info('Setting baudrate', config_1.Command.baudrate);
        });
    }
    stopScan() {
        this.port.write(config_1.Command.shutdown, (err) => {
            if (err)
                console.log(err);
            console.log('Stopping scan...');
        });
    }
    Distortion3D() {
        let _sensor_point_size_mm = config_1.lidarPixelRealSize;
        let _sensor_width = config_1.LidarSpec.width;
        let _sensor_height = config_1.LidarSpec.height;
        let _center_point_offset_x = config_1.LidarSpec.width / 2;
        let _center_point_offset_y = config_1.LidarSpec.height / 2;
        const number_of_columns = _sensor_width;
        const number_of_rows = _sensor_height;
        const row0 = 1 - (number_of_rows / 2) + _center_point_offset_x;
        const col0 = 1 - (number_of_columns / 2) + _center_point_offset_y;
        for (let y = 0, r = row0; y < number_of_rows; r++, y++) {
            let max_check = 0.0;
            for (let x = 0, c = col0; x < number_of_columns; c++, x++) {
                const column = c - 0.5;
                const row = r - 0.5;
                const angle_grad = this.getAngle(column, row, _sensor_point_size_mm);
                if (angle_grad > max_check)
                    max_check = angle_grad;
                const angle_rad = angle_grad * (Math.PI / 180);
                const x_over_hypotenuse = column * (Math.sin(angle_rad) / Math.sqrt((column * column) + (row * row)));
                const y_over_hypotenuse = row * (Math.sin(angle_rad) / Math.sqrt((column * column) + (row * row)));
                const focal_length_over_hypotenuse = Math.cos(angle_rad);
                this.tablex[x + (y * config_1.LidarSpec.width)] = x_over_hypotenuse;
                this.tabley[x + (y * config_1.LidarSpec.width)] = y_over_hypotenuse;
                this.tablez[x + (y * config_1.LidarSpec.width)] = focal_length_over_hypotenuse;
            }
        }
    }
    distort3DLens() {
        console.log("Distorting lens");
        const offset_x = 0;
        const offset_y = 0;
        const r0 = 1 - (config_1.LidarSpec.height / 2) + offset_x;
        const c0 = 1 - (config_1.LidarSpec.width / 2) + offset_y;
        let maxcheck = 0;
        for (let row = 0; row < config_1.LidarSpec.height; row++) {
            maxcheck = 0;
            for (let col = 0; col < config_1.LidarSpec.width; col++) {
                const c = (col + c0) - 0.5;
                const r = (row + r0) - 0.5;
                const anglegrad = this.getAngle(c, r, config_1.lidarPixelRealSize);
                maxcheck = anglegrad > maxcheck ? anglegrad : maxcheck;
                const angleradians = (anglegrad * Math.PI) / 180;
                const rp = Math.sqrt((c * c) + (r * r));
                const rua = Math.sin(angleradians);
                this.tablex[col + (row * config_1.LidarSpec.width)] = (c * rua / rp) * 0.1;
                this.tabley[col + (row * config_1.LidarSpec.width)] = (r * rua / rp) * 0.1;
                this.tablez[col + (row * config_1.LidarSpec.width)] = (Math.cos(angleradians));
            }
        }
        console.log("Table x:", this.tablex);
        console.log("Table y:", this.tabley);
        console.log("Table z:", this.tablez);
    }
    getAngle(x, y, sensorPointSizeMM) {
        let radius = sensorPointSizeMM * Math.sqrt((x * x) + (y * y));
        let alfaGrad = 0;
        for (let i = 1; i < config_1.lidarAngleCamera.length; i++) {
            if (radius >= config_1.lidarRealImageSize[i - 1] && radius <= config_1.lidarRealImageSize[i]) {
                alfaGrad = this.map(radius, config_1.lidarRealImageSize[i - 1], config_1.lidarAngleCamera[i - 1], config_1.lidarRealImageSize[i], config_1.lidarAngleCamera[i]);
                break;
            }
        }
        return alfaGrad;
    }
    map(x, in_min, in_max, out_min, out_max) {
        return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }
    shutdown() {
        this.port.write(config_1.Command.shutdown, (err) => {
            if (err)
                console.log(err);
            console.log('Shutting down...');
        });
        this.port.close((err) => {
            if (err)
                console.log(err);
            console.log('Serial port closed');
        });
    }
}
exports.LidarScanner = LidarScanner;

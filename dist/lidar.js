"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LidarScanner = void 0;
const serialport_1 = require("serialport");
const buffer_1 = require("buffer");
const config_1 = require("./config");
class LidarScanner {
    constructor() {
        this.port = null;
        this.serialdata = '';
        this.dataCallback = null;
        this.statusCallback = null;
        this.currentMode = '2D';
        this.pendingResponse = null;
        this.tablex = config_1.lidartablex;
        this.tabley = config_1.lidartabley;
        this.tablez = config_1.lidartablez;
    }
    static async listPorts() {
        const ports = await serialport_1.SerialPort.list();
        return ports.map(p => p.path);
    }
    connect(portPath, baudRate = 115200) {
        return new Promise((resolve, reject) => {
            if (this.port && this.port.isOpen) {
                this.port.close();
            }
            this.port = new serialport_1.SerialPort({ path: portPath, baudRate: baudRate });
            this.port.on('open', () => {
                console.log(`Serial port ${portPath} opened at ${baudRate}`);
                resolve();
                // Start initialization sequence after a brief delay to ensure port is stable
                setTimeout(() => {
                    this.initialize(this.currentMode);
                }, 1000);
            });
            this.port.on('error', (err) => {
                console.error('Serial port error:', err);
                reject(err);
            });
            this.port.on('data', (data) => {
                this.dataListener(data.toString('hex'));
            });
        });
    }
    disconnect() {
        if (this.port && this.port.isOpen) {
            this.port.close((err) => {
                if (err)
                    console.error('Error closing port:', err);
                else
                    console.log('Serial port disconnected');
            });
        }
        this.port = null;
    }
    async initialize(mode) {
        var _a, _b, _c;
        this.currentMode = mode;
        this.emitStatus(`Initializing ${mode} scan mode (Async)`);
        // this.distort3DLens();
        this.Distortion3D();
        try {
            await this.sendCommandAndWait(config_1.Command.deviceinfo, config_1.LidarResponse.deviceinfo, "Getting Device Info...",3000);
            // Config commands do not send ACKs, so we just send them with a small delay
            if (this.port) {
                const rate = this.port.baudRate;
                const cmd = (0, config_1.getBaudRateCommand)(rate);
                this.emitStatus("Setting Baudrate...");
                this.port.write(cmd);
                await this.delay(100);
            }
            this.emitStatus("Setting Frequency...");
            (_a = this.port) === null || _a === void 0 ? void 0 : _a.write(config_1.Command.frequency);
            await this.delay(100);
            this.emitStatus("Setting Pulse...");
            (_b = this.port) === null || _b === void 0 ? void 0 : _b.write(config_1.Command.pulse);
            await this.delay(100);
            this.emitStatus("Setting Sensitivity...");
            (_c = this.port) === null || _c === void 0 ? void 0 : _c.write(config_1.Command.sensitivity);
            await this.delay(100);
            this.emitStatus(`Starting ${mode} Scan...`);
            if (mode === '2D')
                this.scan2D();
            else
                this.scan3D();
        }
        catch (e) {
            this.emitStatus(`Initialization Error: ${e.message}`);
            console.error(e);
        }
    }
    sendCommandAndWait(cmd, expectedPattern, statusMsg, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            var _a;
            this.emitStatus(statusMsg);
            this.pendingResponse = { pattern: expectedPattern, resolve };
            (_a = this.port) === null || _a === void 0 ? void 0 : _a.write(cmd, (err) => {
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
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    dataListener(data) {
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
        console.log('Device info raw:', this.serialdata);
        // Expecting 6 bytes (12 hex chars)
        if (this.serialdata.length < 12)
            return;
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
    onStatus(callback) {
        this.statusCallback = callback;
    }
    emitStatus(msg) {
        if (this.statusCallback) {
            this.statusCallback(msg);
        }
        console.log(msg);
    }
    getDeviceInfo() {
        if (!this.port)
            return;
        this.port.write(buffer_1.Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]), (err) => {
            if (err)
                console.log(err);
            console.info('Getting device info', config_1.Command.deviceinfo);
        });
    }
    scan3D() {
        if (!this.port)
            return;
        this.port.write(config_1.Command.scan3D, (err) => {
            if (err)
                console.log(err);
            console.info('Scanning 3D', config_1.Command.scan3D);
        });
    }
    scan2D() {
        if (!this.port)
            return;
        this.port.write(config_1.Command.scan2D, (err) => {
            if (err)
                console.log(err);
            console.info('Scanning 2D', config_1.Command.scan2D);
        });
    }
    setFrequency() {
        if (!this.port)
            return;
        this.port.write(config_1.Command.frequency, (err) => {
            if (err)
                console.log(err);
            console.info('Setting frequency', config_1.Command.frequency);
        });
    }
    setPulse() {
        if (!this.port)
            return;
        this.port.write(config_1.Command.pulse, (err) => {
            if (err)
                console.log(err);
            console.info('Setting pulse', config_1.Command.pulse);
        });
    }
    setSensitivity() {
        if (!this.port)
            return;
        this.port.write(config_1.Command.sensitivity, (err) => {
            if (err)
                console.log(err);
            console.info('Setting sensitivity', config_1.Command.sensitivity);
        });
    }
    setBaudrate() {
        if (!this.port)
            return;
        const rate = this.port.baudRate;
        const cmd = (0, config_1.getBaudRateCommand)(rate);
        this.port.write(cmd, (err) => {
            if (err)
                console.log(err);
            console.info(`Setting baudrate to ${rate}`, cmd);
        });
    }
    stopScan() {
        if (!this.port)
            return;
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
        if (!this.port)
            return;
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
        this.port = null;
    }
}
exports.LidarScanner = LidarScanner;

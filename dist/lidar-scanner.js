"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LidarScanner = void 0;
const serialport_1 = require("serialport");
const parser_readline_1 = require("@serialport/parser-readline");
class LidarScanner {
    constructor(portPath) {
        this.dataCallback = null;
        this.mode = '3D';
        this.isScanning = false;
        this.port = new serialport_1.SerialPort({ path: portPath, baudRate: 115200 });
        this.parser = this.port.pipe(new parser_readline_1.ReadlineParser({ delimiter: '\r\n' }));
        this.port.on('open', () => console.log('Serial port opened'));
        this.port.on('error', (err) => console.error('Serial port error:', err));
        this.parser.on('data', (data) => {
            console.log('Received raw data:', data.toString('hex'));
            if (this.isScanning) {
                this.processData(data);
            }
        });
    }
    initialize(mode = '3D') {
        this.mode = mode;
        const command = this.getCommand(mode);
        this.port.write(command, (err) => {
            if (err)
                console.error('Error sending command:', err);
            else {
                console.log(`${mode} mode initialized`);
                this.isScanning = true;
            }
        });
    }
    getCommand(mode) {
        switch (mode) {
            case '2D':
                return Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x01, 0x00, 0x03]);
            case '3D':
                return Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x08, 0x00, 0x0A]);
            default:
                throw new Error('Invalid mode');
        }
    }
    onData(callback) {
        this.dataCallback = callback;
    }
    processData(data) {
        console.log('Processing data:', data.toString('hex'));
        if (this.mode === '2D') {
            this.process2DData(data);
        }
        else {
            this.process3DData(data);
        }
    }
    process2DData(data) {
        if (data.length < 8) {
            console.log('Data too short for 2D frame');
            return;
        }
        const header = data.readUInt32LE(0);
        if (header !== 0x01014377) {
            console.log('Invalid 2D header:', header.toString(16));
            return;
        }
        const numPoints = (data.length - 8) / 4; // 4 bytes per point in 2D mode
        console.log(`Processing ${numPoints} 2D points`);
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            const offset = 8 + i * 4;
            const distance = data.readUInt16LE(offset);
            const intensity = data.readUInt16LE(offset + 2);
            const angle = (i / numPoints) * 2 * Math.PI;
            points.push({
                x: distance * Math.cos(angle),
                y: distance * Math.sin(angle),
                z: 0,
                intensity
            });
        }
        console.log(`Processed ${points.length} 2D points`);
        if (this.dataCallback) {
            this.dataCallback(points);
        }
    }
    process3DData(data) {
        if (data.length < 8) {
            console.log('Data too short for 3D frame');
            return;
        }
        const header = data.readUInt32LE(0);
        if (header !== 0x08384177) {
            console.log('Invalid 3D header:', header.toString(16));
            return;
        }
        const numPoints = (data.length - 8) / 6; // 6 bytes per point in 3D mode
        console.log(`Processing ${numPoints} 3D points`);
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            const offset = 8 + i * 6;
            const distance = data.readUInt16LE(offset);
            const intensity = data.readUInt8(offset + 2);
            const horizontalAngle = (i % 160) / 160 * 2 * Math.PI;
            const verticalAngle = Math.floor(i / 160) / 60 * Math.PI / 3; // Assuming 60 vertical lines and 120 degree FOV
            points.push({
                x: distance * Math.cos(verticalAngle) * Math.cos(horizontalAngle),
                y: distance * Math.cos(verticalAngle) * Math.sin(horizontalAngle),
                z: distance * Math.sin(verticalAngle),
                intensity
            });
        }
        console.log(`Processed ${points.length} 3D points`);
        if (this.dataCallback) {
            this.dataCallback(points);
        }
    }
    stopScan() {
        this.isScanning = false;
        const stopCommand = Buffer.from([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x02, 0x00, 0x00]);
        this.port.write(stopCommand, (err) => {
            if (err)
                console.error('Error sending stop command:', err);
            else
                console.log('Stop command sent successfully');
        });
    }
    shutdown() {
        this.stopScan();
        this.dataCallback = null;
        this.port.close((err) => {
            if (err)
                console.error('Error closing port:', err);
            else
                console.log('Port closed successfully');
        });
    }
}
exports.LidarScanner = LidarScanner;

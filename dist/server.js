"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const path_1 = __importDefault(require("path"));
const lidar_1 = require("./lidar");
class Server {
    constructor() {
        this.currentMode = '2D';
        this.app = (0, express_1.default)();
        this.server = http_1.default.createServer(this.app);
        this.wss = new ws_1.default.Server({ server: this.server });
        this.scanner = new lidar_1.LidarScanner();
        this.setupRoutes();
        this.setupWebSocket();
    }
    setupRoutes() {
        this.app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
        this.app.get('/', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
    }
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('Client connected');
            ws.on('message', async (message) => {
                console.log('Received message from client:', message);
                const data = JSON.parse(message);
                try {
                    if (data.command === 'list_ports') {
                        const ports = await lidar_1.LidarScanner.listPorts();
                        ws.send(JSON.stringify({ type: 'ports', ports }));
                    }
                    else if (data.command === 'connect') {
                        await this.scanner.connect(data.port, parseInt(data.baudrate));
                        ws.send(JSON.stringify({ type: 'status', message: 'Connected', status: 'connected' }));
                    }
                    else if (data.command === 'disconnect') {
                        this.scanner.disconnect();
                        ws.send(JSON.stringify({ type: 'status', message: 'Disconnected', status: 'disconnected' }));
                    }
                    else if (data.command === 'start') {
                        this.startScanning(ws, data.mode);
                    }
                    else if (data.command === 'stop') {
                        this.stopScanning(ws);
                    }
                }
                catch (error) {
                    console.error("Command error:", error);
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                }
            });
            ws.on('close', () => {
                console.log('Client disconnected');
                this.stopScanning(ws);
            });
        });
    }
    startScanning(ws, mode) {
        console.log(`Starting ${mode} scan`);
        this.currentMode = mode;
        this.scanner.initialize(mode);
        this.scanner.onStatus((status) => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(JSON.stringify({ type: 'status', message: status }));
            }
        });
        this.scanner.onData((points) => {
            if (ws.readyState === ws_1.default.OPEN) {
                // console.log(`Sending ${points.length} points to client`);
                ws.send(JSON.stringify({
                    type: 'points',
                    points: points.map((p) => ({ x: p.x, y: p.y, z: p.z }))
                }));
            }
        });
        ws.send(JSON.stringify({ type: 'status', message: `${mode} scanning started` }));
    }
    stopScanning(ws) {
        console.log('Stopping scan');
        this.scanner.stopScan();
        if (ws && ws.readyState === ws_1.default.OPEN) {
            ws.send(JSON.stringify({ type: 'status', message: 'Scanning stopped' }));
        }
    }
    start(port) {
        this.server.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    }
    shutdown() {
        this.scanner.shutdown();
        this.wss.close();
        this.server.close();
    }
}
exports.Server = Server;

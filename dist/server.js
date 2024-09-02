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
const lidar_scanner_1 = require("./lidar-scanner");
class Server {
    constructor(portPath) {
        this.currentMode = '3D';
        this.app = (0, express_1.default)();
        this.server = http_1.default.createServer(this.app);
        this.wss = new ws_1.default.Server({ server: this.server });
        this.scanner = new lidar_scanner_1.LidarScanner(portPath);
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
            ws.on('message', (message) => {
                console.log('Received message from client:', message);
                const data = JSON.parse(message);
                if (data.command === 'start') {
                    this.startScanning(ws, data.mode || '3D');
                }
                else if (data.command === 'stop') {
                    this.stopScanning(ws);
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
        if (this.currentMode !== mode) {
            this.currentMode = mode;
            this.scanner.initialize(mode);
            this.scanner.onData((points) => {
                if (ws.readyState === ws_1.default.OPEN) {
                    console.log(`Sending ${points.length} points to client`);
                    ws.send(JSON.stringify({ type: 'points', points }));
                }
            });
            ws.send(JSON.stringify({ type: 'status', message: `${mode} scanning started` }));
        }
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

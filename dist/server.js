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
const new_lidar_1 = require("./new-lidar");
class Server {
    constructor() {
        this.lidar = null;
        this.app = (0, express_1.default)();
        this.server = http_1.default.createServer(this.app);
        this.wss = new ws_1.default.Server({ server: this.server });
        this.setupRoutes();
        this.setupWebSocket();
    }
    setupRoutes() {
        this.app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
        this.app.get('/', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
        // API endpoint to list available serial ports
        this.app.get('/api/ports', async (req, res) => {
            try {
                const ports = await (0, new_lidar_1.listSerialPorts)();
                res.json({ success: true, ports });
            }
            catch (error) {
                res.json({ success: false, error: error.message });
            }
        });
    }
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('Client connected');
            ws.on('message', async (message) => {
                try {
                    console.log('Received message from client:', message);
                    const data = JSON.parse(message);
                    await this.handleClientMessage(ws, data);
                }
                catch (error) {
                    console.error('Error handling message:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message || 'Unknown error'
                    }));
                }
            });
            ws.on('close', () => {
                console.log('Client disconnected');
                // Clean up LiDAR connection if needed
                if (this.lidar) {
                    this.lidar.stopScan().catch(console.error);
                }
            });
            // Send initial port list
            this.sendPortList(ws);
        });
    }
    async handleClientMessage(ws, data) {
        switch (data.command) {
            case 'listPorts':
                await this.sendPortList(ws);
                break;
            case 'connect':
                await this.handleConnect(ws, data.port, data.baudrate);
                break;
            case 'disconnect':
                await this.handleDisconnect(ws);
                break;
            case 'getDeviceInfo':
                await this.handleGetDeviceInfo(ws);
                break;
            case 'setBaudrate':
                await this.handleSetBaudrate(ws, data.mode);
                break;
            case 'setFrequency':
                await this.handleSetFrequency(ws, data.channel);
                break;
            case 'setPulse':
                await this.handleSetPulse(ws, data.value, data.mode);
                break;
            case 'startScan':
                await this.handleStartScan(ws, data.mode);
                break;
            case 'stopScan':
                await this.handleStopScan(ws);
                break;
            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Unknown command: ${data.command}`
                }));
        }
    }
    async sendPortList(ws) {
        try {
            const ports = await (0, new_lidar_1.listSerialPorts)();
            ws.send(JSON.stringify({ type: 'ports', ports }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleConnect(ws, port, baudrate) {
        try {
            // Disconnect existing connection if any
            if (this.lidar) {
                await this.lidar.disconnect();
            }
            // Create new LiDAR instance
            this.lidar = new new_lidar_1.CygLidarD1();
            // Set up event handlers
            this.setupLidarEventHandlers(ws);
            // Connect
            const success = await this.lidar.connect(port, baudrate);
            ws.send(JSON.stringify({
                type: 'connected',
                success,
                port,
                baudrate
            }));
            // Automatically request device info after connection
            if (success) {
                setTimeout(() => {
                    var _a;
                    (_a = this.lidar) === null || _a === void 0 ? void 0 : _a.getDeviceInfo().catch(console.error);
                }, 500);
            }
        }
        catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: `Connection failed: ${error.message}`
            }));
        }
    }
    async handleDisconnect(ws) {
        try {
            if (this.lidar) {
                await this.lidar.disconnect();
                this.lidar = null;
            }
            ws.send(JSON.stringify({ type: 'disconnected' }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleGetDeviceInfo(ws) {
        try {
            if (!this.lidar) {
                throw new Error('Not connected');
            }
            await this.lidar.getDeviceInfo();
            // Response will come via deviceInfo event
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleSetBaudrate(ws, mode) {
        try {
            if (!this.lidar) {
                throw new Error('Not connected');
            }
            const success = await this.lidar.setBaudrate(mode);
            ws.send(JSON.stringify({
                type: 'status',
                message: success ? 'Baudrate changed successfully' : 'Failed to change baudrate'
            }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleSetFrequency(ws, channel) {
        try {
            if (!this.lidar) {
                throw new Error('Not connected');
            }
            await this.lidar.setFrequency(channel);
            ws.send(JSON.stringify({
                type: 'status',
                message: `Frequency channel set to ${channel}`
            }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleSetPulse(ws, value, mode) {
        try {
            if (!this.lidar) {
                throw new Error('Not connected');
            }
            await this.lidar.setIntegrationTime(value, mode);
            ws.send(JSON.stringify({
                type: 'status',
                message: `Integration time set to ${value} us (${mode})`
            }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleStartScan(ws, mode) {
        try {
            if (!this.lidar) {
                throw new Error('Not connected');
            }
            await this.lidar.startScan(mode);
            ws.send(JSON.stringify({
                type: 'status',
                message: `${mode} scanning started`
            }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    async handleStopScan(ws) {
        try {
            if (!this.lidar) {
                throw new Error('Not connected');
            }
            await this.lidar.stopScan();
            ws.send(JSON.stringify({
                type: 'status',
                message: 'Scanning stopped'
            }));
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    }
    setupLidarEventHandlers(ws) {
        if (!this.lidar)
            return;
        this.lidar.on('deviceInfo', (info) => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(JSON.stringify({ type: 'deviceInfo', info }));
            }
        });
        this.lidar.on('2dData', (points) => {
            if (ws.readyState === ws_1.default.OPEN) {
                // Convert 2D polar coordinates to Cartesian for visualization
                const cartesianPoints = points.map(p => {
                    const angleRad = (p.angle * Math.PI) / 180;
                    const distanceMeters = p.distance / 1000; // mm to meters
                    return {
                        x: distanceMeters * Math.cos(angleRad),
                        y: distanceMeters * Math.sin(angleRad),
                        z: 0,
                        intensity: p.intensity
                    };
                });
                ws.send(JSON.stringify({
                    type: 'points',
                    mode: '2D',
                    points: cartesianPoints
                }));
            }
        });
        this.lidar.on('3dData', (points) => {
            if (ws.readyState === ws_1.default.OPEN) {
                // Convert 3D pixel coordinates to Cartesian for visualization
                // This is a simple mapping - you may want to adjust based on your needs
                const cartesianPoints = points.map(p => {
                    const distanceMeters = p.distance / 1000; // mm to meters
                    const angleHorizontal = ((p.x - 80) / 160) * 120 * (Math.PI / 180); // -60 to +60 degrees
                    const angleVertical = ((p.y - 30) / 60) * 45 * (Math.PI / 180); // Approximate vertical FOV
                    return {
                        x: distanceMeters * Math.cos(angleVertical) * Math.cos(angleHorizontal),
                        y: distanceMeters * Math.cos(angleVertical) * Math.sin(angleHorizontal),
                        z: distanceMeters * Math.sin(angleVertical),
                    };
                });
                ws.send(JSON.stringify({
                    type: 'points',
                    mode: '3D',
                    points: cartesianPoints
                }));
            }
        });
        this.lidar.on('error', (error) => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message || 'Unknown error'
                }));
            }
        });
        this.lidar.on('disconnected', () => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(JSON.stringify({ type: 'disconnected' }));
            }
        });
    }
    start(port) {
        this.server.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    }
    async shutdown() {
        if (this.lidar) {
            await this.lidar.disconnect();
        }
        this.wss.close();
        this.server.close();
    }
}
exports.Server = Server;

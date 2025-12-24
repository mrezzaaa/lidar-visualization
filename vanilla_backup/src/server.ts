import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import { CygLidarD1, listSerialPorts, LidarPoint2D, LidarPoint3D, DeviceInfo, ScanMode } from './new-lidar';

export class Server {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private lidar: CygLidarD1 | null = null;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes(): void {
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // API endpoint to list available serial ports
    this.app.get('/api/ports', async (req, res) => {
      try {
        const ports = await listSerialPorts();
        res.json({ success: true, ports });
      } catch (error: any) {
        res.json({ success: false, error: error.message });
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      console.log('Client connected');

      ws.on('message', async (message: string) => {
        try {
          console.log('Received message from client:', message);
          const data = JSON.parse(message);
          await this.handleClientMessage(ws, data);
        } catch (error: any) {
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

  private async handleClientMessage(ws: WebSocket, data: any): Promise<void> {
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

  private async sendPortList(ws: WebSocket): Promise<void> {
    try {
      const ports = await listSerialPorts();
      ws.send(JSON.stringify({ type: 'ports', ports }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleConnect(ws: WebSocket, port: string, baudrate: number): Promise<void> {
    try {
      // Disconnect existing connection if any
      if (this.lidar) {
        await this.lidar.disconnect();
      }

      // Create new LiDAR instance
      this.lidar = new CygLidarD1();

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
          this.lidar?.getDeviceInfo().catch(console.error);
        }, 500);
      }

    } catch (error: any) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: `Connection failed: ${error.message}` 
      }));
    }
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    try {
      if (this.lidar) {
        await this.lidar.disconnect();
        this.lidar = null;
      }
      ws.send(JSON.stringify({ type: 'disconnected' }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleGetDeviceInfo(ws: WebSocket): Promise<void> {
    try {
      if (!this.lidar) {
        throw new Error('Not connected');
      }
      await this.lidar.getDeviceInfo();
      // Response will come via deviceInfo event
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleSetBaudrate(ws: WebSocket, mode: number): Promise<void> {
    try {
      if (!this.lidar) {
        throw new Error('Not connected');
      }
      const success = await this.lidar.setBaudrate(mode);
      ws.send(JSON.stringify({ 
        type: 'status', 
        message: success ? 'Baudrate changed successfully' : 'Failed to change baudrate'
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleSetFrequency(ws: WebSocket, channel: number): Promise<void> {
    try {
      if (!this.lidar) {
        throw new Error('Not connected');
      }
      await this.lidar.setFrequency(channel);
      ws.send(JSON.stringify({ 
        type: 'status', 
        message: `Frequency channel set to ${channel}` 
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleSetPulse(ws: WebSocket, value: number, mode: 'auto' | 'manual'): Promise<void> {
    try {
      if (!this.lidar) {
        throw new Error('Not connected');
      }
      await this.lidar.setIntegrationTime(value, mode);
      ws.send(JSON.stringify({ 
        type: 'status', 
        message: `Integration time set to ${value} us (${mode})` 
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleStartScan(ws: WebSocket, mode: ScanMode): Promise<void> {
    try {
      if (!this.lidar) {
        throw new Error('Not connected');
      }
      await this.lidar.startScan(mode);
      ws.send(JSON.stringify({ 
        type: 'status', 
        message: `${mode} scanning started` 
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private async handleStopScan(ws: WebSocket): Promise<void> {
    try {
      if (!this.lidar) {
        throw new Error('Not connected');
      }
      await this.lidar.stopScan();
      ws.send(JSON.stringify({ 
        type: 'status', 
        message: 'Scanning stopped' 
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  }

  private setupLidarEventHandlers(ws: WebSocket): void {
    if (!this.lidar) return;

    this.lidar.on('deviceInfo', (info: DeviceInfo) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deviceInfo', info }));
      }
    });

    this.lidar.on('2dData', (points: LidarPoint2D[]) => {
      if (ws.readyState === WebSocket.OPEN) {
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

    this.lidar.on('3dData', (points: LidarPoint3D[]) => {
      if (ws.readyState === WebSocket.OPEN) {
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

    this.lidar.on('error', (error: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: error.message || 'Unknown error' 
        }));
      }
    });

    this.lidar.on('disconnected', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnected' }));
      }
    });
  }

  public start(port: number): void {
    this.server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  }

  public async shutdown(): Promise<void> {
    if (this.lidar) {
      await this.lidar.disconnect();
    }
    this.wss.close();
    this.server.close();
  }
}
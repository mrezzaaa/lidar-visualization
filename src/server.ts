import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import { LidarScanner, LidarPoint, ScanMode } from './lidar';

export class Server {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private scanner: LidarScanner;
  private currentMode: ScanMode = '2D';

  constructor(portPath: string) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.scanner = new LidarScanner(portPath);

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes(): void {
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      console.log('Client connected');

      ws.on('message', (message: string) => {
        console.log('Received message from client:', message);
        const data = JSON.parse(message);
        if (data.command === 'start') {
          this.startScanning(ws, data.mode as ScanMode);
        } else if (data.command === 'stop') {
          this.stopScanning(ws);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.stopScanning(ws);
      });
    });
  }

  private startScanning(ws: WebSocket, mode: ScanMode): void {
    console.log(`Starting ${mode} scan`);
    this.currentMode = mode;
    this.scanner.initialize(mode);
    this.scanner.onData((points: LidarPoint[]) => {
      if (ws.readyState === WebSocket.OPEN) {
        // console.log(`Sending ${points.length} points to client`);
        ws.send(JSON.stringify({ 
          type: 'points', 
          points: points.map( (p:any) => ({ x: p.x, y: p.y, z: p.z }))
        }));
      }
    });
    ws.send(JSON.stringify({ type: 'status', message: `${mode} scanning started` }));
  }

  private stopScanning(ws: WebSocket | null): void {
    console.log('Stopping scan');
    this.scanner.stopScan();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'status', message: 'Scanning stopped' }));
    }
  }

  public start(port: number): void {
    this.server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  }

  public shutdown(): void {
    this.scanner.shutdown();
    this.wss.close();
    this.server.close();
  }
}
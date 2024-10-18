import { Server } from './server';

const PORT = 3000;
const SERIAL_PORT = '/dev/cu.usbserial-1140'; // Adjust this to match your system

const server = new Server(SERIAL_PORT);

server.start(PORT);

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.shutdown();
  process.exit(0);
});
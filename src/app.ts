import { Server } from './server';

const PORT = 9000;
const server = new Server();

server.start(PORT);

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.shutdown();
  process.exit(0);
});
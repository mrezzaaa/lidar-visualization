import { Server } from './server';

const PORT = 3000;

// No need to specify port at startup - it will be selected via UI
const server = new Server();

server.start(PORT);

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await server.shutdown();
  process.exit(0);
});
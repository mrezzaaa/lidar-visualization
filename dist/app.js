"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const PORT = 3000;
// No need to specify port at startup - it will be selected via UI
const server = new server_1.Server();
server.start(PORT);
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await server.shutdown();
    process.exit(0);
});

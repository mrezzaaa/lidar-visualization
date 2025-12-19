"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const PORT = 3000;
const server = new server_1.Server();
server.start(PORT);
process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.shutdown();
    process.exit(0);
});

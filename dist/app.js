"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const PORT = 3000;
const SERIAL_PORT = '/dev/cu.usbserial-2130'; // Adjust this to match your system
const server = new server_1.Server(SERIAL_PORT);
server.start(PORT);
process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.shutdown();
    process.exit(0);
});

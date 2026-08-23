/**
 * Calculates the checksum for a CygLiDAR packet.
 * XORs bytes from offset 3 up to size-1.
 * @param buffer - The data buffer
 * @param size - The size of the packet
 * @returns The calculated checksum
 */
export function getChecksum(buffer: Uint8Array, size: number): number {
    let checksum = 0;
    const offset = 3;
    for (let x = offset; x < size - 1; x++) {
        checksum ^= buffer[x];
    }
    return checksum;
}

/**
 * Creates a command payload with the correct header and checksum.
 * @param api_id - The API ID (e.g. 0x02 for control)
 * @param command_id - The Command ID
 * @param data - Optional data bytes
 * @returns The complete packet
 */
export function createCommand(command_id: number, data: number[] = []): Uint8Array {
    // Header (3) + Length (2) + Type (1) + Data (N) + Checksum (1)
    // 5A 77 FF LSB MSB TYPE ... CS
    
    const packetSize = 6 + data.length + 1;
    const buffer = new Uint8Array(packetSize);
    
    buffer[0] = 0x5A;
    buffer[1] = 0x77;
    buffer[2] = 0xFF;
    
    const len = 1 + data.length; // Cmd + Data
    buffer[3] = len & 0xFF;        // Low
    buffer[4] = (len >> 8) & 0xFF; // High
    
    buffer[5] = command_id; // "Type"
    
    for (let i = 0; i < data.length; i++) {
        buffer[6 + i] = data[i];
    }
    
    // Checksum
    let cs = 0;
    for (let i = 3; i < packetSize - 1; i++) {
        cs ^= buffer[i];
    }
    buffer[packetSize - 1] = cs;
    
    return buffer;
}

export const CMD = {
    scan2D: createCommand(0x01, [0x00]),
    scan3D: createCommand(0x08, [0x00]),
    scanDual: createCommand(0x07, [0x00]),
    stop:   createCommand(0x02, [0x00]),
    info:   createCommand(0x10, [0x00]),
    
    pulse3DAuto: createCommand(0x0C, [0x00, 0x00]),
    pulse3D_5ms: createCommand(0x0C, [0x00, 0x00]),
    pulse3D_10ms: createCommand(0x0C, [0x00, 0x00]),
    frequencyCh0: createCommand(0x0F, [0x00]),
    sensitivity: createCommand(0x11, [20]),
    
    setBaud3000000: createCommand(0x12, [0x55]),
    setBaud250000: createCommand(0x12, [0x77]),
    setBaud115200: createCommand(0x12, [0xAA]),
    setBaud57600: createCommand(0x12, [0x39]),
};

/**
 * Sends a sequence of commands with delays between each
 * @param sendCommand - Function to send a single command
 * @param commands - Array of commands to send
 * @param delayMs - Delay in ms between commands (default 100ms)
 */
export async function sendCommandSequence(
    sendCommand: (cmd: Uint8Array) => Promise<void>,
    commands: Uint8Array[],
    delayMs: number = 100
): Promise<void> {
    for (const cmd of commands) {
        await sendCommand(cmd);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
}

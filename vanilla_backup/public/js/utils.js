/**
 * Calculates the checksum for a CygLiDAR packet.
 * XORs bytes from offset 3 up to size-1.
 * @param {Uint8Array} buffer - The data buffer
 * @param {number} size - The size of the packet
 * @returns {number} The calculated checksum
 */
function getChecksum(buffer, size) {
    let checksum = 0;
    const offset = 3;
    for (let x = offset; x < size - 1; x++) {
        checksum ^= buffer[x];
    }
    return checksum;
}

/**
 * Creates a command payload with the correct header and checksum.
 * @param {number} api_id - The API ID (e.g. 0x02 for control)
 * @param {number} command_id - The Command ID
 * @param {Array<number>} data - Optional data bytes
 * @returns {Uint8Array} The complete packet
 */
function createCommand(api_id, command_id, data = []) {
    // Header (3) + Length (2) + Type (1) + Data (N) + Checksum (1)
    // 5A 77 FF LSB MSB TYPE ... CS
    
    const payloadLen = 1 + data.length + 1; // Type + Data + CS
    // Note: Length in packet is payload length? 
    // Manual says: Length is 2 bytes (LSB, MSB). 
    // Let's follow the existing config.ts examples.
    // scan2D: 5a 77 ff 02 00 01 00 03
    // Len: 02 00 -> 0x0002. Payload: 01 (Type) 00 (CheckSum?) 
    // Wait, 0x03 is 0x01 ^ 0x02? No.
    // 5a 77 ff [02 00] [01] [00] [03]
    // 02 00 -> Length=2. 
    // Payload bytes: 01, 00. 
    // Checksum of 02 00 01 00 -> 02^00^01^00 = 3. Yes.
    
    // So Checksum starts from Length (byte 3).
    
    const packetSize = 6 + data.length + 1;
    const buffer = new Uint8Array(packetSize);
    
    buffer[0] = 0x5A;
    buffer[1] = 0x77;
    buffer[2] = 0xFF;
    
    // Length (Payload Length including Checksum?) 
    // In legacy: 02 00 means 2 bytes. 01 (Cmd) + 00 (Data?). 
    // Actually typically Length = Command + Data.
    // If we look at existing packets:
    // scan2D: 02 00 -> 2 bytes. 01 00.
    
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

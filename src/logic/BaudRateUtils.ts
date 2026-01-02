import { CMD } from './utils';

/**
 * Maps baud rate number to corresponding SET_BAUDRATE command
 * Uses NEW format for firmware >= 0.2.4
 * NOTE: Setting baud rate stores value in flash ROM and reboots device!
 */
export function getBaudCommand(baudRate: number): Uint8Array | null {
    switch (baudRate) {
        case 3000000: return CMD.setBaud3000000;  // Code 0x55
        case 250000:  return CMD.setBaud250000;   // Code 0x77
        case 115200:  return CMD.setBaud115200;   // Code 0xAA
        case 57600:   return CMD.setBaud57600;    // Code 0x39
        default:
            console.error(`[BaudRateUtils] Unsupported baud rate: ${baudRate}`);
            console.error('[BaudRateUtils] Supported rates: 3000000, 250000, 115200, 57600');
            return null;
    }
}

// Only baud rates supported by CygLiDAR D1 (F/W >= 0.2.4)
export const SUPPORTED_BAUD_RATES = [3000000, 250000, 115200, 57600];

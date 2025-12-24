#!/usr/bin/env python3
"""
USB Serial Raw Data Monitor
Prints all incoming data in hex and ASCII format
"""

import serial
import sys
import time
from datetime import datetime

def print_raw_data(port_path, baudrate=3000000):
    """Monitor and print raw serial data"""
    
    print("="*80)
    print("USB Serial Raw Data Monitor")
    print("="*80)
    print(f"Port:     {port_path}")
    print(f"Baudrate: {baudrate:,} bps")
    print(f"Started:  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    print("\nPress Ctrl+C to stop\n")
    print("-"*80)
    
    try:
        # Open serial port
        ser = serial.Serial(
            port=port_path,
            baudrate=baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=0.1
        )
        
        print(f"✓ Port opened successfully\n")
        
        byte_count = 0
        packet_count = 0
        
        while True:
            if ser.in_waiting > 0:
                # Read available data
                data = ser.read(ser.in_waiting)
                byte_count += len(data)
                
                # Check if it's a packet (starts with 0x5A 0x77)
                if data[0] == 0x5A and len(data) > 1 and data[1] == 0x77:
                    packet_count += 1
                    print(f"\n[PACKET #{packet_count}] {len(data)} bytes @ {datetime.now().strftime('%H:%M:%S.%f')[:-3]}")
                else:
                    print(f"\n[DATA] {len(data)} bytes @ {datetime.now().strftime('%H:%M:%S.%f')[:-3]}")
                
                # Print HEX
                hex_lines = []
                for i in range(0, len(data), 16):
                    chunk = data[i:i+16]
                    hex_part = ' '.join(f'{b:02X}' for b in chunk)
                    hex_lines.append(hex_part)
                
                print("HEX:")
                for line in hex_lines:
                    print(f"  {line}")
                
                # Print ASCII (printable characters only)
                ascii_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data)
                print(f"ASCII: {ascii_str}")
                
                # Show running total
                print(f"Total: {byte_count:,} bytes, {packet_count} packets")
                print("-"*80)
            
            time.sleep(0.01)  # Small delay to avoid busy loop
            
    except KeyboardInterrupt:
        print(f"\n\n{'='*80}")
        print("Stopped by user")
        print(f"Total received: {byte_count:,} bytes in {packet_count} packets")
        print("="*80)
        ser.close()
        
    except serial.SerialException as e:
        print(f"\n✗ Serial error: {e}")
        sys.exit(1)
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Default values
    PORT = "/dev/tty.usbserial-A5069RR4"
    BAUDRATE = 3000000
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        PORT = sys.argv[1]
    if len(sys.argv) > 2:
        BAUDRATE = int(sys.argv[2])
    
    if len(sys.argv) == 2 and sys.argv[1] in ['-h', '--help']:
        print("Usage: python3 monitor_serial.py [PORT] [BAUDRATE]")
        print()
        print("Examples:")
        print("  python3 monitor_serial.py")
        print("  python3 monitor_serial.py /dev/ttyUSB0")
        print("  python3 monitor_serial.py /dev/ttyUSB0 115200")
        print()
        print("Common baudrates: 3000000, 921600, 115200, 57600")
        sys.exit(0)
    
    print_raw_data(PORT, BAUDRATE)

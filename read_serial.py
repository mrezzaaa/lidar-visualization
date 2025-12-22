#!/usr/bin/env python3
"""
CygLiDAR D1 Simple Reader (ROS-style)
Sends 2D scan command and continuously reads data with packet detection
Based on ros-lidar.py pattern
"""

import serial
import sys
import time

def send_2d_scan_command(ser):
    """Send 2D scan start command"""
    command = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x01, 0x00, 0x03])
    print("Sending 2D scan command:")
    print("  " + ' '.join(f'{b:02X}' for b in command))
    ser.write(command)
    time.sleep(0.2)
    print("Command sent!\n")

def read_serial_continuously(port, baudrate):
    """Continuously read and display data with packet parsing"""
    
    print(f"Opening {port} at {baudrate} baud...")
    print("Press Ctrl+C to stop\n")
    
    try:
        ser = serial.Serial(port, baudrate, timeout=0.1)
        print(f"Connected!\n")
        
        # Send 2D scan command
        send_2d_scan_command(ser)
        
        print("Reading data (ROS-style accumulation)...")
        print("="*80)
        
        total_bytes = 0
        packet_count = 0
        data = ""  # Accumulated hex string (like in ros-lidar.py)
        
        while True:
            # Read byte-by-byte and accumulate (ROS pattern)
            if ser.in_waiting > 0:
                byte_data = ser.read(1)  # Read 1 byte at a time
                data += byte_data.hex()
                total_bytes += 1
                
                # Check for 2D packet header: "5a77ff430101"
                if "5a77ff430101" in data:
                    packet_count += 1
                    
                    # Found packet header
                    print(f"\n[PACKET #{packet_count}] Detected at byte {total_bytes}")
                    print("-"*80)
                    
                    # Remove header from accumulated data
                    data = data.replace("5a77ff430101", "")
                    
                    # Parse packet metadata (if enough data available)
                    if len(data) >= 6:
                        lsb = data[0:2]
                        msb = data[2:4]
                        header = data[4:6]
                        
                        print(f"LSB: {lsb} ({int(lsb, 16)})")
                        print(f"MSB: {msb} ({int(msb, 16)})")
                        print(f"Header: {header} ({int(header, 16)})")
                        
                        # Calculate expected payload size
                        payload_size = (int(msb, 16) << 8) | int(lsb, 16)
                        print(f"Payload size: {payload_size} bytes")
                        
                        # Expected total data: payload_size * 2 (hex chars)
                        expected_hex_chars = payload_size * 2
                        
                        if len(data) >= expected_hex_chars:
                            # Full packet received
                            payload_data = data[6:6+expected_hex_chars]
                            checksum = data[6+expected_hex_chars:6+expected_hex_chars+2]
                            
                            print(f"\nPayload preview (first 60 hex chars):")
                            print(f"  {payload_data[:60]}...")
                            print(f"Checksum: {checksum}")
                            print(f"Total packet size: {len(data)//2} bytes")
                            print("="*80)
                            
                            # Clear processed data
                            data = data[6+expected_hex_chars+2:]
                        else:
                            print(f"Waiting for full packet ({len(data)//2}/{payload_size} bytes)...")
                    
                # Show progress every 1000 bytes
                if total_bytes % 1000 == 0:
                    print(f"[Progress] {total_bytes:,} bytes | {packet_count} packets | Buffer: {len(data)//2} bytes")
                
    except KeyboardInterrupt:
        print(f"\n\n{'='*80}")
        print(f"Stopped. Total: {total_bytes:,} bytes, {packet_count} packets")
        print("="*80)
        ser.close()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Get port and baudrate from command line or use defaults
    port = sys.argv[1] if len(sys.argv) > 1 else "/dev/tty.usbserial-A5069RR4"
    baudrate = int(sys.argv[2]) if len(sys.argv) > 2 else 3000000
    
    read_serial_continuously(port, baudrate)

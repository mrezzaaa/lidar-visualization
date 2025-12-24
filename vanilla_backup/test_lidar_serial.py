#!/usr/bin/env python3
"""
CygLiDAR D1 Serial Communication Test Script
Tests RX/TX with the sensor to verify protocol implementation
"""

import serial
import time
import sys

# Protocol constants
NORMAL_MODE = 0x5A
PRODUCT_CODE = 0x77
DEFAULT_ID = 0xFF

# Commands
CMD_DEVICE_INFO = 0x10
CMD_SCAN_2D = 0x01
CMD_SCAN_3D = 0x08
CMD_STOP = 0x02

def calculate_checksum(buffer):
    """Calculate XOR checksum from position 3 to end"""
    checksum = 0
    for i in range(3, len(buffer)):
        checksum ^= buffer[i]
    return checksum

def build_command(payload):
    """Build a complete command packet with checksum"""
    command = bytearray([
        NORMAL_MODE,
        PRODUCT_CODE,
        DEFAULT_ID,
        len(payload) & 0xFF,  # LENGTH_LSB
        0x00                   # LENGTH_MSB
    ])
    
    # Add payload
    command.extend(payload)
    
    # Calculate and add checksum
    checksum = calculate_checksum(command)
    command.append(checksum)
    
    return bytes(command)

def print_hex(data, prefix=""):
    """Print data in hex format"""
    hex_str = ' '.join(f'{b:02X}' for b in data)
    print(f"{prefix}{hex_str}")

def test_serial_communication(port_path, baudrate=115200):
    """Test serial communication with CygLiDAR D1"""
    
    print("="*60)
    print("CygLiDAR D1 Serial Communication Test")
    print("="*60)
    print(f"Port: {port_path}")
    print(f"Baudrate: {baudrate}")
    print()
    
    try:
        # Open serial port
        print("Opening serial port...")
        ser = serial.Serial(
            port=port_path,
            baudrate=baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )
        
        print(f"✓ Port opened: {ser.is_open}")
        time.sleep(0.5)
        
        # Clear any existing data
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        
        # Test 1: Device Info
        print("\n" + "-"*60)
        print("TEST 1: Get Device Info")
        print("-"*60)
        
        cmd_device_info = build_command([CMD_DEVICE_INFO, 0x00])
        print_hex(cmd_device_info, "Sending: ")
        ser.write(cmd_device_info)
        
        time.sleep(0.2)
        
        if ser.in_waiting > 0:
            response = ser.read(ser.in_waiting)
            print(f"Received {len(response)} bytes:")
            print_hex(response, "  ")
            
            # Parse device info if possible
            if len(response) >= 15 and response[0] == 0x5A and response[1] == 0x77:
                hw_version = f"{response[7]}.{response[8]}"
                fw_version = f"{response[9]}.{response[10]}"
                serial_num = ''.join(f'{b:02X}' for b in response[11:15])
                print(f"\n  HW Version: {hw_version}")
                print(f"  FW Version: {fw_version}")
                print(f"  Serial: {serial_num}")
        else:
            print("✗ No response received")
        
        # Test 2: Start 2D Scan
        print("\n" + "-"*60)
        print("TEST 2: Start 2D Scan")
        print("-"*60)
        
        cmd_scan_2d = build_command([CMD_SCAN_2D, 0x00])
        print_hex(cmd_scan_2d, "Sending: ")
        ser.write(cmd_scan_2d)
        
        print("\nListening for scan data (5 seconds)...")
        start_time = time.time()
        packet_count = 0
        total_bytes = 0
        
        while time.time() - start_time < 5:
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting)
                total_bytes += len(data)
                
                # Check for packet header
                if b'\x5a\x77' in data:
                    packet_count += 1
                    if packet_count <= 3:  # Show first 3 packets
                        print(f"\nPacket #{packet_count} ({len(data)} bytes):")
                        print_hex(data[:min(50, len(data))], "  ")
                        if len(data) > 50:
                            print(f"  ... ({len(data) - 50} more bytes)")
            
            time.sleep(0.01)
        
        print(f"\n✓ Received {total_bytes} bytes total in {packet_count} packets")
        
        # Test 3: Stop Scan
        print("\n" + "-"*60)
        print("TEST 3: Stop Scan")
        print("-"*60)
        
        cmd_stop = build_command([CMD_STOP, 0x00])
        print_hex(cmd_stop, "Sending: ")
        ser.write(cmd_stop)
        
        time.sleep(0.2)
        
        # Check if scan stopped
        before = ser.in_waiting
        time.sleep(0.5)
        after = ser.in_waiting
        
        if after == before:
            print("✓ Scan stopped (no new data)")
        else:
            print(f"⚠ Still receiving data ({after - before} new bytes)")
        
        # Close port
        print("\n" + "="*60)
        print("Closing port...")
        ser.close()
        print("✓ Test complete!")
        print("="*60)
        
    except serial.SerialException as e:
        print(f"\n✗ Serial error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Configuration
    PORT = "/dev/cu.usbserial-A5069RR4"  # Change this to your port
    BAUDRATE = 3000000  # Change if needed: 3000000, 921600, 115200, 57600
    
    # Allow command line arguments
    if len(sys.argv) > 1:
        PORT = sys.argv[1]
    if len(sys.argv) > 2:
        BAUDRATE = int(sys.argv[2])
    
    test_serial_communication(PORT, BAUDRATE)

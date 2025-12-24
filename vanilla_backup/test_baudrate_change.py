#!/usr/bin/env python3
"""
CygLiDAR D1 Baudrate Change Test
Tests the baudrate change command with the sensor
"""

import serial
import time
import sys

# Protocol constants
NORMAL_MODE = 0x5A
PRODUCT_CODE = 0x77
DEFAULT_ID = 0xFF
CMD_SET_BAUDRATE = 0x12

# Baudrate modes
BAUDRATE_MAP = {
    0: 3000000,
    1: 921600,
    2: 115200,
    3: 57600
}

BAUDRATE_REVERSE_MAP = {v: k for k, v in BAUDRATE_MAP.items()}

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
        len(payload) & 0xFF,
        0x00
    ])
    command.extend(payload)
    checksum = calculate_checksum(command)
    command.append(checksum)
    return bytes(command)

def print_hex(data, prefix=""):
    """Print data in hex format"""
    hex_str = ' '.join(f'{b:02X}' for b in data)
    print(f"{prefix}{hex_str}")

def test_baudrate_change(port_path, current_baud, target_baud):
    """Test changing baudrate from current to target"""
    
    print("="*70)
    print("CygLiDAR D1 Baudrate Change Test")
    print("="*70)
    print(f"Port: {port_path}")
    print(f"Current Baudrate: {current_baud:,} bps")
    print(f"Target Baudrate:  {target_baud:,} bps")
    print()
    
    # Get baudrate mode
    if target_baud not in BAUDRATE_REVERSE_MAP:
        print(f"✗ Invalid target baudrate! Must be: {list(BAUDRATE_MAP.values())}")
        return False
    
    target_mode = BAUDRATE_REVERSE_MAP[target_baud]
    
    try:
        # Step 1: Connect at current baudrate
        print("STEP 1: Opening port at current baudrate...")
        print("-"*70)
        ser = serial.Serial(
            port=port_path,
            baudrate=current_baud,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )
        print(f"✓ Connected at {current_baud:,} bps")
        time.sleep(0.3)
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        
        # Step 2: Send baudrate change command
        print(f"\nSTEP 2: Sending baudrate change command (mode {target_mode})...")
        print("-"*70)
        cmd_baudrate = build_command([CMD_SET_BAUDRATE, target_mode])
        print_hex(cmd_baudrate, "Command: ")
        ser.write(cmd_baudrate)
        print(f"✓ Command sent")
        
        # Wait for sensor to process
        print("\nWaiting 500ms for sensor to switch baudrate...")
        time.sleep(0.5)
        
        # Step 3: Close current connection
        print("\nSTEP 3: Closing current connection...")
        print("-"*70)
        ser.close()
        print("✓ Port closed")
        
        # Wait before reconnecting
        print("\nWaiting 300ms before reconnecting...")
        time.sleep(0.3)
        
        # Step 4: Reconnect at new baudrate
        print(f"\nSTEP 4: Reconnecting at {target_baud:,} bps...")
        print("-"*70)
        ser = serial.Serial(
            port=port_path,
            baudrate=target_baud,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )
        print(f"✓ Reconnected at {target_baud:,} bps")
        time.sleep(0.3)
        
        # Step 5: Verify with device info request
        print("\nSTEP 5: Verifying with device info request...")
        print("-"*70)
        cmd_device_info = build_command([0x10, 0x00])
        print_hex(cmd_device_info, "Sending: ")
        ser.write(cmd_device_info)
        
        time.sleep(0.3)
        
        if ser.in_waiting > 0:
            response = ser.read(ser.in_waiting)
            print(f"✓ Received {len(response)} bytes:")
            print_hex(response, "  ")
            
            # Parse if valid
            if len(response) >= 15 and response[0] == 0x5A and response[1] == 0x77:
                hw_version = f"{response[7]}.{response[8]}"
                fw_version = f"{response[9]}.{response[10]}"
                serial_num = ''.join(f'{b:02X}' for b in response[11:15])
                print(f"\n  ✓ HW Version: {hw_version}")
                print(f"  ✓ FW Version: {fw_version}")
                print(f"  ✓ Serial: {serial_num}")
                print(f"\n{'='*70}")
                print("SUCCESS! Baudrate changed from {0:,} to {1:,} bps".format(
                    current_baud, target_baud))
                print("="*70)
                success = True
            else:
                print("\n✗ Received data but format unexpected")
                success = False
        else:
            print("\n✗ No response - baudrate change may have failed")
            print("   Sensor might still be at old baudrate")
            success = False
        
        ser.close()
        return success
        
    except serial.SerialException as e:
        print(f"\n✗ Serial error: {e}")
        return False
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def interactive_mode():
    """Interactive mode to get user input"""
    print("="*70)
    print("CygLiDAR D1 Baudrate Change - Interactive Mode")
    print("="*70)
    
    # Get port
    port = input("\nSerial port path (e.g., /dev/tty.usbserial-XXX): ").strip()
    if not port:
        print("✗ Port required!")
        return
    
    # Get current baudrate
    print("\nAvailable baudrates:")
    for mode, baud in sorted(BAUDRATE_MAP.items()):
        print(f"  {mode}: {baud:,} bps")
    
    try:
        current_baud = int(input("\nCurrent baudrate (e.g., 3000000): ").strip())
        target_baud = int(input("Target baudrate (e.g., 115200): ").strip())
    except ValueError:
        print("✗ Invalid baudrate!")
        return
    
    print()
    test_baudrate_change(port, current_baud, target_baud)

if __name__ == "__main__":
    if len(sys.argv) >= 4:
        # Command line mode
        port = sys.argv[1]
        current_baud = int(sys.argv[2])
        target_baud = int(sys.argv[3])
        test_baudrate_change(port, current_baud, target_baud)
    elif len(sys.argv) == 2 and sys.argv[1] in ['-h', '--help']:
        print("Usage:")
        print("  Interactive: python3 test_baudrate_change.py")
        print("  CLI:         python3 test_baudrate_change.py PORT CURRENT_BAUD TARGET_BAUD")
        print()
        print("Example:")
        print("  python3 test_baudrate_change.py /dev/tty.usbserial-XXX 3000000 115200")
        print()
        print("Valid baudrates: 3000000, 921600, 115200, 57600")
    else:
        # Interactive mode
        interactive_mode()

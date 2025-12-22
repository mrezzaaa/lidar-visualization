#!/usr/bin/env python3
"""
Complete LiDAR Test - Step by Step
Tests all commands in sequence
"""

import serial
import time
import sys

def test_complete_sequence(port, baudrate):
    print("="*70)
    print("CygLiDAR D1 Complete Command Sequence Test")
    print("="*70)
    print(f"Port: {port}")
    print(f"Baudrate: {baudrate:,}")
    print()
    
    try:
        # Connect
        print("STEP 1: Connecting...")
        ser = serial.Serial(port, baudrate, timeout=1)
        time.sleep(0.5)
        print("✓ Connected")
        
        # Test 1: Device Info
        print("\nSTEP 2: Get Device Info")
        print("-"*70)
        cmd = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12])
        print("Sending:", ' '.join(f'{b:02X}' for b in cmd))
        ser.write(cmd)
        time.sleep(0.3)
        
        if ser.in_waiting > 0:
            resp = ser.read(ser.in_waiting)
            print(f"✓ RECEIVED {len(resp)} bytes")
            print("  Hex:", resp.hex())
            if len(resp) >= 11:
                print(f"  HW: {resp[7]}.{resp[8]}")
                print(f"  FW: {resp[9]}.{resp[10]}")
        else:
            print("✗ NO RESPONSE to device info")
            print("  => Sensor might be stuck, need power cycle")
            ser.close()
            return False
        
        # Test 2: Start 2D Scan
        print("\nSTEP 3: Start 2D Scan")
        print("-"*70)
        cmd = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03])
        print("Sending:", ' '.join(f'{b:02X}' for b in cmd))
        ser.write(cmd)
        time.sleep(0.2)
        
        # Check for ACK or data
        if ser.in_waiting > 0:
            resp = ser.read(ser.in_waiting)
            print(f"✓ Immediate response: {len(resp)} bytes")
            print("  Hex:", resp[:50].hex())
        
        # Wait for scan data
        print("\nSTEP 4: Waiting for scan data (5 seconds)...")
        print("-"*70)
        start = time.time()
        total_bytes = 0
        packet_count = 0
        
        while time.time() - start < 5:
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting)
                total_bytes += len(data)
                
                if b'\x5a\x77' in data:
                    packet_count += 1
                    if packet_count <= 2:
                        print(f"Packet #{packet_count}: {len(data)} bytes")
                        print("  First 40 hex:", data[:40].hex())
            
            time.sleep(0.01)
        
        if total_bytes > 0:
            print(f"\n✓ SUCCESS! Received {total_bytes:,} bytes in {packet_count} packets")
            print("  => Sensor is working at this baudrate!")
        else:
            print("\n✗ NO DATA RECEIVED")
            print("  => Sensor not sending scan data")
        
        # Test 3: Stop Scan
        print("\nSTEP 5: Stop Scan")
        print("-"*70)
        cmd = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x02, 0x00, 0x00])
        print("Sending:", ' '.join(f'{b:02X}' for b in cmd))
        ser.write(cmd)
        time.sleep(0.2)
        
        # Verify stopped
        before = ser.in_waiting
        time.sleep(0.5)
        after = ser.in_waiting
        
        if after == before:
            print("✓ Scan stopped (no new data)")
        else:
            print(f"⚠ Still receiving data ({after - before} bytes)")
        
        ser.close()
        print("\n" + "="*70)
        print("Test complete!")
        print("="*70)
        return total_bytes > 0
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else "/dev/cu.usbserial-A5069RR4"
    baudrate = int(sys.argv[2]) if len(sys.argv) > 2 else 3000000
    
    success = test_complete_sequence(port, baudrate)
    
    if not success:
        print("\n" + "!"*70)
        print("TROUBLESHOOTING:")
        print("1. Try unplugging and replugging the sensor")
        print("2. Wait 5 seconds after reconnecting")
        print("3. Try baudrate 115200: python3 test_complete.py PORT 115200")
        print("!"*70)

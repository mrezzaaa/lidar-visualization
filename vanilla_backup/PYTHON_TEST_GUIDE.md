# Python Serial Test Guide

## Quick Start

```bash
# Install pyserial if not already installed
pip3 install pyserial

# Run the test (update port and baudrate as needed)
python3 test_lidar_serial.py /dev/tty.usbserial-A5069RR4 3000000
```

## What It Tests

1. **Device Info** - Verifies sensor responds with HW/FW version and serial number
2. **2D Scan** - Starts scan and monitors for incoming data packets
3. **Stop Scan** - Stops scanning and verifies no new data

## Expected Output

### Success:

```
============================================================
CygLiDAR D1 Serial Communication Test
============================================================
Port: /dev/tty.usbserial-A5069RR4
Baudrate: 3000000

Opening serial port...
✓ Port opened: True

------------------------------------------------------------
TEST 1: Get Device Info
------------------------------------------------------------
Sending: 5A 77 FF 02 00 10 00 12
Received 16 bytes:
  5A 77 FF 07 00 10 01 00 02 01 XX XX XX XX XX XX

  HW Version: 1.0
  FW Version: 2.1
  Serial: XXXXXXXX

------------------------------------------------------------
TEST 2: Start 2D Scan
------------------------------------------------------------
Sending: 5A 77 FF 02 00 01 00 03

Listening for scan data (5 seconds)...

Packet #1 (329 bytes):
  5A 77 FF 43 01 01 XX XX XX ...
  ... (279 more bytes)

Packet #2 (329 bytes):
  5A 77 FF 43 01 01 XX XX XX ...
  ... (279 more bytes)

✓ Received 3290 bytes total in 10 packets

------------------------------------------------------------
TEST 3: Stop Scan
------------------------------------------------------------
Sending: 5A 77 FF 02 00 02 00 00
✓ Scan stopped (no new data)

============================================================
Closing port...
✓ Test complete!
============================================================
```

### If Communication Fails:

- **No response to Device Info** → Check port path and baudrate
- **No scan data** → Sensor might not be powered properly or wrong baudrate
- **Garbled data** → Wrong baudrate setting

## Command Line Usage

```bash
# Default (edit script for your port)
python3 test_lidar_serial.py

# Specify port
python3 test_lidar_serial.py /dev/ttyUSB0

# Specify port and baudrate
python3 test_lidar_serial.py /dev/ttyUSB0 115200

# Common baudrates: 3000000, 921600, 115200, 57600
```

## Troubleshooting

### "Permission denied"

```bash
# macOS
sudo chmod 666 /dev/tty.usbserial-*

# Linux
sudo usermod -a -G dialout $USER
# Then logout and login
```

### "Port not found"

```bash
# List available ports
# macOS
ls /dev/tty.*

# Linux
ls /dev/ttyUSB* /dev/ttyACM*
```

### "Module not found: serial"

```bash
pip3 install pyserial
```

## Understanding the Output

### Device Info Response Format:

```
[5A 77 FF] [07 00] [10] [HW_MAJ HW_MIN] [FW_MAJ FW_MIN] [SERIAL×4] [CHECKSUM]
```

### 2D Scan Data Format:

```
[5A 77 FF] [43 01] [01] [DATA×321] [CHECKSUM]
```

- Length: 0x0143 = 323 bytes
- Payload header: 0x01 (2D mode)
- Data: 160 points × 2 bytes = 320 bytes + header

## Next Steps

If this Python test **succeeds** but Node.js app **fails**:

- Issue is in Node.js implementation (packet parsing, event handling)
- Compare hex output from Python vs Node.js logs

If this Python test also **fails**:

- Hardware/connection issue
- Wrong port or baudrate
- Sensor not responding

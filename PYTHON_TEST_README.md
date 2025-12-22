# Python Serial Communication Test ✅

Saya sudah buatkan script Python untuk test komunikasi RX/TX dengan sensor!

## File Created:

- `test_lidar_serial.py` - Main test script
- `PYTHON_TEST_GUIDE.md` - Complete usage guide

## Quick Test:

```bash
# Install dependency
pip3 install pyserial

# Run test (sesuaikan port & baudrate)
python3 test_lidar_serial.py /dev/tty.usbserial-A5069RR4 3000000
```

## What It Does:

1. **Test Device Info** - Get HW/FW version, serial number
2. **Test 2D Scan** - Start scan, monitor packets for 5 seconds
3. **Test Stop** - Stop scan, verify no more data

## Expected Output:

Script akan show:

- ✓ Semua command yang dikirim (hex format)
- ✓ Semua response yang diterima
- ✓ Parsed device info
- ✓ Packet count dan total bytes

## How This Helps:

**Jika Python test BERHASIL tapi Node.js GAGAL:**
→ Problem di Node.js implementation (parsing/events)

**Jika Python test juga GAGAL:**
→ Problem di hardware/connection/baudrate

Silakan test dan share hasilnya! 🎯

import serial
import time

port = "/dev/tty.usbserial-A5069RR4"
baud_current = 3_000_000

# Packet: Set Baud Rate -> 115200 (0xAA)
packet = bytes([
    0x5A, 0x77, 0xFF,  # Header
    0x02, 0x00,       # Payload length
    0x12,             # Payload header (Set Baud Rate)
    0xAA,             # Value = 115200
    0xB8              # Checksum
])

ser = serial.Serial(
    port=port,
    baudrate=baud_current,
    bytesize=serial.EIGHTBITS,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    timeout=1
)

time.sleep(0.5)
ser.write(packet)
ser.flush()
ser.close()

print("Baud rate set to 115200. Device rebooted.")


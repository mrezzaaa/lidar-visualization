````markdown
# CygLiDAR D1 — Knowledge Base

> Reference: CygLiDAR D1 User Manual Ver. 0.2.2
> Sensor: CygLiDAR D1
> Interface: UART TTL 3.3V
> Default Baud Rate: 3,000,000 bps

---

## 1. Overview

CygLiDAR D1 adalah solid-state LiDAR yang dapat menghasilkan:

- 2D distance data
- 3D distance data
- 2D dan 3D secara bergantian dalam Dual Mode

Teknologi pengukuran menggunakan ToF (Time of Flight).

### Measurement

| Mode |        Range | Data   | Resolution                                        | FOV             | Frequency |
| ---- | -----------: | ------ | ------------------------------------------------- | --------------- | --------: |
| 2D   | 200–8,000 mm | 16-bit | Manual menyebut 0.75° dan spesifikasi menyebut 1° | Horizontal 120° |     15 Hz |
| 3D   |  50–2,000 mm | 12-bit | 160 × 60 pixel                                    | H 120°, V 65°   |     15 Hz |

### Hardware

- Size: 37.4 × 37.4 × 24.5 mm
- Weight: 28 g
- Input power: 5V, 500mA
- UART level: TTL 3.3V
- Default baud rate: 3,000,000 bps
- Data bits: 8
- Parity: None
- Stop bits: 1
- Operating temperature: -10°C ~ 50°C
- Environment: Indoor

---

# 2. UART Communication

## Serial Configuration

```text
Baud Rate : 3000000
Data Bits : 8
Parity    : None
Stop Bits : 1
```
````

Default baud rate adalah 3,000,000 bps.

Baud rate yang didukung firmware:

```text
57600
115200
250000
3000000
```

Mapping baud-rate command:

```text
0x39 -> 57,600 bps
0xAA -> 115,200 bps
0x77 -> 250,000 bps
0x55 -> 3,000,000 bps
```

Perubahan baud rate disimpan ke flash ROM dan menyebabkan device reboot.

---

# 3. Pin Mapping

```text
VCC  -> +5V
Rx   -> UART TTL Rx
Tx   -> UART TTL Tx
GND  -> GND
GPIO -> Reserved
```

Untuk koneksi UART host secara umum:

```text
CygLiDAR TX -> Host RX
CygLiDAR RX -> Host TX
CygLiDAR GND -> Host GND
```

Power sensor menggunakan 5V.

UART menggunakan TTL 3.3V.

Jangan memberikan 5V ke pin UART.

---

# 4. Packet Structure

Semua packet menggunakan struktur dasar:

```text
+----------+----------+----------+-------------------+----------+
| Header 1 | Header 2 | Header 3 | Payload Length    | Payload  |
+----------+----------+----------+-------------------+----------+
| 0x5A     | 0x77     | 0xFF     | LSB + MSB         | ...      |
+----------+----------+----------+-------------------+----------+
                                                        |
                                                        v
                                               +----------------+
                                               | Checksum       |
                                               +----------------+
```

Header selalu:

```text
0x5A 0x77 0xFF
```

Setelah header:

```text
Byte 0 : Header 1
Byte 1 : Header 2
Byte 2 : Header 3
Byte 3 : Payload Length LSB
Byte 4 : Payload Length MSB
Byte 5 : Payload Header
Byte 6+ : Payload Data
Last : Checksum
```

Payload Length menggunakan little-endian:

```text
payload_length = LSB | (MSB << 8)
```

---

# 5. Checksum

Checksum adalah XOR dari seluruh byte mulai dari:

```text
Payload Length LSB
```

sampai:

```text
byte sebelum Checksum
```

Header `0x5A 0x77 0xFF` TIDAK termasuk checksum.

Equivalent:

```c
uint8_t CalcChecksum(uint8_t *buff, int buffSize)
{
    uint8_t checksum = 0;

    for (int i = 3; i < buffSize - 1; i++)
    {
        checksum ^= buff[i];
    }

    return checksum;
}
```

Python:

```python
def calc_checksum(packet: bytes) -> int:
    checksum = 0

    for value in packet[3:-1]:
        checksum ^= value

    return checksum
```

Validation:

```python
def validate_checksum(packet: bytes) -> bool:
    if len(packet) < 8:
        return False

    return calc_checksum(packet) == packet[-1]
```

---

# 6. Command Overview

| Command               | Payload Header | Length | Fungsi                                |
| --------------------- | -------------: | -----: | ------------------------------------- |
| Get Device Info       |         `0x10` |      2 | Mendapatkan firmware/hardware version |
| Run 2D Mode           |         `0x01` |      2 | Memulai output 2D                     |
| Run 3D Mode           |         `0x08` |      2 | Memulai output 3D                     |
| Run Dual Mode         |         `0x07` |      2 | Output 2D dan 3D bergantian           |
| Stop                  |         `0x02` |      2 | Kembali ke Idle                       |
| Set 3D Pulse Duration |         `0x0C` |      3 | Mengatur pulse duration               |
| Set Frequency Channel |         `0x0F` |      2 | Mengatur frequency channel            |
| Set Sensitivity       |         `0x11` |      2 | Mengatur sensitivity 2D               |
| Set Baud Rate         |         `0x12` |      2 | Mengubah baud rate                    |

---

# 7. Get Device Info

## Request

```text
5A 77 FF 02 00 10 00 12
```

Struktur:

```text
5A 77 FF
02 00
10
00
12
```

Response:

```text
5A 77 FF 07 00 10
F/W1 F/W2 F/W3
H/W1 H/W2 H/W3
CHECKSUM
```

Contoh response:

```text
F/W = 0.0.1
H/W = 0.2.0
```

Data version:

```text
F/W1 F/W2 F/W3
H/W1 H/W2 H/W3
```

---

# 8. Run 2D Mode

Command:

```text
0x01
```

Request packet:

```text
5A 77 FF 02 00 01 00 03
```

Struktur:

```text
Header       = 5A 77 FF
Length       = 02 00
Payload      = 01 00
Checksum     = 03
```

Setelah command berhasil, sensor mulai mengirim dataset 2D.

Response packet mempunyai format:

```text
5A 77 FF F3 00 01
[2D DATA]
CHECKSUM
```

Manual menyatakan:

```text
Light source : Laser / LED
FOV          : 120°
Range        : 200 ~ 8,000 mm
Data Type    : 16 bit
```

Error code:

```text
16000 = Limit for valid data
16001 = Low Amplitude
16002 = ADC Overflow
16003 = Saturation
16004 = Bad Pixel
```

---

# 9. Important Note — 2D Data Length

Packet 2D pada manual menunjukkan:

```text
Payload Length = 0x00F3
```

Artinya:

```text
0x00F3 = 243 bytes
```

Karena:

```text
1 byte = Payload Header
```

maka data payload yang tersisa:

```text
243 - 1 = 242 bytes
```

Dengan data 16-bit:

```text
242 / 2 = 121 values
```

Jadi packet format yang ditampilkan manual secara matematis menghasilkan:

```text
121 × uint16
```

Namun manual juga menyebut sequence:

```text
-60° sampai +60°
Resolution = 0.75°
```

yang secara matematis menghasilkan:

```text
161 angle positions
```

Manual memiliki ketidaksesuaian antara keterangan resolusi/angle dan payload length.

Implementasi parser SEBAIKNYA menggunakan `Payload Length` sebagai sumber kebenaran untuk menentukan jumlah data, bukan hard-code `161`.

Contoh:

```python
data_length = payload_length - 1
sample_count = data_length // 2
```

Jika firmware/hardware aktual menghasilkan jumlah sample berbeda, gunakan packet aktual sebagai source of truth.

---

# 10. Parsing 2D Data

Format:

```text
5A 77 FF
LEN_LSB LEN_MSB
01
DATA0_LSB DATA0_MSB
DATA1_LSB DATA1_MSB
...
DATAn_LSB DATAn_MSB
CHECKSUM
```

Data adalah unsigned 16-bit.

Parsing:

```python
distance = data_lsb | (data_msb << 8)
```

Contoh:

```text
DC 05
```

menjadi:

```text
0x05DC
= 1500
```

Jadi:

```text
DC 05 -> 1500 mm
```

---

# 11. Run 3D Mode

Command:

```text
0x08
```

Request:

```text
5A 77 FF 02 00 08 00 0A
```

Response header:

```text
5A 77 FF 41 38 08
[3D DATA]
CHECKSUM
```

Payload Length:

```text
0x3841
```

Decimal:

```text
14401 bytes
```

Payload terdiri dari:

```text
1 byte  -> Payload Header
14400   -> 3D Data
```

3D resolution:

```text
160 × 60
```

Total pixel:

```text
160 × 60 = 9600 pixels
```

Data type:

```text
12-bit
```

Karena:

```text
9600 × 12 bit
= 115200 bit
= 14400 bytes
```

Maka ukuran packet konsisten:

```text
Payload Header = 1 byte
3D Data        = 14400 bytes
Payload Length = 14401 bytes = 0x3841
```

---

# 12. 3D Data Layout

3D data berbentuk matrix:

```text
160 columns × 60 rows
```

Representasi:

```text
R0:
C0 C1 C2 C3 ... C159

R1:
C0 C1 C2 C3 ... C159

...

R59:
C0 C1 C2 C3 ... C159
```

Pixel:

```text
R0C0
R0C1
R0C2
...
R59C159
```

Total:

```text
9600 values
```

FOV:

```text
Horizontal = 120°
Vertical   = 65°
```

Range:

```text
50 ~ 2,000 mm
```

---

# 13. 3D 12-bit Packing

3D menggunakan 12-bit per pixel.

Dua nilai 12-bit dikemas menjadi 3 byte.

Misalnya:

```text
A = 0x5DC = 1500
B = 0x7D0 = 2000
```

Packet bytes:

```text
5D C7 D0
```

Encoding:

```text
byte0 = A >> 4

byte1 = ((A & 0x0F) << 4) | (B >> 8)

byte2 = B & 0xFF
```

Decoding:

```python
A = (byte0 << 4) | (byte1 >> 4)

B = ((byte1 & 0x0F) << 8) | byte2
```

Contoh:

```text
5D C7 D0

A:
0x5D << 4
    = 0x5D0

0xC7 >> 4
    = 0x0C

A:
0x5D0 | 0x0C
= 0x5DC
= 1500 mm

B:
0xC7 & 0x0F
= 0x07

0x07 << 8
= 0x700

0xD0
= 0xD0

B:
0x700 | 0xD0
= 0x7D0
= 2000 mm
```

---

# 14. 3D Parser

Python:

```python
def unpack_12bit(data: bytes) -> list[int]:
    values = []

    i = 0

    while i + 2 < len(data):
        b0 = data[i]
        b1 = data[i + 1]
        b2 = data[i + 2]

        value_a = (b0 << 4) | (b1 >> 4)
        value_b = ((b1 & 0x0F) << 8) | b2

        values.append(value_a)
        values.append(value_b)

        i += 3

    return values
```

Untuk CygLiDAR D1:

```python
pixels = unpack_12bit(data)

assert len(pixels) == 9600

frame = [
    pixels[row * 160:(row + 1) * 160]
    for row in range(60)
]
```

Akses pixel:

```python
distance = frame[row][column]
```

Contoh:

```python
distance = frame[10][50]
print(distance, "mm")
```

---

# 15. 3D Error Values

3D menggunakan 12-bit sehingga nilai error berada di area atas range 12-bit.

```text
4080 = Limit for valid data
4081 = Low amplitude
4082 = ADC Overflow
4083 = Saturation
```

Contoh:

```python
ERROR_CODES_3D = {
    4080: "LIMIT_FOR_VALID_DATA",
    4081: "LOW_AMPLITUDE",
    4082: "ADC_OVERFLOW",
    4083: "SATURATION",
}
```

Valid distance sebaiknya tidak langsung dianggap valid hanya karena nilainya berada dalam `0..4095`.

Gunakan error code di atas sebagai invalid/error measurement.

IMPLEMENTATION NOTE — HARDWARE-OBSERVED SENTINEL PATTERN:
Live scans from the D1 unit show additional out-of-FOV / no-return fill values
beyond the documented 4080-4083 error codes. These fill values share a common
pattern: their hexadecimal representation ends in `F` (low nibble = 0xF).
Observed sentinels include: 3871 (0xF1F), 2303 (0x8FF), 511 (0x1FF), 2191 (0x88F).
Real measured depths never exhibit low nibble F, so rejecting `(value & 0xF) === 0xF`
is a safe and effective way to drop these sentinels without clipping real data.
See unit test: `test_3d_unpack.js`.

---

# 16. Run Dual Mode

Command:

```text
0x07
```

Request:

```text
5A 77 FF 02 00 07 00 05
```

Setelah Dual Mode aktif, device mengirim:

```text
2D
3D
2D
3D
...
```

Response 2D:

```text
5A 77 FF F3 00 01
[2D DATA]
CHECKSUM
```

Response 3D:

```text
5A 77 FF 41 38 08
[3D DATA]
CHECKSUM
```

Jadi parser Dual Mode harus membedakan frame berdasarkan:

```text
Payload Header
```

atau:

```text
0x01 -> 2D
0x08 -> 3D
```

---

# 17. Stop

Command:

```text
0x02
```

Request:

```text
5A 77 FF 02 00 02 00 00
```

Setelah Stop, device kembali ke:

```text
Idle
```

Pada Idle device tidak melakukan measurement.

---

# 18. Generic Packet Builder

Python:

```python
HEADER = bytes([0x5A, 0x77, 0xFF])


def build_packet(payload: bytes) -> bytes:
    payload_length = len(payload)

    packet = bytearray()

    packet.extend(HEADER)
    packet.append(payload_length & 0xFF)
    packet.append((payload_length >> 8) & 0xFF)
    packet.extend(payload)

    checksum = 0

    # Checksum starts from payload-length LSB,
    # therefore packet[3:] excluding checksum.
    for byte in packet[3:]:
        checksum ^= byte

    packet.append(checksum)

    return bytes(packet)
```

Command:

```python
CMD_GET_DEVICE_INFO = 0x10
CMD_RUN_2D = 0x01
CMD_RUN_3D = 0x08
CMD_RUN_DUAL = 0x07
CMD_STOP = 0x02
```

Build command:

```python
packet = build_packet(bytes([
    CMD_RUN_2D,
    0x00,
]))
```

Hasil:

```text
5A 77 FF 02 00 01 00 03
```

---

# 19. Serial Python Example

Install:

```bash
pip install pyserial
```

Basic communication:

```python
import serial


PORT = "/dev/ttyUSB0"
BAUDRATE = 3_000_000


ser = serial.Serial(
    port=PORT,
    baudrate=BAUDRATE,
    bytesize=serial.EIGHTBITS,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    timeout=1,
)


def send_command(payload: bytes):
    packet = build_packet(payload)

    print("TX:", packet.hex(" "))

    ser.write(packet)
    ser.flush()


# Start 2D
send_command(bytes([0x01, 0x00]))


while True:
    data = ser.read(4096)

    if data:
        print("RX:", data.hex(" "))
```

---

# 20. Generic Frame Parser

Jangan melakukan parsing berdasarkan `read()` size.

UART adalah stream.

Satu frame dapat:

- terpecah menjadi beberapa `read()`
- beberapa frame masuk dalam satu `read()`

Karena itu gunakan buffer.

```python
HEADER = bytes([0x5A, 0x77, 0xFF])


class CygLiDARParser:

    def __init__(self):
        self.buffer = bytearray()

    def feed(self, data: bytes):
        self.buffer.extend(data)

        frames = []

        while True:

            # Find header
            index = self.buffer.find(HEADER)

            if index < 0:
                # Keep only enough bytes for possible partial header
                if len(self.buffer) > 2:
                    del self.buffer[:-2]

                break

            # Remove garbage before header
            if index > 0:
                del self.buffer[:index]

            # Need:
            # Header 3
            # Length 2
            # At least checksum 1
            if len(self.buffer) < 6:
                break

            payload_length = (
                self.buffer[3]
                | (self.buffer[4] << 8)
            )

            frame_length = (
                3 +       # Header
                2 +       # Payload Length
                payload_length +
                1         # Checksum
            )

            if len(self.buffer) < frame_length:
                break

            frame = bytes(self.buffer[:frame_length])

            del self.buffer[:frame_length]

            if not self.validate_checksum(frame):
                continue

            frames.append(self.parse_frame(frame))

        return frames

    @staticmethod
    def validate_checksum(frame: bytes) -> bool:
        checksum = 0

        for value in frame[3:-1]:
            checksum ^= value

        return checksum == frame[-1]

    @staticmethod
    def parse_frame(frame: bytes):
        payload_length = (
            frame[3]
            | (frame[4] << 8)
        )

        payload = frame[5:5 + payload_length]

        payload_header = payload[0]
        payload_data = payload[1:]

        if payload_header == 0x01:
            mode = "2D"

        elif payload_header == 0x08:
            mode = "3D"

        else:
            mode = "UNKNOWN"

        return {
            "mode": mode,
            "payload_length": payload_length,
            "payload_header": payload_header,
            "data": payload_data,
            "raw": frame,
        }
```

---

# 21. Parsing Frame Berdasarkan Mode

```python
parser = CygLiDARParser()

while True:

    chunk = ser.read(4096)

    if not chunk:
        continue

    frames = parser.feed(chunk)

    for frame in frames:

        if frame["mode"] == "2D":
            distances = parse_2d(frame["data"])

            print(
                "2D:",
                len(distances),
                "samples"
            )

        elif frame["mode"] == "3D":
            distances = unpack_12bit(frame["data"])

            print(
                "3D:",
                len(distances),
                "pixels"
            )
```

2D parser:

```python
def parse_2d(data: bytes) -> list[int]:

    if len(data) % 2 != 0:
        raise ValueError(
            f"Invalid 2D data length: {len(data)}"
        )

    distances = []

    for i in range(0, len(data), 2):

        distance = (
            data[i]
            | (data[i + 1] << 8)
        )

        distances.append(distance)

    return distances
```

---

# 22. Complete Python Skeleton

```python
import serial


HEADER = bytes([0x5A, 0x77, 0xFF])

PORT = "/dev/ttyUSB0"
BAUDRATE = 3_000_000


def build_packet(payload: bytes) -> bytes:

    length = len(payload)

    packet = bytearray([
        0x5A,
        0x77,
        0xFF,
        length & 0xFF,
        (length >> 8) & 0xFF,
    ])

    packet.extend(payload)

    checksum = 0

    for value in packet[3:]:
        checksum ^= value

    packet.append(checksum)

    return bytes(packet)


def parse_2d(data: bytes):

    if len(data) % 2 != 0:
        raise ValueError("Invalid 2D payload")

    values = []

    for i in range(0, len(data), 2):

        value = (
            data[i]
            | (data[i + 1] << 8)
        )

        values.append(value)

    return values


def unpack_12bit(data: bytes):

    values = []

    for i in range(0, len(data), 3):

        if i + 2 >= len(data):
            break

        b0 = data[i]
        b1 = data[i + 1]
        b2 = data[i + 2]

        value_a = (
            (b0 << 4)
            | (b1 >> 4)
        )

        value_b = (
            ((b1 & 0x0F) << 8)
            | b2
        )

        values.append(value_a)
        values.append(value_b)

    return values


def validate_checksum(frame: bytes):

    checksum = 0

    for value in frame[3:-1]:
        checksum ^= value

    return checksum == frame[-1]


class CygLiDARParser:

    def __init__(self):
        self.buffer = bytearray()

    def feed(self, chunk: bytes):

        self.buffer.extend(chunk)

        results = []

        while True:

            index = self.buffer.find(HEADER)

            if index < 0:

                if len(self.buffer) > 2:
                    del self.buffer[:-2]

                break

            if index > 0:
                del self.buffer[:index]

            if len(self.buffer) < 6:
                break

            payload_length = (
                self.buffer[3]
                | (self.buffer[4] << 8)
            )

            frame_length = (
                3
                + 2
                + payload_length
                + 1
            )

            if len(self.buffer) < frame_length:
                break

            frame = bytes(
                self.buffer[:frame_length]
            )

            del self.buffer[:frame_length]

            if not validate_checksum(frame):
                continue

            payload = frame[
                5:5 + payload_length
            ]

            if len(payload) < 1:
                continue

            payload_header = payload[0]
            data = payload[1:]

            if payload_header == 0x01:

                distances = parse_2d(data)

                results.append({
                    "mode": "2D",
                    "distances": distances,
                    "raw": frame,
                })

            elif payload_header == 0x08:

                distances = unpack_12bit(data)

                results.append({
                    "mode": "3D",
                    "distances": distances,
                    "raw": frame,
                })

            else:

                results.append({
                    "mode": "UNKNOWN",
                    "payload_header": payload_header,
                    "data": data,
                    "raw": frame,
                })

        return results


def main():

    ser = serial.Serial(
        port=PORT,
        baudrate=BAUDRATE,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=1,
    )

    parser = CygLiDARParser()

    # Run Dual Mode
    command = build_packet(
        bytes([0x07, 0x00])
    )

    print("TX:", command.hex(" "))

    ser.write(command)
    ser.flush()

    while True:

        chunk = ser.read(4096)

        if not chunk:
            continue

        frames = parser.feed(chunk)

        for frame in frames:

            if frame["mode"] == "2D":

                print(
                    "2D samples:",
                    len(frame["distances"])
                )

                print(
                    frame["distances"]
                )

            elif frame["mode"] == "3D":

                print(
                    "3D pixels:",
                    len(frame["distances"])
                )

                # Expected:
                # 160 x 60 = 9600 pixels

                if len(frame["distances"]) == 9600:

                    image = [
                        frame["distances"][
                            row * 160:
                            (row + 1) * 160
                        ]
                        for row in range(60)
                    ]

                    print(
                        "3D frame: 160 x 60"
                    )


if __name__ == "__main__":
    main()
```

---

# 23. Command Packet Reference

## Get Device Info

```text
5A 77 FF 02 00 10 00 12
```

## Run 2D

```text
5A 77 FF 02 00 01 00 03
```

## Run 3D

```text
5A 77 FF 02 00 08 00 0A
```

## Run Dual

```text
5A 77 FF 02 00 07 00 05
```

## Stop

```text
5A 77 FF 02 00 02 00 00
```

## Set Frequency Channel

Payload:

```text
0x0F
```

Format:

```text
5A 77 FF 02 00 0F CHANNEL CHECKSUM
```

Available channels:

```text
0x00 -> Channel 0
0x01 -> Channel 1
...
0x0F -> Channel 15
```

CygLiDAR D1 menyediakan 16 frequency channels.

---

# 24. Set Sensitivity

Command:

```text
0x11
```

Format:

```text
5A 77 FF 02 00 11 VALUE CHECKSUM
```

Default:

```text
20
```

Manual Viewer menyediakan range:

```text
10 ~ 100
```

Effect:

```text
Lower sensitivity:
    - longer possible detection range
    - higher measurement error

Higher sensitivity:
    - more accurate measurement
    - shorter possible detection range
```

---

# 25. Set 3D Pulse Duration

Command:

```text
0x0C
```

Format:

```text
5A 77 FF 03 00 0C LSB MSB CHECKSUM
```

Adjustable duration:

```text
0 ~ 10,000 us
```

Mode:

```text
00 -> 3D Auto
01 -> 3D Fixed
10 -> Dual Auto
11 -> Dual Fixed
```

Jika Fixed, pulse duration menggunakan 14 bit setelah bit ke-2 sesuai format device.

Contoh manual:

```text
3D / Fixed / Runtime Value = 6000
```

---

# 26. Frequency Channel

Frequency channel digunakan untuk mengurangi interference ketika terdapat lebih dari satu LiDAR yang mengukur area yang sama.

Available:

```text
Channel 0  -> 0x00
Channel 1  -> 0x01
Channel 2  -> 0x02
...
Channel 15 -> 0x0F
```

Jika menggunakan beberapa CygLiDAR D1 dalam area yang sama, channel dapat dibuat berbeda.

---

# 27. Device State

Basic lifecycle:

```text
             +-------+
             | Idle  |
             +---+---+
                 |
                 | Run 2D
                 v
             +-------+
             |  2D   |
             +---+---+
                 |
                 | Stop
                 v
             +-------+
             | Idle  |
             +-------+
```

3D:

```text
Idle
 |
 +-- Run 3D --> 3D
 |
 +-- Run Dual -> 2D <-> 3D
 |
 +-- Stop ----> Idle
```

---

# 28. Recommended Software Architecture

Jangan mencampur serial I/O dengan decoding data.

Gunakan layer:

```text
Serial Port
    |
    v
Byte Stream
    |
    v
Frame Parser
    |
    v
Checksum Validation
    |
    v
Payload Decoder
    |
    +---- 2D Decoder
    |
    +---- 3D Decoder
    |
    +---- Dual Mode
    |
    v
Application Data
```

Recommended modules:

```text
cyglidar/
├── serial.py
├── protocol.py
├── parser.py
├── decoder_2d.py
├── decoder_3d.py
└── constants.py
```

---

# 29. Constants

Recommended:

```python
HEADER_1 = 0x5A
HEADER_2 = 0x77
HEADER_3 = 0xFF

MODE_2D = 0x01
MODE_3D = 0x08
MODE_DUAL = 0x07

CMD_GET_DEVICE_INFO = 0x10
CMD_RUN_2D = 0x01
CMD_RUN_3D = 0x08
CMD_RUN_DUAL = 0x07
CMD_STOP = 0x02
CMD_SET_3D_PULSE = 0x0C
CMD_SET_FREQUENCY = 0x0F
CMD_SET_SENSITIVITY = 0x11
CMD_SET_BAUDRATE = 0x12

BAUDRATE_DEFAULT = 3_000_000

WIDTH_3D = 160
HEIGHT_3D = 60
PIXELS_3D = WIDTH_3D * HEIGHT_3D

RANGE_2D_MIN_MM = 200
RANGE_2D_MAX_MM = 8000

RANGE_3D_MIN_MM = 50
RANGE_3D_MAX_MM = 2000

ERROR_2D_LIMIT = 16000
ERROR_2D_LOW_AMPLITUDE = 16001
ERROR_2D_ADC_OVERFLOW = 16002
ERROR_2D_SATURATION = 16003
ERROR_2D_BAD_PIXEL = 16004

ERROR_3D_LIMIT = 4080
ERROR_3D_LOW_AMPLITUDE = 4081
ERROR_3D_ADC_OVERFLOW = 4082
ERROR_3D_SATURATION = 4083
```

---

# 30. Important Implementation Rules

## Rule 1 — Jangan hard-code frame size

Gunakan:

```python
payload_length = (
    buffer[3]
    | (buffer[4] << 8)
)
```

Kemudian:

```python
frame_length = 3 + 2 + payload_length + 1
```

---

## Rule 2 — Selalu validasi header

Valid header:

```text
5A 77 FF
```

---

## Rule 3 — Selalu validasi checksum

Jangan decode frame sebelum checksum valid.

```python
if not validate_checksum(frame):
    discard()
```

---

## Rule 4 — UART adalah stream

Jangan berasumsi:

```python
ser.read(14407)
```

selalu menghasilkan satu frame.

Gunakan persistent buffer dan frame parser.

---

## Rule 5 — Gunakan Payload Header untuk menentukan decoder

```text
0x01 -> 2D
0x08 -> 3D
```

Ini sangat penting pada Dual Mode.

---

## Rule 6 — 3D menggunakan 12-bit packed data

Jangan membaca 3D sebagai:

```python
uint16
```

3D harus di-unpack dari:

```text
3 bytes -> 2 × 12-bit values
```

---

## Rule 7 — 3D expected size

```text
160 × 60
= 9600 pixels
```

Data:

```text
9600 × 12 bit
= 14400 bytes
```

Payload:

```text
1 byte header
+ 14400 bytes data
= 14401 bytes
= 0x3841
```

---

# 31. Debugging Checklist

Jika tidak menerima data:

```text
[ ] Power = 5V
[ ] GND tersambung
[ ] UART menggunakan TTL 3.3V
[ ] TX/RX wiring benar
[ ] Baud rate = 3000000
[ ] Data bits = 8
[ ] Parity = None
[ ] Stop bits = 1
[ ] Header = 5A 77 FF
[ ] Command checksum benar
[ ] Sensor sudah keluar dari Idle
[ ] Serial device/COM port benar
```

Jika menerima garbage:

```text
[ ] Cek baud rate
[ ] Cek TTL voltage
[ ] Cek TX/RX
[ ] Cek apakah device menggunakan baud rate berbeda
[ ] Cek frame synchronization
[ ] Cek checksum
```

Jika frame valid tetapi distance salah:

```text
[ ] Pastikan mode 2D/3D benar
[ ] Pastikan 2D menggunakan uint16
[ ] Pastikan 3D menggunakan 12-bit unpacking
[ ] Cek error codes
[ ] Jangan menganggap semua nilai sebagai valid distance
```

---

# 32. Linux / USB Serial

Manual menunjukkan USB-to-Serial menggunakan Prolific PL2303.

Check device:

```bash
lsusb
```

Contoh:

```text
Bus 001 Device 005:
ID 067b:2303 Prolific Technology, Inc. PL2303 Serial Port
```

Linux module:

```bash
sudo modprobe usbserial \
    vendor=0x067b \
    product=0x2303
```

Check device:

```bash
dmesg
```

Typical serial device:

```text
/dev/ttyUSB0
```

---

# 33. CygLiDAR Viewer

Official viewer dapat digunakan untuk memverifikasi sensor sebelum melakukan implementasi software sendiri.

Basic configuration:

```text
Device Model : CygLiDAR D1
Baud Rate    : 3,000,000
Serial Port  : COMx / ttyUSBx
```

Viewer mendukung:

```text
2D visualization
3D flat image
3D point cloud
```

Viewer juga dapat mengatur:

```text
3D Pulse Duration
Frequency Channel
Sensitivity
Color Scheme
Baud Rate
```

---

# 34. ROS Driver

Manual menyediakan ROS driver:

```text
https://github.com/CygLiDAR-ROS/cyglidar_d1
```

Clone:

```bash
git clone https://github.com/CygLiDAR-ROS/cyglidar_d1.git
```

Gunakan ROS driver sebagai referensi implementasi jika membutuhkan integrasi ROS.

---

# 35. Minimal Protocol Reference

```text
HEADER
------
5A 77 FF


REQUEST
-------
5A 77 FF
LEN_LSB LEN_MSB
PAYLOAD
CHECKSUM


2D
--
Payload Header = 01
Data = uint16
Range = 200 ~ 8000 mm


3D
--
Payload Header = 08
Resolution = 160 x 60
Data = 12-bit packed
Range = 50 ~ 2000 mm


DUAL
----
2D frame
3D frame
2D frame
3D frame
...


CHECKSUM
--------
XOR(
    payload_length_lsb,
    payload_length_msb,
    payload_header,
    payload_data...
)
```

---

# 36. Known Manual Inconsistency

Manual Ver. 0.2.2 mempunyai satu hal yang perlu diperhatikan pada 2D:

```text
Page 4:
2D resolution = 1°

Page 9:
2D resolution = 0.75°
Sequence = -60° ... +60°

Response:
Payload Length = 0xF3 = 243 bytes

Dengan:
1 byte Payload Header
+ 242 bytes data
+ 16-bit/sample

=> 121 samples
```

Sementara:

```text
-60° ... +60°
dengan interval 0.75°
=> 161 positions
```

Karena terdapat ketidaksesuaian tersebut:

```text
JANGAN:
    hard-code 161 samples

LAKUKAN:
    baca Payload Length
    kurangi 1 byte Payload Header
    bagi 2 untuk mendapatkan jumlah 2D samples
```

Untuk 3D tidak terdapat masalah ukuran yang sama:

```text
160 × 60 = 9600 pixels
9600 × 12 bit = 14400 bytes
Payload Header = 1 byte
Payload Length = 14401 = 0x3841
```

---

# 37. Core Knowledge Summary

Jika hanya membutuhkan informasi paling penting:

```text
Sensor:
    CygLiDAR D1

Interface:
    UART TTL 3.3V

Power:
    5V / 500mA

Default Baud:
    3,000,000

UART:
    8N1

Header:
    5A 77 FF

Packet:
    Header
    + Payload Length LSB
    + Payload Length MSB
    + Payload Header
    + Payload Data
    + Checksum

Checksum:
    XOR dari byte index 3 sampai byte sebelum checksum

2D:
    Payload Header = 01
    Data = 16-bit
    Range = 200–8000 mm

3D:
    Payload Header = 08
    Resolution = 160 × 60
    Data = 12-bit packed
    Range = 50–2000 mm

Dual:
    Payload Header 01 dan 08 bergantian

2D Request:
    5A 77 FF 02 00 01 00 03

3D Request:
    5A 77 FF 02 00 08 00 0A

Dual Request:
    5A 77 FF 02 00 07 00 05

Stop:
    5A 77 FF 02 00 02 00 00

Get Device Info:
    5A 77 FF 02 00 10 00 12
```

---

# 38. Source

Primary reference:

```text
CygLiDAR D1 User Manual
Version 0.2.2
Cygbot
```

---

# 39. HARDWARE-OBSERVED: 3D Range Exceeds Manual

The manual (§11/§12/§29/§37) lists the 3D range as **50–2000 mm**. The D1
unit actually in use returns **valid depth up to ~4079 mm**: live scans show
coherent surfaces at ~2200 mm (a smooth gradient, not random bytes) and peak
readings at 4066 mm. The value 4080+ is still the error-code region
(`4080` = limit, `4081–4083` = low-amplitude / ADC-overflow / saturation).

Implementation consequence (verified on hardware, not the manual):

- The 3D decoder renders every distance in `[50, 4080)`. The previous
  `MAX_RANGE = 2000` clip discarded the bulk of the scene (walls/floor beyond
  2 m), leaving only sparse near-field pixels → the point cloud looked like a
  random ball/half-shell instead of room geometry.
- The Depth Map Preview uses the same `[50, 4080)` range.

If a different unit truly caps at 2000 mm, lower `MAX_RANGE` in
`Parser.computePointDepthCamera` and `MAX_DEPTH` in `DepthMapPreview.tsx`.

The 12-bit packing, frame length (14407 B), header sync (`5A 77 FF 41 38 08`),
and row-major 160×60 layout all match the manual exactly — only the *range*
ceiling differs from the documented value for this hardware.

Relevant sections:

```text
Section 2  - Specification
Section 5  - How to Use
Section 6  - Serial Communication
Section 7  - Verification & Install
Section 8  - CygLiDAR Viewer
Section 9  - CygLiDAR ROS Driver
```

```

```

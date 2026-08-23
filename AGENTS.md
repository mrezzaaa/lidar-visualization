````markdown
# AGENTS.md

## Project Context

This project integrates and processes data from the **CygLiDAR D1 2D/3D Dual LiDAR**.

The primary hardware reference is:

```text
CygLiDAR D1 User Manual
Version 0.2.2
Cygbot
```
````

All implementation involving the LiDAR communication protocol MUST use the documented protocol as the primary source of truth.

---

# 1. Source of Truth

The following priority MUST be followed:

1. CygLiDAR D1 User Manual Ver. 0.2.2
2. `KNOWLEDGE.md`
3. Existing implementation and tests
4. General technical knowledge

Do not silently replace documented behavior with assumptions from other LiDAR devices.

If the manual does not define a behavior, mark it as:

```text
UNDEFINED BY MANUAL
```

Do not invent protocol behavior.

---

# 2. Knowledge Base

The main protocol reference is:

```text
KNOWLEDGE.md
```

Before modifying any CygLiDAR communication, parser, decoder, or protocol code:

1. Read `KNOWLEDGE.md`.
2. Identify the relevant packet/command.
3. Follow the documented packet structure.
4. Preserve the documented byte ordering.
5. Preserve checksum behavior.
6. Validate implementation against actual packet examples.

---

# 3. Hardware Configuration

CygLiDAR D1 uses:

```text
Interface : UART TTL 3.3V
Baud Rate : 3,000,000 bps
Data Bits : 8
Parity    : None
Stop Bits : 1
Power     : 5V / 500mA
```

Default serial configuration:

```text
3000000 8N1
```

Do not change the default baud rate unless the application explicitly requires it.

Do not treat the UART interface as 5V TTL.

---

# 4. Protocol Header

Every valid packet starts with:

```text
5A 77 FF
```

These three bytes are mandatory synchronization bytes.

The parser MUST search for:

```text
0x5A 0x77 0xFF
```

before attempting to decode a frame.

---

# 5. Packet Structure

The canonical packet structure is:

```text
Header 1
Header 2
Header 3
Payload Length LSB
Payload Length MSB
Payload Header
Payload Data
Checksum
```

Byte layout:

```text
[0] = 0x5A
[1] = 0x77
[2] = 0xFF
[3] = Payload Length LSB
[4] = Payload Length MSB
[5] = Payload Header
[6...] = Payload Data
[last] = Checksum
```

Payload length is little-endian:

```text
payload_length = buffer[3] | (buffer[4] << 8)
```

Complete frame length:

```text
frame_length = 3 + 2 + payload_length + 1
```

Never hard-code a frame size when the packet provides a payload length.

---

# 6. Checksum

Checksum is calculated using XOR.

The checksum calculation starts at:

```text
buffer[3]
```

and ends immediately before the checksum byte.

The header:

```text
5A 77 FF
```

is NOT included.

Equivalent implementation:

```python
checksum = 0

for value in packet[3:-1]:
    checksum ^= value
```

A frame MUST NOT be decoded before checksum validation.

Invalid checksum:

```text
discard frame
```

Do not attempt to decode potentially corrupted distance data.

---

# 7. UART Is a Byte Stream

Never assume one `read()` call equals one LiDAR frame.

The following situations are valid:

```text
read() -> partial frame
read() -> complete frame
read() -> multiple frames
```

The serial layer MUST therefore use a persistent receive buffer.

Required architecture:

```text
UART
 |
 v
Byte Stream
 |
 v
Receive Buffer
 |
 v
Header Synchronization
 |
 v
Payload Length
 |
 v
Complete Frame Detection
 |
 v
Checksum Validation
 |
 v
Payload Decoder
```

---

# 8. Frame Synchronization

The parser MUST recover from garbage or corrupted bytes.

Algorithm:

```text
1. Search for 5A 77 FF.
2. Discard bytes before the header.
3. Wait until at least 5 bytes are available.
4. Read payload length.
5. Calculate expected frame length.
6. Wait until the complete frame is available.
7. Validate checksum.
8. Decode.
9. Remove the processed frame from the buffer.
10. Continue parsing.
```

Do not assume the stream starts at byte zero.

---

# 9. Payload Headers

Payload Header identifies the measurement data type.

Known values:

```text
0x01 -> 2D
0x08 -> 3D
```

In Dual Mode, 2D and 3D frames are sent alternately.

The decoder MUST inspect the payload header instead of assuming the next frame type.

---

# 10. Commands

Supported documented commands:

```text
0x10 -> Get Device Info
0x01 -> Run 2D Mode
0x08 -> Run 3D Mode
0x07 -> Run Dual Mode
0x02 -> Stop
0x0C -> Set 3D Light Pulse Duration
0x0F -> Set Frequency Channel
0x11 -> Set Sensitivity
0x12 -> Set Baud Rate
```

Command packets MUST be constructed using the generic packet builder.

Do not manually duplicate checksum logic in every command.

Recommended:

```python
build_packet(payload)
```

---

# 11. Command Packet Examples

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

These packet examples MUST remain unchanged unless verified against a newer official protocol specification.

---

# 12. 2D Data

2D measurement characteristics:

```text
Range      : 200–8,000 mm
Data Type  : 16-bit
FOV        : 120°
Frequency  : 15 Hz
```

2D values are unsigned 16-bit values.

Decode:

```python
distance = data_lsb | (data_msb << 8)
```

Example:

```text
DC 05 -> 0x05DC -> 1500 mm
```

---

# 13. 2D Error Codes

Known 2D error codes:

```text
16000 -> Limit for valid data
16001 -> Low Amplitude
16002 -> ADC Overflow
16003 -> Saturation
16004 -> Bad Pixel
```

Error values MUST NOT automatically be treated as normal distance measurements.

Recommended representation:

```python
{
    "distance_mm": None,
    "error": "LOW_AMPLITUDE"
}
```

rather than returning the error value as a physical distance.

---

# 14. 2D Resolution Discrepancy

The CygLiDAR D1 manual contains inconsistent 2D resolution information.

Specification section:

```text
1°
```

Serial communication section:

```text
0.75°
```

The manual also describes:

```text
-60° to +60°
```

The documented payload example produces:

```text
0xF3 = 243 bytes
```

After one payload-header byte:

```text
242 data bytes
```

At 16-bit per sample:

```text
121 samples
```

Therefore implementation MUST NOT hard-code:

```text
161 samples
```

based only on:

```text
-60° to +60° at 0.75°
```

The actual packet payload length MUST be treated as authoritative for the number of samples.

---

# 15. 3D Data

3D measurement characteristics:

```text
Range      : 50–2,000 mm
Resolution : 160 × 60
FOV        : Horizontal 120°
FOV        : Vertical 65°
Data Type  : 12-bit
Frequency  : 15 Hz
```

Total pixels:

```text
160 × 60 = 9,600
```

---

# 16. 3D Data Packing

3D data is packed using 12-bit values.

Two 12-bit values are stored in three bytes.

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

Never parse 3D data as a normal `uint16` array.

---

# 17. 3D Frame Size

For 9,600 pixels:

```text
9,600 × 12 bits
= 115,200 bits
= 14,400 bytes
```

Plus one payload-header byte:

```text
14,401 bytes
```

Hexadecimal:

```text
0x3841
```

Expected 3D response:

```text
5A 77 FF 41 38 08
[14,400 bytes 3D data]
CHECKSUM
```

---

# 18. 3D Matrix

Data MUST be interpreted as:

```text
60 rows
160 columns
```

Logical representation:

```text
row 0    -> C0 ... C159
row 1    -> C0 ... C159
...
row 59   -> C0 ... C159
```

Pixel access:

```python
distance_mm = frame[row][column]
```

Flattened index:

```python
index = row * 160 + column
```

---

# 19. 3D Error Codes

Known 3D error codes:

```text
4080 -> Limit for valid data
4081 -> Low amplitude
4082 -> ADC Overflow
4083 -> Saturation
```

These values MUST be handled as measurement status/error values rather than blindly interpreted as physical distance.

Recommended:

```python
ERROR_CODES_3D = {
    4080: "LIMIT_FOR_VALID_DATA",
    4081: "LOW_AMPLITUDE",
    4082: "ADC_OVERFLOW",
    4083: "SATURATION",
}
```

---

# 20. Dual Mode

Dual Mode command:

```text
0x07
```

Request:

```text
5A 77 FF 02 00 07 00 05
```

The sensor alternates:

```text
2D
3D
2D
3D
...
```

The parser MUST NOT assume strict timing between the frames.

Determine the frame type from:

```text
Payload Header
```

```text
0x01 -> 2D
0x08 -> 3D
```

---

# 21. Stop / Idle

Stop command:

```text
0x02
```

Request:

```text
5A 77 FF 02 00 02 00 00
```

After Stop:

```text
Device -> Idle
```

In Idle the device does not perform measurement.

---

# 22. Frequency Channel

CygLiDAR D1 provides 16 frequency channels:

```text
0x00 -> Channel 0
0x01 -> Channel 1
...
0x0F -> Channel 15
```

Frequency channel can be used to reduce interference when multiple LiDAR devices operate in the same measurement area.

Do not change the channel automatically unless explicitly required by the application.

---

# 23. Sensitivity

Default sensitivity:

```text
20
```

The Viewer documents a configurable range:

```text
10–100
```

General documented behavior:

```text
Lower sensitivity:
    Longer possible range
    Higher measurement error

Higher sensitivity:
    More accurate measurement
    Shorter possible range
```

Sensitivity applies to 2D measurement.

---

# 24. Baud Rate

Supported baud rates:

```text
57600
115200
250000
3000000
```

Command:

```text
0x12
```

Mapping:

```text
0x39 -> 57600
0xAA -> 115200
0x77 -> 250000
0x55 -> 3000000
```

The default is:

```text
3000000
```

Changing baud rate stores the setting in flash ROM and reboots the device.

Any software changing the baud rate MUST update the host serial configuration accordingly.

---

# 25. 3D Pulse Duration

Command:

```text
0x0C
```

Supported range:

```text
0–10,000 us
```

Modes documented by the manual:

```text
00 -> 3D Auto
01 -> 3D Fixed
10 -> Dual Auto
11 -> Dual Fixed
```

Do not implement undocumented pulse-duration behavior.

---

# 26. Recommended Code Separation

Do not create one large class containing:

```text
Serial I/O
Packet construction
Frame synchronization
Checksum
2D decoding
3D decoding
Application logic
```

Separate responsibilities.

Recommended structure:

```text
cyglidar/
├── constants.py
├── protocol.py
├── serial.py
├── parser.py
├── decoder_2d.py
├── decoder_3d.py
└── device.py
```

Responsibilities:

```text
constants.py
    Protocol constants and error codes.

protocol.py
    Packet construction and checksum.

serial.py
    UART connection and byte stream.

parser.py
    Frame synchronization and extraction.

decoder_2d.py
    2D payload decoding.

decoder_3d.py
    3D 12-bit unpacking and matrix conversion.

device.py
    High-level sensor commands and state.
```

---

# 27. API Design

Prefer high-level methods such as:

```python
lidar.get_device_info()
lidar.start_2d()
lidar.start_3d()
lidar.start_dual()
lidar.stop()
lidar.set_frequency(channel)
lidar.set_sensitivity(value)
lidar.set_baud_rate(baudrate)
```

Low-level packet construction should remain inside the protocol layer.

Application code should not manually construct:

```text
5A 77 FF ...
```

for normal operations.

---

# 28. Data Model

A decoded 2D frame SHOULD expose:

```python
{
    "mode": "2D",
    "timestamp": ...,
    "distances_mm": [...],
}
```

A decoded 3D frame SHOULD expose:

```python
{
    "mode": "3D",
    "timestamp": ...,
    "width": 160,
    "height": 60,
    "distances_mm": [...],
}
```

The raw frame SHOULD remain available for debugging.

Example:

```python
{
    "mode": "3D",
    "width": 160,
    "height": 60,
    "distances_mm": [...],
    "raw": raw_packet,
}
```

---

# 29. Timestamping

Timestamp frames at the host when the complete frame has been received and validated.

Do not infer sensor timestamps unless the protocol explicitly provides one.

Recommended:

```python
timestamp = time.monotonic_ns()
```

Use monotonic time for:

```text
latency
frame interval
FPS
timeout
performance measurement
```

---

# 30. Validation

Every decoded frame SHOULD validate:

```text
[ ] Header
[ ] Payload length
[ ] Complete frame length
[ ] Checksum
[ ] Payload header
[ ] Expected data length
[ ] Data packing
[ ] Error codes
```

For 3D:

```text
Expected:
9600 decoded values
```

For 2D:

```text
Expected:
(payload_length - 1) / 2
```

Do not silently accept malformed frames.

---

# 31. Logging

Development/debug logging SHOULD expose:

```text
TX packet
RX raw packet
Payload length
Payload header
Checksum
Decoded frame type
Decoded sample count
Invalid frame reason
```

Example:

```text
RX frame:
  mode=3D
  payload_length=14401
  pixels=9600
  checksum=valid
```

Do not log every complete 3D packet as a full hexadecimal string in production unless explicitly enabled. A 3D frame is approximately 14.4 KB of data.

Use debug-level logging for raw packet dumps.

---

# 32. Error Handling

Differentiate:

```text
Serial Error
Protocol Error
Checksum Error
Frame Synchronization Error
Payload Error
Measurement Error
Device Error
```

Do not collapse all errors into:

```text
"LiDAR error"
```

Example:

```python
class CygLiDARError(Exception):
    pass


class SerialError(CygLiDARError):
    pass


class ProtocolError(CygLiDARError):
    pass


class ChecksumError(ProtocolError):
    pass


class InvalidFrameError(ProtocolError):
    pass
```

---

# 33. Testing Requirements

Protocol code MUST be testable without physical hardware.

Use recorded packet fixtures.

At minimum test:

```text
[ ] Header detection
[ ] Garbage before header
[ ] Partial header
[ ] Partial frame
[ ] Complete frame
[ ] Multiple frames in one read
[ ] Invalid checksum
[ ] Invalid payload length
[ ] 2D decoding
[ ] 3D 12-bit decoding
[ ] Dual mode
[ ] Error codes
```

---

# 34. Required Protocol Fixtures

Keep known-good packets as fixtures.

Minimum fixtures:

```text
get_device_info_request
get_device_info_response
run_2d_request
run_3d_request
run_dual_request
stop_request
sample_2d_response
sample_3d_response
```

The following known packets MUST be included in protocol tests:

```text
5A 77 FF 02 00 10 00 12

5A 77 FF 02 00 01 00 03

5A 77 FF 02 00 08 00 0A

5A 77 FF 02 00 07 00 05

5A 77 FF 02 00 02 00 00
```

---

# 35. 3D Decoder Test

The decoder MUST verify the documented packing example.

Input:

```text
5D C7 D0
```

Expected:

```text
1500
2000
```

Test:

```python
values = unpack_12bit(bytes.fromhex("5D C7 D0"))

assert values == [1500, 2000]
```

---

# 36. Checksum Test

Example:

```python
packet = bytes.fromhex(
    "5A 77 FF 02 00 01 00 03"
)

assert validate_checksum(packet)
```

The checksum algorithm MUST produce:

```text
03
```

for the documented Run 2D request.

---

# 37. Do Not

Do NOT:

- Assume UART `read()` returns a complete frame.
- Ignore checksum.
- Parse 3D data as normal 16-bit integers.
- Hard-code 2D sample count as 161.
- Treat error codes as normal distances.
- Change baud rate without updating host configuration.
- Send commands without calculating checksum.
- Depend on timing alone to identify frame boundaries.
- Assume Dual Mode frames have fixed arrival intervals.
- Mix protocol parsing with application/business logic.
- Replace the documented protocol with assumptions from another LiDAR.

---

# 38. Documentation Rule

Any change to the CygLiDAR protocol implementation that changes:

```text
packet structure
command
checksum
2D decoder
3D decoder
error code
baud rate
frame synchronization
```

MUST update:

```text
knowledge.md
```

if the change is based on newly verified hardware behavior.

If the implementation differs from the manual, document the difference explicitly.

Use:

```text
IMPLEMENTATION NOTE
```

or:

```text
HARDWARE-VERIFIED BEHAVIOR
```

Do not silently overwrite the documented behavior.

---

# 39. Protocol Change Rule

Before changing a protocol implementation:

```text
1. Identify the affected packet.
2. Check the CygLiDAR manual.
3. Check knowledge.md.
4. Check existing tests.
5. Determine whether the behavior is documented or hardware-observed.
6. Implement the smallest required change.
7. Add/update protocol tests.
8. Update knowledge.md when the verified behavior changes the knowledge base.
```

---

# 40. Development Principle

The most important principle for this project:

```text
Parse the bytes exactly as the device sends them.
```

Do not build assumptions around expected output.

The packet itself determines:

```text
frame boundary
payload size
payload type
checksum validity
data count
```

The application layer consumes decoded measurements and should not need to know the raw UART protocol.

---

# 41. Reference Summary

```text
CygLiDAR D1

UART:
    TTL 3.3V
    3000000 baud
    8N1

Header:
    5A 77 FF

Checksum:
    XOR packet[3:-1]

2D:
    Header       = 01
    Data         = 16-bit
    Range        = 200–8000 mm
    FOV          = 120°
    Frequency    = 15 Hz

3D:
    Header       = 08
    Data         = 12-bit packed
    Resolution   = 160 × 60
    Range        = 50–2000 mm
    FOV          = 120° × 65°
    Frequency    = 15 Hz

Dual:
    2D and 3D alternating

Commands:
    10 = Get Device Info
    01 = Run 2D
    08 = Run 3D
    07 = Run Dual
    02 = Stop
    0C = Set 3D Pulse
    0F = Set Frequency
    11 = Set Sensitivity
    12 = Set Baud Rate
```

## Primary Reference

```text
CygLiDAR D1 User Manual
Ver. 0.2.2
Cygbot
```

The protocol documentation in this repository must remain consistent with the official device manual and verified hardware behavior.

```

```

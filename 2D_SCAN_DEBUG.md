# 2D Scan Debug Analysis

## Issue

Sensor TX/RX LEDs blinking (data being sent), but no data showing in web interface.

## Config.ts Response Headers

```typescript
deviceinfo: "5a77ff070010"; // [5A 77 FF] [07 00] [10]
scan2D: "5a77ff430101"; // [5A 77 FF] [43 01] [01]  <<< DIFFERENT!
scan3D: "5a77ff413808"; // [5A 77 FF] [41 38] [08]
```

### Breaking Down 2D Response:

- Header: 5A 77 FF
- **Length: 43 01** = 0x0143 = **323 bytes**
- **Payload Header: 01**

## Current Implementation Check

In `new-lidar.ts`:

```typescript
PACKET_HEADER_2D: 0x01  ✓ Correct
```

## Expected 2D Packet Structure

For 160 points with 3 bytes each (distance LSB, distance MSB, intensity):

- Header: 6 bytes [5A 77 FF LSB MSB 01]
- Data: 160 × 3 = 480 bytes
- **Total payload = 481 bytes** (including payload header 0x01)
- Length field = 481 = 0x01E1

But config.ts shows **0x0143 = 323 bytes**...

Wait, let me recalculate:

- 160 points × 2 bytes (distance only?) = 320 bytes
- - 1 byte (payload header) = 321 bytes
- - 2 bytes (?) = 323 = 0x0143 ✓

**So 2D format might be: distance (2 bytes) only, NO intensity!**

## Debug Logging Added

Now the parser will show:

```
[RX] Received X bytes, buffer size: Y
[PARSE] Header1 found: 0x5A
[PARSE] Header2 found: 0x77
[PARSE] Payload size: 323 bytes
[PARSE] Payload header: 0x01
[PARSE] ✓ Checksum OK, total packet size: 329 bytes
[2D] Processed X valid points out of 160
```

This will help identify where the parsing is failing.

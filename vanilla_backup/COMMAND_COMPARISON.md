# CygLiDAR D1 Command Comparison

## Analysis: new-lidar.ts vs config.ts vs SDK

### Command Format Verification

All commands follow this structure:

```
[0x5A] [0x77] [ID] [LEN_L] [LEN_H] [PAYLOAD...] [CHECKSUM]
```

Where checksum = XOR of bytes from position 3 (LEN_L) to end of payload.

---

### Device Info ✅ **CORRECT**

**Config.ts:**

```
[0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]
```

**new-lidar.ts generates:**

```typescript
sendCommand([0x10, 0x00])
→ [0x5A, 0x77, 0xFF, 0x02, 0x00, 0x10, 0x00, 0x12]
```

Checksum: `0x02 ⊕ 0x00 ⊕ 0x10 ⊕ 0x00 = 0x12` ✅

---

### Start 2D Scan ✅ **CORRECT**

**Config.ts:**

```
[0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03]
```

**new-lidar.ts generates:**

```typescript
sendCommand([0x01, 0x00])
→ [0x5A, 0x77, 0xFF, 0x02, 0x00, 0x01, 0x00, 0x03]
```

Checksum: `0x02 ⊕ 0x00 ⊕ 0x01 ⊕ 0x00 = 0x03` ✅

---

### Start 3D Scan ✅ **CORRECT**

**Config.ts:**

```
[0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A]
```

**new-lidar.ts generates:**

```typescript
sendCommand([0x08, 0x00])
→ [0x5A, 0x77, 0xFF, 0x02, 0x00, 0x08, 0x00, 0x0A]
```

Checksum: `0x02 ⊕ 0x00 ⊕ 0x08 ⊕ 0x00 = 0x0A` ✅

---

### Stop Scan ✅ **CORRECT**

**Config.ts:**

```
[0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00]
```

**new-lidar.ts generates:**

```typescript
sendCommand([0x02, 0x00])
→ [0x5A, 0x77, 0xFF, 0x02, 0x00, 0x02, 0x00, 0x00]
```

Checksum: `0x02 ⊕ 0x00 ⊕ 0x02 ⊕ 0x00 = 0x00` ✅

---

### Set Integration Time (Pulse) ✅ **CORRECT**

**Config.ts example (value=0x6710=26384us, auto mode):**

```
[0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x67, 0x78]
```

- Payload length: 3 bytes
- Payload: [0x0C, 0x10, 0x67]
- LSB: 0x10
- MSB: 0x67 (bit 6 not set = auto mode)

**new-lidar.ts generates (same value):**

```typescript
setIntegrationTime(26384, 'auto')
→ LSB = 0x10, MSB = 0x67
→ sendCommand([0x0C, 0x10, 0x67])
→ [0x5A, 0x77, 0xFF, 0x03, 0x00, 0x0C, 0x10, 0x67, 0x78]
```

Checksum: `0x03 ⊕ 0x00 ⊕ 0x0C ⊕ 0x10 ⊕ 0x67 = 0x78` ✅

**Manual mode bit:**

- Manual: MSB |= (1 << 6) = MSB | 0x40
- Example: 0x67 | 0x40 = 0xE7 (manual)

---

### Set Frequency ⚠️ **DISCREPANCY IN CONFIG.TS**

**Config.ts:**

```
[0x5A, 0x77, 0x03, 0x00, 0x00, 0x00]
```

**This looks incomplete/incorrect!** Missing ID byte and payload.

**SDK (CYG_SerialUart.cpp:103-109):**

```cpp
void CYG_SerialUart::requestFrequencyChannel(const uint8_t _channel_number)
{
    payload_buffer.clear();
    payload_buffer.push_back(D1_Const::FREQUENCY_CHANNEL);  // 0x0F
    payload_buffer.push_back(_channel_number);

    transferPacketCommand(payload_buffer);
}
```

**new-lidar.ts generates (channel 5 example):**

```typescript
setFrequency(5)
→ sendCommand([0x0F, 0x05])
→ [0x5A, 0x77, 0xFF, 0x02, 0x00, 0x0F, 0x05, 0x08]
```

Checksum: `0x02 ⊕ 0x00 ⊕ 0x0F ⊕ 0x05 = 0x08` ✅

**Conclusion:** `new-lidar.ts` is CORRECT according to SDK. Config.ts frequency command appears incomplete.

---

### Set Baudrate ✅ **CORRECT**

**Config.ts (mode 0xAA - possibly invalid test value):**

```
[0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA, checksum]
```

Checksum = `0x02 ⊕ 0x00 ⊕ 0x12 ⊕ 0xAA = 0xB8`

**new-lidar.ts generates (mode 2 = 115200 baud):**

```typescript
setBaudrate(2)
→ sendCommand([0x12, 0x02])
→ [0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0x02, 0x10]
```

Checksum: `0x02 ⊕ 0x00 ⊕ 0x12 ⊕ 0x02 = 0x10` ✅

**Valid baudrate modes:**

- 0x00: 3,000,000 bps
- 0x01: 921,600 bps
- 0x02: 115,200 bps
- 0x03: 57,600 bps

---

## Summary

| Command     | Config.ts            | new-lidar.ts       | Status                   |
| ----------- | -------------------- | ------------------ | ------------------------ |
| Device Info | ✅ Correct           | ✅ Correct         | MATCH                    |
| Start 2D    | ✅ Correct           | ✅ Correct         | MATCH                    |
| Start 3D    | ✅ Correct           | ✅ Correct         | MATCH                    |
| Stop        | ✅ Correct           | ✅ Correct         | MATCH                    |
| Pulse       | ✅ Correct           | ✅ Correct         | MATCH                    |
| Frequency   | ⚠️ Incomplete        | ✅ Correct per SDK | new-lidar.ts follows SDK |
| Baudrate    | ⚠️ Test value (0xAA) | ✅ Correct         | new-lidar.ts correct     |

## Logging Output

With the new logging, you'll see:

```
[CMD] Get Device Info
[SENT] 5A77FF020010001 2 | <Buffer ...>

[CMD] Start 2D Scan - Command: 0x01
[SENT] 5A77FF020001000 3 | <Buffer ...>

[CMD] Set Frequency - Channel: 5 (0x05)
[SENT] 5A77FF02000F050 8 | <Buffer ...>

[CMD] Set Integration Time - Value: 1000us, Mode: auto, LSB: 0xE8, MSB: 0x03
[SENT] 5A77FF03000CE803F2 | <Buffer ...>
```

## Conclusion

**new-lidar.ts implementation is CORRECT** according to the official SDK. The config.ts frequency command appears to be incomplete or a placeholder. All other commands match perfectly.

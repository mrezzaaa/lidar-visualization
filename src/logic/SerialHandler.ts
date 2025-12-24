/**
 * Handles Web Serial API connections and buffering.
 */
export class SerialHandler {
    private port: SerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private keepReading: boolean = false;
    
    public onData: ((data: Uint8Array) => void) | null = null;
    public onError: ((error: unknown) => void) | null = null;
    public onDisconnect: (() => void) | null = null;

    constructor() {
    }

    async connect(baudRate: number = 3000000): Promise<boolean> {
        if (!navigator.serial) throw new Error("WebSerial not supported");

        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate });
            this.keepReading = true;
            this.readLoop();
            return true;
        } catch (err) {
            console.error("Connection failed:", err);
            throw err;
        }
    }

    async disconnect() {
        this.keepReading = false;
        if (this.reader) await this.reader.cancel();
        if (this.port) await this.port.close();
        if (this.onDisconnect) this.onDisconnect();
    }

    async send(data: Uint8Array) {
        if (!this.port || !this.port.writable) return;
        const writer = this.port.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
    }

    private async readLoop() {
        if (!this.port || !this.port.readable) return;
        
        try {
            this.reader = this.port.readable.getReader();
            
            while (this.keepReading) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value && this.onData) {
                    this.onData(value);
                }
            }
        } catch (error) {
            console.error("Read Error:", error);
            if (this.onError) this.onError(error);
        } finally {
            if (this.reader) this.reader.releaseLock();
        }
    }
}

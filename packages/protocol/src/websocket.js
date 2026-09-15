import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function acceptWebSocket(request, socket) {
  const key = request.headers["sec-websocket-key"];
  if (!key || request.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return null;
  }
  const accept = crypto.createHash("sha1").update(key + MAGIC).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n"
  ].join("\r\n"));
  return new WebSocketPeer(socket);
}

export class WebSocketPeer extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    socket.on("data", (chunk) => this.#consume(chunk));
    socket.on("close", () => { this.closed = true; this.emit("close"); });
    socket.on("error", (error) => this.emit("error", error));
  }

  send(text) {
    if (this.closed || !this.socket.writable) return;
    const payload = Buffer.from(String(text));
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, payload.length]);
    } else if (payload.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    const reasonBuffer = Buffer.from(reason);
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.socket.write(frame(0x8, payload));
    this.socket.end();
    this.closed = true;
  }

  #consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2); offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) return this.close(1009, "frame too large");
        length = Number(big); offset = 10;
      }
      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.subarray(offset, offset + 4); offset += 4;
      }
      if (this.buffer.length < offset + length) return;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      if (!fin) { this.close(1003, "fragmented frames unsupported"); return; }
      if (opcode === 0x1) this.emit("message", payload.toString("utf8"));
      else if (opcode === 0x8) { this.close(); return; }
      else if (opcode === 0x9) this.socket.write(frame(0xA, payload));
    }
  }
}

function frame(opcode, payload) {
  if (payload.length >= 126) throw new Error("control frame too large");
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}

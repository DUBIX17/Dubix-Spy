import { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";

// ---------------- AUDIO CONFIG ----------------
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

// keep last 60 seconds
const BUFFER_SECONDS = 60;
const MAX_BYTES =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * BUFFER_SECONDS;

// ---------------- STATE ----------------
let rollingBuffer = Buffer.alloc(0);
const monitors = new Set();

// ---------------- HTTP SERVER ----------------
const server = http.createServer((req, res) => {
  if (req.url === "/latest.wav") {
    if (!fs.existsSync("latest.wav")) {
      res.writeHead(404);
      return res.end("No audio yet");
    }
    res.writeHead(200, { "Content-Type": "audio/wav" });
    fs.createReadStream("latest.wav").pipe(res);
  } else {
    res.writeHead(200);
    res.end("Audio server running");
  }
});

// ---------------- WEBSOCKET ----------------
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const isMonitor = req.url === "/monitor";

  if (isMonitor) {
    monitors.add(ws);
    console.log("Live monitor connected");

    ws.on("close", () => {
      monitors.delete(ws);
      console.log("Monitor disconnected");
    });

    return;
  }

  console.log("Audio source connected");

  ws.on("message", data => {
    const chunk = Buffer.from(data);

    // ---- rolling buffer ----
    rollingBuffer = Buffer.concat([rollingBuffer, chunk]);
    if (rollingBuffer.length > MAX_BYTES) {
      rollingBuffer = rollingBuffer.slice(
        rollingBuffer.length - MAX_BYTES
      );
    }

    // ---- live broadcast ----
    for (const m of monitors) {
      if (m.readyState === 1) {
        m.send(chunk);
      }
    }
  });

  ws.on("close", () => {
    console.log("Audio source disconnected");
    saveLatest();
  });
});

// ---------------- SAVE WAV ----------------
function saveLatest() {
  if (!rollingBuffer.length) return;

  const header = wavHeader(rollingBuffer.length);
  fs.writeFileSync(
    "latest.wav",
    Buffer.concat([header, rollingBuffer])
  );

  console.log("latest.wav saved");
}

// ---------------- WAV HEADER ----------------
function wavHeader(dataLength) {
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(
    SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE,
    28
  );
  buffer.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

// ---------------- START ----------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

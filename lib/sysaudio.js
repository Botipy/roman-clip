// System audio bridge. A hidden window captures the Windows loopback (everything you hear) and sends raw PCM here;
// ffmpeg connects to a local TCP port and reads it as a raw f32le stream (48 kHz, stereo).
//
// WASAPI loopback delivers NO data while nothing is playing, but ffmpeg needs a continuous stream to keep audio and
// video in sync. So a pacer writes exactly as many samples as wall-clock time requires: real audio when we have it,
// silence otherwise.
const net = require('net');

const RATE = 48000, FRAME_BYTES = 8;          // stereo float32
const MAX_QUEUE_BYTES = RATE * FRAME_BYTES * 0.4;   // never let the queue grow past ~400 ms (that would be audible lag)

class SystemAudio {
  constructor() {
    this.server = null; this.port = 0; this.socket = null; this.timer = null;
    this.queue = []; this.queued = 0; this.t0 = 0; this.sentFrames = 0;
  }

  async start() {
    if (this.server) return this.port;
    this.server = net.createServer((sock) => {
      sock.on('error', () => {});
      sock.on('close', () => { if (this.socket === sock) this.socket = null; });
      sock.setNoDelay(true);
      this.socket = sock;
      this.t0 = Date.now(); this.sentFrames = 0;   // new ffmpeg process: restart the audio clock
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); });
    this.port = this.server.address().port;
    this.timer = setInterval(() => this.pump(), 20);
    return this.port;
  }

  push(buf) {
    if (!this.server) return;
    this.queue.push(buf); this.queued += buf.length;
    while (this.queued > MAX_QUEUE_BYTES && this.queue.length > 1) this.queued -= this.queue.shift().length;
  }

  pump() {
    const sock = this.socket;
    if (!sock || sock.destroyed || !sock.writable) return;
    const due = Math.floor(((Date.now() - this.t0) * RATE) / 1000) - this.sentFrames;
    if (due <= 0) return;
    const out = Buffer.alloc(due * FRAME_BYTES);       // zeros = silence
    let off = 0;
    while (off < out.length && this.queue.length) {
      const head = this.queue[0], n = Math.min(head.length, out.length - off);
      head.copy(out, off, 0, n);
      off += n;
      if (n === head.length) this.queue.shift(); else this.queue[0] = head.subarray(n);
      this.queued -= n;
    }
    this.sentFrames += due;
    if (sock.writableLength < RATE * FRAME_BYTES) sock.write(out);   // drop instead of buffering if ffmpeg stalls
  }

  stop() {
    clearInterval(this.timer); this.timer = null;
    try { if (this.socket) this.socket.destroy(); } catch {}
    this.socket = null;
    if (this.server) { try { this.server.close(); } catch {} }
    this.server = null; this.port = 0; this.queue = []; this.queued = 0;
  }
}

module.exports = new SystemAudio();

// Serial machine connection (Web Serial) with GRBL character-counting streaming
// and simple send/ack streaming for Marlin / Smoothieware.

const enc = new TextEncoder();

export class Machine {
  constructor() {
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.connected = false;
    this.protocol = 'grbl';
    this.queue = [];
    this.inflight = [];
    this.inflightChars = 0;
    this.rxBuffer = 127;
    this.paused = false;
    this.job = null;
    this.status = { state: 'Disconnected', mpos: [0, 0, 0], wpos: [0, 0, 0], wco: [0, 0, 0], feed: 0, power: 0 };
    this.handlers = {};
    this.pollTimer = null;
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...a) { (this.handlers[evt] || []).forEach(f => f(...a)); }

  get supported() { return 'serial' in navigator; }

  async connect(baud = 115200, protocol = 'grbl', knownPort = null) {
    if (!this.supported) throw new Error('Web Serial is not available in this environment.');
    const port = knownPort || await navigator.serial.requestPort();
    await port.open({ baudRate: +baud, bufferSize: 8192 });
    this.baud = +baud;
    this.portInfo = port.getInfo();
    // Native-USB boards (ESP32-S2/S3 TinyUSB, many CDC controllers) only transmit once the
    // host asserts DTR; DTR+RTS high is also the "run" state for auto-reset circuits.
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* not supported */ }
    this.port = port;
    this.protocol = protocol;
    this.writer = port.writable.getWriter();
    this.connected = true;
    this.queue = [];
    this.inflight = [];
    this.inflightChars = 0;
    this.setState('Connecting');
    this.readLoop();
    if (this.isGrbl) {
      // No soft reset (Ctrl-X) here: ESP32 GRBL ports reboot on it and drop the USB link.
      // A status query is enough to detect the controller.
      this.pollTimer = setInterval(() => { if (this.connected) this.realtime('?'); }, 250);
      setTimeout(() => {
        if (this.connected && this.status.state === 'Connecting') {
          this.emit('log', 'No response from the controller. Check the baud rate and firmware in the machine profile, and close other programs using this port (LaserGRBL, LightBurn, the maker\'s app).', 'err');
        }
      }, 6000);
    } else {
      this.setState('Idle');
      this.send('M115');
    }
    this.emit('connection', true);
  }

  get isGrbl() { return this.protocol === 'grbl'; }

  async disconnect() {
    clearInterval(this.pollTimer);
    this.connected = false;
    this.job = null;
    try { if (this.reader) await this.reader.cancel(); } catch { /* ignore */ }
    try { if (this.writer) { this.writer.releaseLock(); } } catch { /* ignore */ }
    try { if (this.port) await this.port.close(); } catch { /* ignore */ }
    this.port = this.writer = this.reader = null;
    this.setState('Disconnected');
    this.emit('connection', false);
  }

  async readLoop() {
    const dec = new TextDecoder();
    let pending = '';
    while (this.port && this.port.readable && this.connected) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          pending += dec.decode(value, { stream: true });
          let idx;
          while ((idx = pending.search(/\r?\n/)) >= 0) {
            const line = pending.slice(0, idx).trim();
            pending = pending.slice(pending[idx] === '\r' ? idx + 2 : idx + 1);
            if (line) this.handleLine(line);
          }
        }
      } catch (e) {
        this.emit('log', `! serial read error: ${e.message}`, 'err');
      } finally {
        try { this.reader.releaseLock(); } catch { /* ignore */ }
      }
      if (!this.connected) break;
      // Device vanished (unplugged, or the controller rebooted after a reset) — try to get it back.
      await this.disconnect();
      this.reconnect();
      break;
    }
  }

  async reconnect(timeoutMs = 15000) {
    const info = this.portInfo;
    if (!info || !info.usbVendorId) return;
    this.emit('log', 'Connection lost — waiting for the controller to come back…', 'info');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !this.connected) {
      await new Promise(r => setTimeout(r, 1000));
      const ports = await navigator.serial.getPorts();
      const p = ports.find(x => {
        const i = x.getInfo();
        return i.usbVendorId === info.usbVendorId && i.usbProductId === info.usbProductId;
      });
      if (!p) continue;
      try {
        await this.connect(this.baud, this.protocol, p);
        this.emit('log', 'Reconnected.', 'info');
        return;
      } catch { /* device still booting */ }
    }
    if (!this.connected) this.emit('log', 'Could not reconnect. Press Connect to try again.', 'err');
  }

  handleLine(line) {
    // ESP32 firmwares interleave ESP-IDF log output (with ANSI colour codes) on the same port.
    line = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
    if (!line) return;
    if (line.startsWith('<') && line.endsWith('>')) {
      this.parseStatus(line.slice(1, -1));
      return;
    }
    if (line === 'ok' || line.startsWith('error')) {
      const sent = this.inflight.shift();
      if (sent) this.inflightChars -= sent.length + 1;
      if (line.startsWith('error')) this.emit('log', `${line}  ← ${sent || ''}`, 'err');
      if (this.job) {
        this.job.acked++;
        if (line.startsWith('error')) this.job.errors++;
        this.emit('progress', this.job);
        if (this.job.acked >= this.job.total) this.finishJob();
      } else if (line.startsWith('error') === false && this.echoOk) {
        this.emit('log', line, 'rx');
      }
      this.pump();
      return;
    }
    if (/^Grbl|^\[VER|^GrblHAL/i.test(line)) {
      this.queue = [];
      this.inflight = [];
      this.inflightChars = 0;
      if (this.job) { this.emit('log', 'Controller reset — job aborted.', 'err'); this.job = null; this.emit('jobEnd', false); }
      if (this.status.state === 'Connecting') this.setState('Idle');
    }
    if (line.startsWith('ALARM')) this.setState('Alarm');
    this.emit('log', line, 'rx');
  }

  parseStatus(s) {
    const parts = s.split('|');
    const st = this.status;
    st.state = parts[0].split(':')[0];
    for (const p of parts.slice(1)) {
      const [k, v] = p.split(':');
      const nums = v ? v.split(',').map(Number) : [];
      if (k === 'MPos') { st.mpos = nums; st.wpos = nums.map((n, i) => n - (st.wco[i] || 0)); }
      else if (k === 'WPos') { st.wpos = nums; st.mpos = nums.map((n, i) => n + (st.wco[i] || 0)); }
      else if (k === 'WCO') { st.wco = nums; st.wpos = st.mpos.map((n, i) => n - (nums[i] || 0)); }
      else if (k === 'FS') { st.feed = nums[0]; st.power = nums[1]; }
      else if (k === 'F') { st.feed = nums[0]; }
      else if (k === 'Bf') { st.bf = nums; }
    }
    this.emit('status', st);
  }

  setState(s) {
    this.status.state = s;
    this.emit('status', this.status);
  }

  async write(str) {
    if (!this.writer) return;
    await this.writer.write(enc.encode(str));
  }

  async realtime(ch) {
    if (!this.connected) return;
    await this.write(ch);
  }

  send(line) {
    if (!this.connected) return;
    const l = line.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
    if (!l) return;
    if (this.isGrbl && (l === '?' || l === '!' || l === '~')) { this.realtime(l); return; }
    this.queue.push(l);
    this.pump();
  }

  sendLines(lines) { lines.forEach(l => this.send(l)); }

  pump() {
    if (!this.connected || this.paused) return;
    while (this.queue.length) {
      const next = this.queue[0];
      if (this.isGrbl) {
        if (this.inflightChars + next.length + 1 > this.rxBuffer && this.inflight.length) break;
      } else if (this.inflight.length >= 1) break;
      this.queue.shift();
      this.inflight.push(next);
      this.inflightChars += next.length + 1;
      if (this.job) this.job.sent++;
      this.write(next + '\n');
    }
  }

  // ---------------------------------------------------------------- jobs
  runJob(gcode) {
    if (!this.connected) throw new Error('Not connected');
    if (this.job) throw new Error('A job is already running');
    const lines = gcode.split(/\r?\n/).map(l => l.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim()).filter(Boolean);
    this.job = { total: lines.length, sent: 0, acked: 0, errors: 0, started: Date.now() };
    this.paused = false;
    this.emit('jobStart', this.job);
    lines.forEach(l => this.queue.push(l));
    this.pump();
  }

  finishJob() {
    const j = this.job;
    this.job = null;
    this.emit('jobEnd', true, j);
  }

  async pause() {
    this.paused = true;
    if (this.isGrbl) await this.realtime('!');
    this.emit('paused', true);
  }

  async resume() {
    this.paused = false;
    if (this.isGrbl) await this.realtime('~');
    this.pump();
    this.emit('paused', false);
  }

  async stop() {
    const hadJob = !!this.job;
    this.queue = [];
    this.paused = false;
    if (this.isGrbl) {
      await this.realtime('!');
      await new Promise(r => setTimeout(r, 250));
      await this.realtime('\x18');
    } else {
      this.inflight = [];
      this.inflightChars = 0;
      await this.write('M410\nM5\n');
    }
    if (hadJob) {
      this.job = null;
      this.emit('jobEnd', false);
    }
    this.emit('paused', false);
  }

  jog(dx, dy, feed) {
    if (this.isGrbl) this.send(`$J=G91 G21 X${dx.toFixed(3)} Y${dy.toFixed(3)} F${feed}`);
    else this.sendLines(['G91', `G0 X${dx.toFixed(3)} Y${dy.toFixed(3)} F${feed}`, 'G90']);
  }

  home() { this.send(this.isGrbl ? '$H' : 'G28 X Y'); }
  unlock() { if (this.isGrbl) this.send('$X'); }
  setZero() { this.send(this.isGrbl ? 'G10 L20 P1 X0 Y0' : 'G92 X0 Y0'); }
  goZero() { this.send('G90'); this.send('G0 X0 Y0'); }
}

export const machine = new Machine();

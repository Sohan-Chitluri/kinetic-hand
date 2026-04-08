/* ═══════════════════════════════════════════════════════════════════
 *  Smart Glove Telemetry – main.js
 *  2D Hand Skeleton Visualization + Sensor Logic
 * ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ─── Serial State ──────────────────────────────────────────────────
let port, reader, inputDone, inputStream;
let outputStream, writer;          // for sending commands TO Arduino
let lineBuffer = '';
let packetCount = 0;
let sessionStart = null;
let sessionTimer = null;
let motorOn = false;               // tracks dashboard-side motor state

// ─── Calibration & Testing State ─────────────────────────────────────────
let baseline = { roll: 0, index: 0, middle: 0, ring: 0, pinky: 0, thumb: 0, rms: 0 };
let currentRawData = { roll: 0, index: 0, middle: 0, ring: 0, pinky: 0, thumb: 0, rms: 0, score: 0 };
let isRecording = false;
let recordInterval = null;
let recordedData = [];

// ─── DOM References ──────────────────────────────────────────────────
const connectBtn = document.getElementById('connectBtn');
const connStatus = document.getElementById('conn-status');
const logConnStatus = document.getElementById('log-conn-status');
const terminal = document.getElementById('terminal');

// Test Buttons
const calibrateBtn = document.getElementById('calibrateBtn');
const testBtn = document.getElementById('testBtn');
const testText = document.getElementById('test-text');
const recordDot = document.getElementById('record-dot');
const analyzeBtn = document.getElementById('analyzeBtn');

// Score
const scoreNum = document.getElementById('score-value');
const scoreRingFill = document.getElementById('score-ring-fill');
const scoreStateLabel = document.getElementById('score-label');

// Tremor
const tremorArcFill = document.getElementById('tremor-arc-fill');
const tremorRmsEl = document.getElementById('tremor-rms');
const tremorStateEl = document.getElementById('tremor-state');

// Wrist info
const wristRollVal = document.getElementById('wrist-roll-val');
const statWrist = document.getElementById('stat-wrist');

// Session stats
const statUptime = document.getElementById('stat-uptime');
const statPackets = document.getElementById('stat-packets');
const statFlex1 = document.getElementById('stat-flex1');
const statFlex2 = document.getElementById('stat-flex2');
const statStatusEl = document.getElementById('stat-status');
const statMotorEl = document.getElementById('stat-motor');

// Motor toggle button
const motorToggleBtn = document.getElementById('motorToggleBtn');

function setMotorBtnState(on) {
    motorOn = on;
    motorToggleBtn.textContent = on ? '⚡ Motor: ON' : '⚡ Motor: OFF';
    motorToggleBtn.style.background = on
        ? 'rgba(248,81,73,0.18)'
        : 'rgba(63,185,80,0.12)';
    motorToggleBtn.style.borderColor = on ? '#f85149' : '#3fb950';
    motorToggleBtn.style.color = on ? '#f85149' : '#3fb950';
}

motorToggleBtn.addEventListener('click', async () => {
    if (!writer) return;
    // Send 'M\n' — Arduino toggles motor on receiving this
    const encoded = new TextEncoder().encode('M\n');
    await writer.write(encoded);
    setMotorBtnState(!motorOn);
});

// SVG hand elements
const handSVG = document.getElementById('handSVG');
const handGroup = document.getElementById('handGroup');
const palmRect = document.getElementById('palm');

// Finger groups by id
const fingerGroups = {
    thumb: document.getElementById('thumb'),
    index: document.getElementById('index-finger'),
    middle: document.getElementById('middle-finger'),
    ring: document.getElementById('ring-finger'),
    pinky: document.getElementById('pinky-finger'),
};

// Finger base positions (SVG coords) for rotation origin
const fingerBases = {
    thumb: { x: 96, y: 240 },
    index: { x: 110, y: 195 },
    middle: { x: 140, y: 190 },
    ring: { x: 168, y: 193 },
    pinky: { x: 193, y: 200 },
};

// Grip fill bars
const gripFills = {
    thumb: { bar: document.getElementById('grip-thumb'), val: document.getElementById('grip-thumb-val') },
    index: { bar: document.getElementById('grip-index'), val: document.getElementById('grip-index-val') },
    middle: { bar: document.getElementById('grip-middle'), val: document.getElementById('grip-middle-val') },
    ring: { bar: document.getElementById('grip-ring'), val: document.getElementById('grip-ring-val') },
    pinky: { bar: document.getElementById('grip-pinky'), val: document.getElementById('grip-pinky-val') },
};

// Finger angle labels
const fingerLabels = {
    thumb: document.getElementById('lbl-thumb'),
    index: document.getElementById('lbl-index'),
    middle: document.getElementById('lbl-middle'),
    ring: document.getElementById('lbl-ring'),
    pinky: document.getElementById('lbl-pinky'),
};

// Raw IMU Dashboard Elements
const imuEls = {
    'IMU1': {
        ax: document.getElementById('imu1-ax'), axBar: document.getElementById('imu1-ax-bar'),
        ay: document.getElementById('imu1-ay'), ayBar: document.getElementById('imu1-ay-bar'),
        az: document.getElementById('imu1-az'), azBar: document.getElementById('imu1-az-bar'),
        gx: document.getElementById('imu1-gx'), gxBar: document.getElementById('imu1-gx-bar'),
        gy: document.getElementById('imu1-gy'), gyBar: document.getElementById('imu1-gy-bar'),
        gz: document.getElementById('imu1-gz'), gzBar: document.getElementById('imu1-gz-bar')
    },
    'IMU2': {
        ax: document.getElementById('imu2-ax'), axBar: document.getElementById('imu2-ax-bar'),
        ay: document.getElementById('imu2-ay'), ayBar: document.getElementById('imu2-ay-bar'),
        az: document.getElementById('imu2-az'), azBar: document.getElementById('imu2-az-bar'),
        gx: document.getElementById('imu2-gx'), gxBar: document.getElementById('imu2-gx-bar'),
        gy: document.getElementById('imu2-gy'), gyBar: document.getElementById('imu2-gy-bar'),
        gz: document.getElementById('imu2-gz'), gzBar: document.getElementById('imu2-gz-bar')
    },
    'IMU3': {
        ax: document.getElementById('imu3-ax'), axBar: document.getElementById('imu3-ax-bar'),
        ay: document.getElementById('imu3-ay'), ayBar: document.getElementById('imu3-ay-bar'),
        az: document.getElementById('imu3-az'), azBar: document.getElementById('imu3-az-bar'),
        gx: document.getElementById('imu3-gx'), gxBar: document.getElementById('imu3-gx-bar'),
        gy: document.getElementById('imu3-gy'), gyBar: document.getElementById('imu3-gy-bar'),
        gz: document.getElementById('imu3-gz'), gzBar: document.getElementById('imu3-gz-bar')
    },
    'IMU4': {
        ax: document.getElementById('imu4-ax'), axBar: document.getElementById('imu4-ax-bar'),
        ay: document.getElementById('imu4-ay'), ayBar: document.getElementById('imu4-ay-bar'),
        az: document.getElementById('imu4-az'), azBar: document.getElementById('imu4-az-bar'),
        gx: document.getElementById('imu4-gx'), gxBar: document.getElementById('imu4-gx-bar'),
        gy: document.getElementById('imu4-gy'), gyBar: document.getElementById('imu4-gy-bar'),
        gz: document.getElementById('imu4-gz'), gzBar: document.getElementById('imu4-gz-bar')
    }
};

// Update IMU Bar Helper
function updateBar(valEl, barEl, raw, isGyro) {
    if (!valEl || !barEl) return;
    valEl.textContent = raw;

    // MPU6050 raw limits approx +/- 32768
    const maxVal = 32768;

    let percent = (Math.abs(raw) / maxVal) * 50;
    percent = Math.min(50, Math.max(0, percent)); // cap at 50% max width

    barEl.style.width = `${percent}%`;

    if (raw < 0) {
        barEl.style.left = `${50 - percent}%`;
    } else {
        barEl.style.left = `50%`;
    }
}

function updateIMU(id, ax, ay, az, gx, gy, gz) {
    if (!imuEls[id]) return;

    updateBar(imuEls[id].ax, imuEls[id].axBar, parseInt(ax), false);
    updateBar(imuEls[id].ay, imuEls[id].ayBar, parseInt(ay), false);
    updateBar(imuEls[id].az, imuEls[id].azBar, parseInt(az), false);

    updateBar(imuEls[id].gx, imuEls[id].gxBar, parseInt(gx), true);
    updateBar(imuEls[id].gy, imuEls[id].gyBar, parseInt(gy), true);
    updateBar(imuEls[id].gz, imuEls[id].gzBar, parseInt(gz), true);
}

// ─── Regex Patterns ──────────────────────────────────────────────────
const flexRegex = /FLEX1:\s+(\d+)\s+\(([\d.]+)\s+V\)\s+\|\s+FLEX2:\s+(\d+)\s+\(([\d.]+)\s+V\)/;
const imuRegex = /(IMU[1-4])\s+\|\s+AX=(-?\d+)\s+AY=(-?\d+)\s+AZ=(-?\d+)\s+\|\s+GX=(-?\d+)\s+GY=(-?\d+)\s+GZ=(-?\d+)/;
const motorRegex = /Motor:\s+(ON|OFF)/;

// ─── State Cache ─────────────────────────────────────────────────────
const imuCache = { IMU1: { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 }, IMU2: { ax: 0, ay: 0, az: 0 }, IMU3: { ax: 0, ay: 0, az: 0 }, IMU4: { ax: 0, ay: 0, az: 0 } };
let currentFlex1 = 0;
let currentFlex2 = 0;

/* ══════════════════════════════════════════════════════════════════
 *  HAND UPDATE FUNCTIONS  (modular, no cross-mixing)
 * ══════════════════════════════════════════════════════════════════ */

/**
 * updateWrist(roll)
 * Rotate entire handGroup around palm center based on wrist roll angle.
 * Recolor palm red if tilt exceeds ±20°.
 * @param {number} roll – degrees, positive = tilt right
 */
function updateWrist(roll) {
    // Pivot around palm center (150, 245)
    handGroup.setAttribute('transform', `rotate(${roll.toFixed(1)}, 150, 245)`);

    // Palm color feedback
    if (Math.abs(roll) > 30) {
        palmRect.setAttribute('fill', '#2a1010');
        palmRect.setAttribute('stroke', '#f85149');
    } else if (Math.abs(roll) > 15) {
        palmRect.setAttribute('fill', '#1e2010');
        palmRect.setAttribute('stroke', '#e3b341');
    } else {
        palmRect.setAttribute('fill', '#1e2530');
        palmRect.setAttribute('stroke', '#444c56');
    }

    wristRollVal.textContent = `${roll.toFixed(1)}°`;
    statWrist.textContent = `${roll.toFixed(1)}°`;
}

/**
 * updateFinger(id, angle)
 * Rotate a finger group around its knuckle base. Apply color by threshold.
 * Also updates the grip bar and label.
 * @param {string} id    – 'thumb'|'index'|'middle'|'ring'|'pinky'
 * @param {number} angle – degrees of flex (0=straight, 90=fully curled)
 */
function updateFinger(id, angle) {
    const group = fingerGroups[id];
    const base = fingerBases[id];
    if (!group || !base) return;

    // Clamp & rotate
    const clamped = Math.min(90, Math.max(0, angle));
    group.setAttribute('transform', `rotate(${clamped}, ${base.x}, ${base.y})`);

    // Determine state color
    let color, shadowClass;
    if (clamped < 20) {
        color = '#3fb950'; shadowClass = 'state-normal';
    } else if (clamped < 60) {
        color = '#e3b341'; shadowClass = 'state-warning';
    } else {
        color = '#f85149'; shadowClass = 'state-error';
    }

    // Color both segments
    const segs = group.querySelectorAll('line');
    segs.forEach(seg => { seg.setAttribute('stroke', color); });

    // Grip bar update
    const grip = gripFills[id];
    if (grip) {
        const pct = (clamped / 90) * 100;
        grip.bar.style.width = `${pct}%`;
        grip.bar.className = `grip-fill ${shadowClass}`;
        grip.val.textContent = `${Math.round(clamped)}°`;
    }

    // Angle label
    if (fingerLabels[id]) {
        fingerLabels[id].textContent = `${Math.round(clamped)}°`;
    }
}

/**
 * updateTremor(rms)
 * Update tremor arc gauge, shake animation, and glow filter.
 * @param {number} rms – gyroscope RMS (raw units scale, ~0–8000)
 */
function updateTremor(rms) {
    // Arc path circumference = πr ≈ 157 for r=50
    const arcLen = 157;
    const maxRms = 6000;
    const fraction = Math.min(1, rms / maxRms);
    const fill = fraction * arcLen;
    tremorArcFill.setAttribute('stroke-dasharray', `${fill.toFixed(1)} ${arcLen}`);

    tremorRmsEl.textContent = rms.toFixed(0);

    const svgEl = document.getElementById('handSVG');

    if (rms > 3000) {
        // ERROR: strong tremor
        tremorStateEl.textContent = 'High Tremor';
        tremorStateEl.className = 'tremor-state-label state-error';
        tremorRmsEl.style.color = 'var(--col-error)';
        svgEl.classList.add('tremor-active');
        svgEl.style.filter = 'drop-shadow(0 0 14px rgba(248,81,73,0.85))';
    } else if (rms > 1200) {
        // WARNING: mild tremor
        tremorStateEl.textContent = 'Mild Tremor';
        tremorStateEl.className = 'tremor-state-label state-warning';
        tremorRmsEl.style.color = 'var(--col-warning)';
        svgEl.classList.remove('tremor-active');
        svgEl.style.filter = 'drop-shadow(0 0 8px rgba(227,179,65,0.5))';
    } else {
        // NORMAL: stable
        tremorStateEl.textContent = 'Stable';
        tremorStateEl.className = 'tremor-state-label state-normal';
        tremorRmsEl.style.color = 'var(--col-normal)';
        svgEl.classList.remove('tremor-active');
        svgEl.style.filter = 'drop-shadow(0 0 6px rgba(63,185,80,0.2))';
    }
}

/**
 * updateScore(score)
 * Update the circular posture score ring.
 * @param {number} score – 0–100
 */
function updateScore(score) {
    const clamped = Math.min(100, Math.max(0, score));
    const circum = 2 * Math.PI * 50; // r=50 → 314.16
    const fill = (clamped / 100) * circum;

    scoreRingFill.setAttribute('stroke-dasharray', `${fill.toFixed(1)} ${circum.toFixed(1)}`);
    scoreNum.textContent = Math.round(clamped);

    const scoreCard = document.getElementById('score-card');

    if (clamped >= 75) {
        scoreRingFill.setAttribute('stroke', '#3fb950');
        scoreNum.style.color = '#3fb950';
        scoreStateLabel.textContent = 'Excellent';
        scoreStateLabel.style.background = 'rgba(63,185,80,0.12)';
        scoreStateLabel.style.color = 'var(--col-normal)';
    } else if (clamped >= 45) {
        scoreRingFill.setAttribute('stroke', '#e3b341');
        scoreNum.style.color = '#e3b341';
        scoreStateLabel.textContent = 'Moderate';
        scoreStateLabel.style.background = 'rgba(227,179,65,0.12)';
        scoreStateLabel.style.color = 'var(--col-warning)';
    } else {
        scoreRingFill.setAttribute('stroke', '#f85149');
        scoreNum.style.color = '#f85149';
        scoreStateLabel.textContent = 'Poor';
        scoreStateLabel.style.background = 'rgba(248,81,73,0.12)';
        scoreStateLabel.style.color = 'var(--col-error)';
    }
}

/* ══════════════════════════════════════════════════════════════════
 *  DATA DERIVATION
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Derive wrist roll from IMU1 accelerometer (pitch from ax/az)
 */
function deriveRoll(ax, ay, az) {
    return Math.atan2(ax, az) * (180 / Math.PI);
}

/**
 * Map flex sensor raw (0–4095) to finger angle (0–90°)
 * Calibrated so: ~800 ≈ straight (0°), ~3500 ≈ fully bent (90°)
 */
function flexToAngle(raw) {
    const minRaw = 800;
    const maxRaw = 3500;
    const angle = ((raw - minRaw) / (maxRaw - minRaw)) * 90;
    return Math.min(90, Math.max(0, angle));
}

/**
 * deriveFingerAngle(ax, ay, az)
 * Derive a 0–90° finger bend angle from IMU accelerometer using pitch.
 * Sensor mounted on finger: pitch increases as finger curls.
 * Raw range approx –16384..+16384 (±2g scale).
 * 0° = finger extended, 90° = finger fully curled.
 * @returns {number} angle in degrees
 */
function deriveFingerAngle(ax, ay, az) {
    // Pitch = atan2(ay, sqrt(ax^2 + az^2))  →  -90..+90 deg
    const pitch = Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI);
    // Map: 0°pitch = extended, −90°pitch = curled down (palm side)
    // Take absolute value and clamp to 0–90
    return Math.min(90, Math.max(0, Math.abs(pitch)));
}

/**
 * IMU → Finger mapping:
 *   IMU4 → Thumb
 *   IMU3 → Index
 *   IMU2 → Middle
 *   IMU1 → Pinky  (little finger)
 *   Ring  → average of Index + Pinky angles (no dedicated IMU)
 */
const imuFingerAngles = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };

/** Update the ring finger from current index + pinky angles */
function updateRingFromNeighbors() {
    const angle = (imuFingerAngles.index * 0.55 + imuFingerAngles.pinky * 0.45);
    imuFingerAngles.ring = angle;
    updateFinger('ring', angle);
}

/**
 * Compute gyroscope RMS across all 4 IMUs for tremor estimation.
 * Uses gx channels as the primary tremor axis.
 */
function computeTremorRMS() {
    const vals = ['IMU1', 'IMU2', 'IMU3', 'IMU4'].map(k => imuCache[k] ? imuCache[k].gx || 0 : 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
}

/**
 * Compute posture score (0–100) based on deviation from calibrated baseline.
 * After calibration, the calibrated position = 100. The further you deviate
 * from baseline wrist roll and finger angles, the lower the score.
 * If not calibrated (baseline all zero), uses a generous default.
 */
function computeScore(roll) {
    const angles = imuFingerAngles;

    // Wrist deviation from baseline
    const wristDev = Math.abs(roll - baseline.roll);
    const wristPenalty = Math.min(40, wristDev * 1.0);

    // Finger deviation from baseline (average across all fingers)
    const fingerDevs = [
        Math.abs(angles.thumb - baseline.thumb),
        Math.abs(angles.index - baseline.index),
        Math.abs(angles.middle - baseline.middle),
        Math.abs(angles.ring - baseline.ring),
        Math.abs(angles.pinky - baseline.pinky),
    ];
    const avgFingerDev = fingerDevs.reduce((a, b) => a + b, 0) / fingerDevs.length;
    const fingerPenalty = Math.min(40, (avgFingerDev / 45) * 40);

    // Tremor penalty (baseline-relative)
    const tremorRms = computeTremorRMS();
    const tremorDev = Math.abs(tremorRms - baseline.rms);
    const tremorPenalty = Math.min(20, (tremorDev / 3000) * 20);

    return Math.max(0, 100 - wristPenalty - fingerPenalty - tremorPenalty);
}

/* ══════════════════════════════════════════════════════════════════
 *  SENSOR DATA PROCESSING
 * ══════════════════════════════════════════════════════════════════ */

function processLine(line) {
    // Terminal log (IMU, flex, or motor lines)
    if (line.match(imuRegex) || line.match(flexRegex) || line.match(motorRegex)) {
        const div = document.createElement('div');
        div.textContent = line;
        terminal.appendChild(div);
        if (terminal.childNodes.length > 60) terminal.removeChild(terminal.firstChild);
        terminal.scrollTop = terminal.scrollHeight;
        packetCount++;
        statPackets.textContent = packetCount;
    }

    // Parse Motor state
    const motorMatch = line.match(motorRegex);
    if (motorMatch && statMotorEl) {
        const isOn = motorMatch[1] === 'ON';
        statMotorEl.textContent = motorMatch[1];
        statMotorEl.style.color = isOn ? 'var(--col-error)' : 'var(--col-normal)';
    }

    // Parse FLEX  (stats display only — fingers are now IMU-driven)
    const flexMatch = line.match(flexRegex);
    if (flexMatch) {
        currentFlex1 = parseInt(flexMatch[1]);
        currentFlex2 = parseInt(flexMatch[3]);
        statFlex1.textContent = currentFlex1;
        statFlex2.textContent = currentFlex2;
    }

    // Parse IMU
    const imuMatch = line.match(imuRegex);
    if (imuMatch) {
        const id = imuMatch[1];
        imuCache[id] = {
            ax: parseInt(imuMatch[2]), ay: parseInt(imuMatch[3]), az: parseInt(imuMatch[4]),
            gx: parseInt(imuMatch[5]), gy: parseInt(imuMatch[6]), gz: parseInt(imuMatch[7]),
        };

        const d = imuCache[id];

        // Update raw visual bars
        updateIMU(id, d.ax, d.ay, d.az, d.gx, d.gy, d.gz);

        const fingerAngle = deriveFingerAngle(d.ax, d.ay, d.az);

        // ── IMU → Finger routing ──────────────────────────────
        if (id === 'IMU4') {
            imuFingerAngles.thumb = fingerAngle;
            updateFinger('thumb', fingerAngle);
        } else if (id === 'IMU3') {
            imuFingerAngles.index = fingerAngle;
            updateFinger('index', fingerAngle);
        } else if (id === 'IMU2') {
            imuFingerAngles.middle = fingerAngle;
            updateFinger('middle', fingerAngle);
        } else if (id === 'IMU1') {
            imuFingerAngles.pinky = fingerAngle;
            updateFinger('pinky', fingerAngle);
            // Wrist roll also from IMU1 (mounted at wrist/base)
            const roll = deriveRoll(d.ax, d.ay, d.az);
            updateWrist(roll);
        }

        // Ring finger = weighted blend of index + pinky (no dedicated IMU)
        updateRingFromNeighbors();

        // Tremor from all IMUs (recalculated on every IMU packet)
        const rms = computeTremorRMS();
        updateTremor(rms);

        // Update live chart — only when serial port is connected, only from IMU1
        if (tremorChart && port && id === 'IMU1') {
            const ds0 = tremorChart.data.datasets[0].data;
            ds0.push(d.gx);
            if (ds0.length > chartMaxDataPoints) ds0.shift();
            // Skip calling tremorChart.update here; the sim loop handles it, real data batches it below
            tremorChart.update('none');
        }

        // Score based on current IMU angles + wrist roll
        const roll = deriveRoll(imuCache.IMU1.ax, imuCache.IMU1.ay, imuCache.IMU1.az);
        const score = computeScore(roll);
        updateScore(score);

        // Track current state for testing/calibration
        currentRawData = {
            roll: roll,
            index: imuFingerAngles.index,
            middle: imuFingerAngles.middle,
            ring: imuFingerAngles.ring,
            pinky: imuFingerAngles.pinky,
            thumb: imuFingerAngles.thumb,
            rms: rms,
            score: score
        };
    }
}

/* ══════════════════════════════════════════════════════════════════
 *  SESSION TIMER
 * ══════════════════════════════════════════════════════════════════ */
function startSessionTimer() {
    sessionStart = Date.now();
    sessionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        statUptime.textContent = `${m}:${s}`;
    }, 1000);
}

function stopSessionTimer() {
    clearInterval(sessionTimer);
    sessionTimer = null;
    statUptime.textContent = '00:00';
}

/* ══════════════════════════════════════════════════════════════════
 *  SERIAL CONNECT / DISCONNECT
 * ══════════════════════════════════════════════════════════════════ */
connectBtn.addEventListener('click', async () => {
    if (port) { await disconnect(); return; }
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });  // must match Serial.begin() in Arduino

        // Open writer for sending commands to Arduino
        const encoder = new TextEncoderStream();
        outputStream = encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        connectBtn.textContent = 'Disconnect';
        connectBtn.style.background = '#f85149';
        connectBtn.style.boxShadow = '0 4px 14px rgba(248,81,73,0.3)';
        connStatus.classList.add('connected');
        logConnStatus.classList.add('connected');
        terminal.innerHTML = '<div>Connected — waiting for data…</div>';
        statStatusEl.textContent = 'Connected';
        packetCount = 0;

        // Enable motor button
        motorToggleBtn.disabled = false;
        motorToggleBtn.style.opacity = '1';
        motorToggleBtn.style.cursor = 'pointer';
        setMotorBtnState(false);  // assume OFF at connect time

        startSessionTimer();
        readLoop();
    } catch (e) {
        console.error(e);
        alert('Failed to connect: ' + e);
        port = null;
    }
});

async function readLoop() {
    const decoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(decoder.writable);
    inputStream = decoder.readable;
    reader = inputStream.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (value) {
                lineBuffer += value;
                let lines = lineBuffer.split('\n');
                lineBuffer = lines.pop();
                for (const line of lines) processLine(line.trim());
            }
            if (done) { reader.releaseLock(); break; }
        }
    } catch (err) {
        console.error('[readLoop]', err);
    }
}

async function disconnect() {
    if (writer) { await writer.close().catch(() => {}); writer = null; }
    if (outputStream) { await outputStream.catch(() => {}); outputStream = null; }
    if (reader) { await reader.cancel(); reader = null; }
    if (inputDone) { await inputDone.catch(() => { }); inputDone = null; }
    if (port) { await port.close(); port = null; }
    connectBtn.textContent = 'Connect Serial';
    connectBtn.style.background = 'var(--primary)';
    connectBtn.style.boxShadow = '0 4px 14px rgba(88,166,255,0.3)';
    connStatus.classList.remove('connected');
    logConnStatus.classList.remove('connected');
    terminal.innerHTML += '<div>Disconnected.</div>';
    statStatusEl.textContent = 'Disconnected';

    // Disable motor button
    motorToggleBtn.disabled = true;
    motorToggleBtn.style.opacity = '0.4';
    motorToggleBtn.style.cursor = 'not-allowed';
    setMotorBtnState(false);

    stopSessionTimer();
}

/* ══════════════════════════════════════════════════════════════════
 *  CALIBRATION PROFILES (localStorage)
 * ══════════════════════════════════════════════════════════════════ */

const PROFILES_KEY = 'glove_calibration_profiles';
const ACTIVE_PROFILE_KEY = 'glove_active_profile';
const profileSelect = document.getElementById('profileSelect');
const deleteProfileBtn = document.getElementById('deleteProfileBtn');

function loadProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {}; }
    catch { return {}; }
}

function saveProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function refreshProfileDropdown() {
    const profiles = loadProfiles();
    const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY) || '';

    // Clear all options except the first
    profileSelect.innerHTML = '<option value="">— No Profile —</option>';

    Object.keys(profiles).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        profileSelect.appendChild(opt);
    });

    profileSelect.value = activeId;
}

function applyProfile(name) {
    const profiles = loadProfiles();
    if (name && profiles[name]) {
        baseline = { ...profiles[name] };
        localStorage.setItem(ACTIVE_PROFILE_KEY, name);
        console.log(`Profile loaded: "${name}"`, baseline);
    } else {
        baseline = { roll: 0, index: 0, middle: 0, ring: 0, pinky: 0, thumb: 0, rms: 0 };
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
}

// On dropdown change
profileSelect.addEventListener('change', () => {
    applyProfile(profileSelect.value);
});

// Calibrate → start/stop toggle
let calibrationSampler = null;
let calibrationSamples = [];
let calibrationProfileName = '';

calibrateBtn.addEventListener('click', () => {
    if (calibrationSampler) {
        // ── STOP calibration ──
        clearInterval(calibrationSampler);
        calibrationSampler = null;

        if (calibrationSamples.length === 0) {
            calibrateBtn.textContent = 'Calibrate';
            return;
        }

        // Average all samples
        const avg = { roll: 0, index: 0, middle: 0, ring: 0, pinky: 0, thumb: 0, rms: 0 };
        const keys = Object.keys(avg);
        calibrationSamples.forEach(s => { keys.forEach(k => { avg[k] += (s[k] || 0); }); });
        keys.forEach(k => { avg[k] /= calibrationSamples.length; });

        baseline = avg;

        const profiles = loadProfiles();
        profiles[calibrationProfileName] = { ...baseline };
        saveProfiles(profiles);
        localStorage.setItem(ACTIVE_PROFILE_KEY, calibrationProfileName);

        refreshProfileDropdown();
        profileSelect.value = calibrationProfileName;

        console.log(`Profile saved: "${calibrationProfileName}" (${calibrationSamples.length} samples averaged)`, baseline);
        calibrationSamples = [];

        calibrateBtn.textContent = 'Saved!';
        calibrateBtn.style.background = '';
        calibrateBtn.style.borderColor = '';
        calibrateBtn.style.color = '';
        setTimeout(() => { calibrateBtn.textContent = 'Calibrate'; }, 1500);
    } else {
        // ── START calibration ──
        let profileName = profileSelect.value;
        if (!profileName) {
            profileName = prompt('Enter a name for this calibration profile\n(e.g. Cursive, Caps, Print):');
            if (!profileName || !profileName.trim()) return;
            profileName = profileName.trim();
        }
        calibrationProfileName = profileName;
        calibrationSamples = [];

        calibrateBtn.textContent = '⏺ Stop Calibration';
        calibrateBtn.style.background = 'rgba(248,81,73,0.15)';
        calibrateBtn.style.borderColor = '#f85149';
        calibrateBtn.style.color = '#f85149';

        // Sample every 100ms until user clicks stop
        calibrationSampler = setInterval(() => {
            calibrationSamples.push({ ...currentRawData });
        }, 100);
    }
});

// Delete profile
deleteProfileBtn.addEventListener('click', () => {
    const name = profileSelect.value;
    if (!name) return;
    if (!confirm(`Delete profile "${name}"?`)) return;

    const profiles = loadProfiles();
    delete profiles[name];
    saveProfiles(profiles);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);

    baseline = { roll: 0, index: 0, middle: 0, ring: 0, pinky: 0, thumb: 0, rms: 0 };
    refreshProfileDropdown();
});

// Load saved profiles on startup
refreshProfileDropdown();
applyProfile(localStorage.getItem(ACTIVE_PROFILE_KEY) || '');

testBtn.addEventListener('click', () => {
    if (!isRecording) {
        // Start recording
        isRecording = true;
        recordedData = [];
        testText.textContent = 'Stop Test';
        testBtn.style.background = '#f85149';
        testBtn.style.boxShadow = '0 4px 14px rgba(248,81,73,0.3)';
        recordDot.classList.remove('hidden');
        analyzeBtn.classList.add('hidden');

        // Record data every 100ms
        recordInterval = setInterval(() => {
            recordedData.push({
                timestamp: Date.now(),
                ...currentRawData
            });
        }, 100);
    } else {
        // Stop recording
        isRecording = false;
        clearInterval(recordInterval);
        testText.textContent = 'Start Test';
        testBtn.style.background = 'var(--primary)';
        testBtn.style.boxShadow = '0 4px 14px rgba(88,166,255,0.3)';
        recordDot.classList.add('hidden');

        // Show analyze button if we have data
        if (recordedData.length > 0) {
            analyzeBtn.classList.remove('hidden');
        }
    }
});

// Results panel elements
const resultsPanel = document.getElementById('results-panel');
const resultsSeverity = document.getElementById('results-severity');
const resultsCloseBtn = document.getElementById('results-close');
const resultsDownloadBtn = document.getElementById('results-download');

let lastAnalysisOutput = null;

analyzeBtn.addEventListener('click', () => {
    if (recordedData.length === 0) return;

    // Compute baseline-relative tremor values
    const tremorValues = recordedData.map(d => Math.abs(d.rms - baseline.rms));
    const avgTremor = tremorValues.reduce((a, b) => a + b, 0) / tremorValues.length;
    const peakTremor = Math.max(...tremorValues);
    const minTremor = Math.min(...tremorValues);

    // Duration
    const startTime = recordedData[0].timestamp;
    const endTime = recordedData[recordedData.length - 1].timestamp;
    const durationMs = endTime - startTime;

    // Classify tremor severity based on baseline-relative average
    let severity = 'Normal';
    if (avgTremor > 3000) severity = 'Severe';
    else if (avgTremor > 1200) severity = 'Moderate';
    else if (avgTremor > 500) severity = 'Mild';

    // Count time spent in each severity zone
    const zones = { normal: 0, mild: 0, moderate: 0, severe: 0 };
    tremorValues.forEach(v => {
        if (v > 3000) zones.severe++;
        else if (v > 1200) zones.moderate++;
        else if (v > 500) zones.mild++;
        else zones.normal++;
    });
    const total = tremorValues.length;
    const zonePcts = {
        normal: ((zones.normal / total) * 100),
        mild: ((zones.mild / total) * 100),
        moderate: ((zones.moderate / total) * 100),
        severe: ((zones.severe / total) * 100)
    };

    // ── Populate the UI panel ──
    resultsSeverity.textContent = severity;
    resultsSeverity.className = 'results-severity sev-' + severity.toLowerCase();

    document.getElementById('res-duration').textContent = (durationMs / 1000).toFixed(1) + 's';
    document.getElementById('res-avg').textContent = avgTremor.toFixed(0) + ' RMS';
    document.getElementById('res-peak').textContent = peakTremor.toFixed(0) + ' RMS';
    document.getElementById('res-min').textContent = minTremor.toFixed(0) + ' RMS';
    document.getElementById('res-samples').textContent = recordedData.length;

    document.getElementById('zone-bar-normal').style.width = zonePcts.normal + '%';
    document.getElementById('zone-bar-mild').style.width = zonePcts.mild + '%';
    document.getElementById('zone-bar-moderate').style.width = zonePcts.moderate + '%';
    document.getElementById('zone-bar-severe').style.width = zonePcts.severe + '%';

    document.getElementById('zone-pct-normal').textContent = zonePcts.normal.toFixed(1) + '%';
    document.getElementById('zone-pct-mild').textContent = zonePcts.mild.toFixed(1) + '%';
    document.getElementById('zone-pct-moderate').textContent = zonePcts.moderate.toFixed(1) + '%';
    document.getElementById('zone-pct-severe').textContent = zonePcts.severe.toFixed(1) + '%';

    // Show panel
    resultsPanel.classList.remove('hidden');
    resultsPanel.scrollIntoView({ behavior: 'smooth' });

    // Store output for download
    lastAnalysisOutput = {
        sessionType: "Tremor Analysis",
        date: new Date().toISOString(),
        durationSeconds: Number((durationMs / 1000).toFixed(2)),
        sampleCount: recordedData.length,
        baselineTremorRMS: Number(baseline.rms.toFixed(2)),
        results: {
            severity: severity,
            averageTremorRMS: Number(avgTremor.toFixed(2)),
            peakTremorRMS: Number(peakTremor.toFixed(2)),
            minTremorRMS: Number(minTremor.toFixed(2)),
            zoneBreakdown: {
                normal: zonePcts.normal.toFixed(1) + '%',
                mild: zonePcts.mild.toFixed(1) + '%',
                moderate: zonePcts.moderate.toFixed(1) + '%',
                severe: zonePcts.severe.toFixed(1) + '%'
            }
        },
        timeline: recordedData.map(d => ({
            time: new Date(d.timestamp).toISOString(),
            tremorRMS: Number(Math.abs(d.rms - baseline.rms).toFixed(2))
        }))
    };

    // Hide analyze button
    analyzeBtn.classList.add('hidden');
    recordedData = [];
});

resultsCloseBtn.addEventListener('click', () => {
    resultsPanel.classList.add('hidden');
});

resultsDownloadBtn.addEventListener('click', () => {
    if (!lastAnalysisOutput) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastAnalysisOutput, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `tremor_analysis_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

/* ══════════════════════════════════════════════════════════════════
 *  LIVE TREMOR GRAPH (always-on demo when no serial port open)
 * ══════════════════════════════════════════════════════════════════ */
const chartMaxDataPoints = 120;
let tremorChart;
const ctx = document.getElementById('tremorChart')?.getContext('2d');

if (ctx) {
    tremorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(chartMaxDataPoints).fill(''),
            datasets: [
                {
                    label: 'Gyro X (Primary)',
                    data: Array(chartMaxDataPoints).fill(null),
                    borderColor: '#f85149',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    backgroundColor: 'rgba(248, 81, 73, 0.07)',
                    tension: 0.15,    // reduced from 0.45 → sharper, more natural
                    spanGaps: false
                },
                {
                    label: 'Envelope',
                    data: Array(chartMaxDataPoints).fill(null),
                    borderColor: 'rgba(227, 179, 65, 0.5)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    borderDash: [5, 5],
                    tension: 0.3,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: {
                    min: -10000,
                    max: 10000,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#8b949e', font: { size: 10 } },
                    border: { color: 'rgba(255,255,255,0.1)' }
                },
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { color: 'rgba(255,255,255,0.1)' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function pushChartData(primary, envelope) {
    if (!tremorChart) return;
    const d0 = tremorChart.data.datasets[0].data;
    const d1 = tremorChart.data.datasets[1].data;
    d0.push(primary);
    d1.push(envelope);
    if (d0.length > chartMaxDataPoints) d0.shift();
    if (d1.length > chartMaxDataPoints) d1.shift();
}

function resetChart() {
    if (!tremorChart) return;
    tremorChart.data.datasets[0].data = Array(chartMaxDataPoints).fill(null);
    tremorChart.data.datasets[1].data = Array(chartMaxDataPoints).fill(null);
    tremorChart.update('none');
}

// ── Demo tremor state (always-on when no serial port) ─────────────
// Slow random-walk baseline that keeps the signal from sitting perfectly at 0
let baselineDrift = 0, baselineDriftVel = 0;

// Burst state — occasional short-lived activity clusters
let burstEnergy = 0;

// Pink noise filter state
let noisePrev1 = 0, noisePrev2 = 0;
// Second independent noise channel for extra texture
let noisePrev3 = 0, noisePrev4 = 0;

function pinkNoiseSample() {
    const w = (Math.random() - 0.5) * 2;
    noisePrev1 = 0.97 * noisePrev1 + 0.03 * w * 9000;
    noisePrev2 = 0.82 * noisePrev2 + 0.18 * noisePrev1;
    return noisePrev2;
}

function pinkNoiseSample2() {
    const w = (Math.random() - 0.5) * 2;
    noisePrev3 = 0.94 * noisePrev3 + 0.06 * w * 5000;
    noisePrev4 = 0.70 * noisePrev4 + 0.30 * noisePrev3;
    return noisePrev4;
}

// ── Per-finger / wrist slow oscillators ──────────────────────────
// Each finger has its own phase, speed, angle range, and noise level.
// These drive the AY/AZ accelerometer values so deriveFingerAngle()
// returns a smoothly changing bend angle for each finger.
const fingerOsc = {
    //        phase  freq(Hz)  minDeg  maxDeg  noiseAmp
    pinky:  { ph: Math.random() * 6.28, freq: 0.18, min: 5,  max: 75, noise: 600 },
    middle: { ph: Math.random() * 6.28, freq: 0.13, min: 3,  max: 65, noise: 500 },
    index:  { ph: Math.random() * 6.28, freq: 0.21, min: 4,  max: 70, noise: 550 },
    thumb:  { ph: Math.random() * 6.28, freq: 0.09, min: 8,  max: 55, noise: 400 },
};
// Wrist roll oscillator — slow sway ±25°
let wristOscPh = Math.random() * 6.28;
const WRIST_FREQ = 0.07;  // ~14 s period
const WRIST_AMP  = 22;    // degrees

/**
 * Convert a desired finger bend angle (0–90°) plus gyro GX value
 * into a synthetic IMU line string.
 * Uses: pitch = angle  →  AY = sin(angle)*16384, AZ = cos(angle)*16384
 * Gyro axes carry the tremor signal.
 */
function fingerToIMULine(imuId, angleDeg, gx, noiseAmp) {
    const rad = angleDeg * Math.PI / 180;
    const az  = Math.round(Math.cos(rad) * 16000 + (Math.random() - 0.5) * noiseAmp);
    const ay  = Math.round(Math.sin(rad) * 16000 + (Math.random() - 0.5) * noiseAmp);
    const ax  = Math.round((Math.random() - 0.5) * noiseAmp * 0.4);
    const gy  = Math.round((Math.random() - 0.5) * noiseAmp * 0.3);
    const gz  = Math.round((Math.random() - 0.5) * noiseAmp * 0.3);
    return `${imuId} | AX=${ax} AY=${ay} AZ=${az} | GX=${gx} GY=${gy} GZ=${gz}`;
}

/**
 * Convert a desired wrist roll angle (degrees) into AX/AZ for IMU1.
 * Uses: roll = atan2(ax, az)  →  AX = sin(roll)*16384, AZ = cos(roll)*16384
 */
function wristRollToAcc(rollDeg, noiseAmp) {
    const rad = rollDeg * Math.PI / 180;
    return {
        ax: Math.round(Math.sin(rad) * 16000 + (Math.random() - 0.5) * noiseAmp),
        az: Math.round(Math.cos(rad) * 16000 + (Math.random() - 0.5) * noiseAmp),
    };
}

// Inject demo data at 25 Hz (40 ms) — pauses when real serial port connects
setInterval(() => {
    if (port) return;

    const dt = 0.04;

    // ── Baseline drift — faster random walk, wider range ────────────
    baselineDriftVel += (Math.random() - 0.5) * 55;  // was 18
    baselineDriftVel *= 0.90;                          // faster decay
    baselineDrift    += baselineDriftVel;
    baselineDrift     = Math.max(-1600, Math.min(1600, baselineDrift)); // was ±900

    // ── Burst clusters — more frequent (~every 2 s) ───────────────────
    if (Math.random() < 0.02) {                        // was 0.008
        burstEnergy = 1800 + Math.random() * 3500;
    }
    burstEnergy *= 0.88;                               // slightly faster decay

    // ── Noise layers (all amplitudes increased) ───────────────────────
    const pink1 = pinkNoiseSample()  * 1.10;           // was 0.50
    const pink2 = pinkNoiseSample2() * 0.65;           // was 0.28
    const white = (Math.random() - 0.5) * 950;         // was 280 — heavy jitter

    // Sharp isolated spikes — more frequent and bigger
    const spike = Math.random() < 0.055                // was 0.025
        ? (Math.random() < 0.5 ? 1 : -1) * (2200 + Math.random() * 2800)
        : 0;
    // Medium blips — happen on ~35% of ticks
    const blip  = Math.random() < 0.35                 // was 0.08
        ? (Math.random() - 0.5) * 1400                 // was 700
        : 0;
    // Extra rapid micro-jitter layer
    const micro = (Math.random() - 0.5) * 420;

    // Burst contribution — sign alternates randomly so it's not directional
    const burstSign = Math.random() < 0.5 ? 1 : -1;
    const burstSig  = burstSign * burstEnergy * (0.5 + Math.random() * 0.5);

    const gxPrimary = Math.round(baselineDrift + pink1 + pink2 + white + spike + blip + micro + burstSig);
    const imuNoise  = () => Math.round((Math.random() - 0.5) * 600); // was 320

    // ── Advance per-finger oscillators ───────────────────────────────
    // Each finger oscillates between its min/max angle at its own frequency
    // with small random noise added so they never look perfectly sinusoidal.
    function nextAngle(osc) {
        osc.ph += osc.freq * 2 * Math.PI * dt;
        const base = osc.min + (osc.max - osc.min) * (0.5 + 0.5 * Math.sin(osc.ph));
        // Small angle-domain noise (capped so we stay in 0–90)
        const jitter = (Math.random() - 0.5) * 4.5;
        return Math.min(90, Math.max(0, base + jitter));
    }

    const angPinky  = nextAngle(fingerOsc.pinky);
    const angMiddle = nextAngle(fingerOsc.middle);
    const angIndex  = nextAngle(fingerOsc.index);
    const angThumb  = nextAngle(fingerOsc.thumb);

    // ── Wrist roll oscillator ─────────────────────────────────────────
    wristOscPh += WRIST_FREQ * 2 * Math.PI * dt;
    const wristRoll = WRIST_AMP * Math.sin(wristOscPh) + (Math.random() - 0.5) * 2.5;

    // ── Build realistic AX/AZ for IMU1 (pinky + wrist) ───────────────
    // IMU1 is at the wrist so roll comes from AX/AZ and pinky from AY/AZ.
    // We layer both effects; for simplicity wrist roll dominates AX/AZ,
    // and pinky pitch dominates AY.
    const wristAcc = wristRollToAcc(wristRoll, 400);
    const pinkyRad = angPinky * Math.PI / 180;
    const imu1ay   = Math.round(Math.sin(pinkyRad) * 16000 + (Math.random() - 0.5) * fingerOsc.pinky.noise);
    const imu1az   = Math.round(Math.cos(pinkyRad) * 16000 + (Math.random() - 0.5) * fingerOsc.pinky.noise);

    // ── Emit IMU lines ────────────────────────────────────────────────
    // IMU1 → Pinky / Wrist
    processLine(`IMU1 | AX=${wristAcc.ax} AY=${imu1ay} AZ=${imu1az} | GX=${gxPrimary} GY=${imuNoise()} GZ=${imuNoise()}`);
    // IMU2 → Middle
    processLine(fingerToIMULine('IMU2', angMiddle, Math.round(gxPrimary * 0.80 + imuNoise()), fingerOsc.middle.noise));
    // IMU3 → Index
    processLine(fingerToIMULine('IMU3', angIndex,  Math.round(gxPrimary * 0.88 + imuNoise()), fingerOsc.index.noise));
    // IMU4 → Thumb
    processLine(fingerToIMULine('IMU4', angThumb,  Math.round(gxPrimary * 0.68 + imuNoise()), fingerOsc.thumb.noise));

    // ── Envelope trace (shows burst energy level) ────────────────────
    pushChartData(null, Math.round(burstEnergy * 0.85));
    tremorChart.update('none');
}, 40);



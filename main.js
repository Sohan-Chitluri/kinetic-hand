let port;
let reader;
let inputDone;
let outputStream;
let inputStream;

const connectBtn = document.getElementById('connectBtn');
const connStatus = document.getElementById('conn-status');
const terminal = document.getElementById('terminal');

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

// Line Buffer
let lineBuffer = '';

// Regular Expressions for parsing
const flexRegex = /FLEX1:\s+(\d+)\s+\(([\d.]+)\s+V\)\s+\|\s+FLEX2:\s+(\d+)\s+\(([\d.]+)\s+V\)/;
const imuRegex = /(IMU[1-4])\s+\|\s+AX=(-?\d+)\s+AY=(-?\d+)\s+AZ=(-?\d+)\s+\|\s+GX=(-?\d+)\s+GY=(-?\d+)\s+GZ=(-?\d+)/;

function processLine(line) {
    // Print to terminal visually
    const div = document.createElement('div');
    div.textContent = line;
    terminal.appendChild(div);
    if (terminal.childNodes.length > 50) {
        terminal.removeChild(terminal.firstChild);
    }
    terminal.scrollTop = terminal.scrollHeight;

    // Parse logic
    const imuMatch = line.match(imuRegex);
    if (imuMatch) {
        const id = imuMatch[1];
        updateIMU(id,
            imuMatch[2], imuMatch[3], imuMatch[4],
            imuMatch[5], imuMatch[6], imuMatch[7]
        );
    }
}

connectBtn.addEventListener('click', async () => {
    if (port) {
        await disconnect();
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 }); // Assuming default ESP32 baudrate 115200
        connectBtn.textContent = 'Disconnect';
        connectBtn.style.background = '#f85149';
        connectBtn.style.boxShadow = '0 4px 14px rgba(248, 81, 73, 0.3)';
        connStatus.classList.add('connected');
        terminal.innerHTML = '<div>Connected... waiting for data...</div>';

        readLoop();
    } catch (e) {
        console.error(e);
        alert('Failed to connect to serial port: ' + e);
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
                lineBuffer = lines.pop(); // keep remainder

                for (let line of lines) {
                    processLine(line.trim());
                }
            }
            if (done) {
                console.log('[readLoop] DONE', done);
                reader.releaseLock();
                break;
            }
        }
    } catch (error) {
        console.error('[readLoop] Error:', error);
    }
}

async function disconnect() {
    if (reader) {
        await reader.cancel();
        reader = null;
    }
    if (inputDone) {
        await inputDone.catch(() => { });
        inputDone = null;
    }
    if (port) {
        await port.close();
        port = null;
    }
    connectBtn.textContent = 'Connect Serial';
    connectBtn.style.background = 'var(--primary)';
    connectBtn.style.boxShadow = '0 4px 14px rgba(88, 166, 255, 0.3)';
    connStatus.classList.remove('connected');
    terminal.innerHTML += '<div>Disconnected.</div>';
}

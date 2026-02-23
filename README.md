# 4-IMU Motion Sensing System (ESP32 + ESP-IDF)

## 📌 Overview

This project implements a **4-IMU motion sensing system** using:

- **ESP32**
- **4× MPU6050 IMUs**
- Dual hardware **I²C buses** (no multiplexer)
- **ESP-IDF firmware**
- Real-time **Web Serial dashboard UI**

The system reads accelerometer and gyroscope data from four IMUs and streams it live to a browser-based interface.

---

## 🧠 Hardware Setup

### I²C Bus 0
- **SDA → GPIO 21**
- **SCL → GPIO 22**
- **IMU1 → 0x68** (AD0 → GND)
- **IMU2 → 0x69** (AD0 → 3.3V)

### I²C Bus 1
- **SDA → GPIO 16**
- **SCL → GPIO 17**
- **IMU3 → 0x68** (AD0 → GND)
- **IMU4 → 0x69** (AD0 → 3.3V)

### All IMUs
- **VCC → 3.3V**
- **GND → Common ground**
- **XDA / XCL → Not connected**

---

## ⚙️ Firmware

- Framework: **ESP-IDF**
- Uses `I2C_NUM_0` and `I2C_NUM_1`
- Direct register communication
- No Arduino libraries
- Deterministic dual-bus operation

### 📡 Serial Output Format

```
IMU1 | AX=-123 AY=456 AZ=789 | GX=-10 GY=20 GZ=-5
IMU2 | ...
IMU3 | ...
IMU4 | ...
```

- **Baudrate:** `115200`

---

## 🌐 Web Dashboard

Built with:

- **HTML**
- **CSS**
- **JavaScript**
- **Web Serial API**

### ✨ Features

- Connect / Disconnect Serial
- Live accelerometer bars (X, Y, Z)
- Live gyroscope bars (X, Y, Z)
- Real-time serial console
- Color-coded axes
- Clean glass-style UI

---

## 📂 Project Structure

```
/firmware
  └── main.c (ESP-IDF)

/ui
  ├── index.html
  ├── main.js
  └── style.css
```

---

## 🚀 Running the Firmware

```bash
idf.py build
idf.py flash
idf.py monitor
```

---

## 🌍 Running the UI

1. Open `index.html` in **Chrome** or **Edge**
2. Click **Connect Serial**
3. Select ESP32 port
4. Live data starts streaming

---

## 📸 Screenshot

<img width="1853" height="939" alt="Screenshot 2026-02-23 171647" src="https://github.com/user-attachments/assets/5fd6eb04-45e5-460a-be08-e00b84bb2039" />

---

## 📈 Capabilities

- 4 independent IMUs
- Dual hardware I²C
- No multiplexer
- Real-time browser visualization
- Expandable architecture

---

## 📜 License

MIT License  


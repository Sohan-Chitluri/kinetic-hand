/**
 * Glove Controller - Motor + IMU (MPU6050)
 * ==========================================
 * - Button OR dashboard serial command toggles motor ON/OFF
 * - When ON: runs at constant low speed (no ramping)
 * - MPU6050 accelerometer + gyroscope data printed @ 200ms intervals
 * - Serial output format compatible with glove dashboard parser
 * - Send 'M\n' from dashboard to toggle motor remotely
 *
 * Wiring:
 *   Motor (+) VCC → motor power rail
 *   Motor (-) GND → Pin 5  ← SINK WIRING (D5 acts as GND)
 *   Button          → Pin 2  (other leg to GND; uses INPUT_PULLUP)
 *   MPU6050 SDA     → A4  (Uno) / 20 (Mega)
 *   MPU6050 SCL     → A5  (Uno) / 21 (Mega)
 *   MPU6050 VCC     → 3.3V
 *   MPU6050 GND     → GND
 *
 * NOTE: Sink wiring — D5 acts as GND
 *   Motor ON  → digitalWrite(5, LOW)   (completes circuit, motor runs)
 *   Motor OFF → digitalWrite(5, HIGH)  (breaks circuit, motor stops)
 *
 * TWO IMU WIRING:
 *   IMU1 (MPU6050 #1): AD0 → GND   → I2C address 0x68
 *   IMU2 (MPU6050 #2): AD0 → 3.3V  → I2C address 0x69
 *   Both share the same SDA/SCL lines
 */

#include <Wire.h>

// ── Pins ──────────────────────────────────────────────────────────────────────
const int MOTOR_PIN  = 5;   // PWM-capable pin
const int BUTTON_PIN = 2;   // Digital pin with INPUT_PULLUP

// ── MPU6050 ─────────────────────────────────────────────────────────────────────
const uint8_t IMU_ADDR[2] = { 0x68, 0x69 };  // IMU1=AD0 low, IMU2=AD0 high

struct ImuData {
  int16_t ax, ay, az;
  int16_t gx, gy, gz;
};

ImuData imu[2];  // imu[0] = IMU1, imu[1] = IMU2

// ── Motor ─────────────────────────────────────────────────────────────────────
bool motorEnabled = false;  // toggled by button or serial command
// Sink-wired: D5 = GND side
//   Motor ON  → digitalWrite(LOW)   = D5 is GND, current flows
//   Motor OFF → digitalWrite(HIGH)  = D5 is 5V, no voltage diff, stops

// ── Button debounce ───────────────────────────────────────────────────────────
bool lastButtonState       = HIGH;  // HIGH = not pressed (INPUT_PULLUP)
unsigned long lastDebounce = 0;
const unsigned long DEBOUNCE_MS = 50;

// ── IMU timing ────────────────────────────────────────────────────────────────
unsigned long lastImuPrint = 0;
const unsigned long IMU_INTERVAL = 200;  // ms

// ─────────────────────────────────────────────────────────────────────────────
void initIMU(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(0x6B);  // PWR_MGMT_1
  Wire.write(0);     // Wake up
  Wire.endTransmission(true);
}

void readIMU(uint8_t addr, ImuData &d) {
  Wire.beginTransmission(addr);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  Wire.endTransmission(false);
  Wire.requestFrom(addr, (uint8_t)14, (uint8_t)true);

  d.ax = Wire.read() << 8 | Wire.read();
  d.ay = Wire.read() << 8 | Wire.read();
  d.az = Wire.read() << 8 | Wire.read();
  Wire.read(); Wire.read();  // skip temperature
  d.gx = Wire.read() << 8 | Wire.read();
  d.gy = Wire.read() << 8 | Wire.read();
  d.gz = Wire.read() << 8 | Wire.read();
}

// label = "IMU1" or "IMU2", printMotor adds motor state to end of line
void printIMU(const char* label, ImuData &d, bool printMotor) {
  Serial.print(label);
  Serial.print(" | AX="); Serial.print(d.ax);
  Serial.print(" AY=");   Serial.print(d.ay);
  Serial.print(" AZ=");   Serial.print(d.az);
  Serial.print(" | GX="); Serial.print(d.gx);
  Serial.print(" GY=");   Serial.print(d.gy);
  Serial.print(" GZ=");   Serial.print(d.gz);
  if (printMotor) {
    Serial.print(" | Motor: ");
    Serial.print(motorEnabled ? "ON" : "OFF");
  }
  Serial.println();
}

// ─────────────────────────────────────────────────────────────────────────────
void handleButton() {
  bool reading = digitalRead(BUTTON_PIN);  // LOW = pressed (INPUT_PULLUP)

  if (reading != lastButtonState) {
    lastDebounce = millis();
  }

  if ((millis() - lastDebounce) > DEBOUNCE_MS) {
    static bool stableState = HIGH;
    if (reading == LOW && stableState == HIGH) {
      toggleMotor();  // use shared toggle (button press)
    }
    stableState = reading;
  }

  lastButtonState = reading;
}
// Shared motor toggle ────────────────────────────────────────────────────────────
void toggleMotor() {
  motorEnabled = !motorEnabled;
  if (motorEnabled) {
    digitalWrite(MOTOR_PIN, LOW);   // D5 = GND → current flows → motor ON
    Serial.println(">> Motor ENABLED");
  } else {
    digitalWrite(MOTOR_PIN, HIGH);  // D5 = 5V → no current → motor OFF
    Serial.println(">> Motor DISABLED");
  }
}

// ── Handle serial commands from dashboard ─────────────────────────────────────
void handleSerial() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'M' || c == 'm') {  // 'M' = motor toggle command
      toggleMotor();
    }
    // ignore \n, \r, and other chars
  }
}


// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  Wire.begin();

  pinMode(MOTOR_PIN,  OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  digitalWrite(MOTOR_PIN, HIGH);  // Start motor OFF (D5 HIGH = no current with sink wiring)

  // Init both IMUs
  initIMU(IMU_ADDR[0]);
  initIMU(IMU_ADDR[1]);
  Serial.println("== Glove Controller Ready (2x IMU) ==");
  Serial.println("Press button or send 'M' to toggle motor.");

  delay(500);  // brief settle time
}

void loop() {
  handleSerial();   // check for 'M' command from dashboard
  handleButton();

  // Read + print both IMUs at fixed interval
  unsigned long now = millis();
  if (now - lastImuPrint >= IMU_INTERVAL) {
    lastImuPrint = now;

    readIMU(IMU_ADDR[0], imu[0]);
    readIMU(IMU_ADDR[1], imu[1]);

    printIMU("IMU1", imu[0], false);   // IMU1 line (no motor field)
    printIMU("IMU2", imu[1], true);    // IMU2 line (+ motor state at end)
  }
}

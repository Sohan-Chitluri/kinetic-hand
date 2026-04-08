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
 */

#include <Wire.h>

// ── Pins ──────────────────────────────────────────────────────────────────────
const int MOTOR_PIN  = 5;   // PWM-capable pin
const int BUTTON_PIN = 2;   // Digital pin with INPUT_PULLUP

// ── MPU6050 ───────────────────────────────────────────────────────────────────
const int MPU_ADDR = 0x68;

int16_t accelX, accelY, accelZ;
int16_t gyroX,  gyroY,  gyroZ;

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
void initMPU6050() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);  // PWR_MGMT_1 register
  Wire.write(0);     // Wake up (clear sleep bit)
  Wire.endTransmission(true);
}

void readMPU6050() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);  // ACCEL_XOUT_H starting register
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, (uint8_t)14, (uint8_t)true);

  accelX = Wire.read() << 8 | Wire.read();
  accelY = Wire.read() << 8 | Wire.read();
  accelZ = Wire.read() << 8 | Wire.read();

  Wire.read(); Wire.read();  // skip temperature (2 bytes)

  gyroX = Wire.read() << 8 | Wire.read();
  gyroY = Wire.read() << 8 | Wire.read();
  gyroZ = Wire.read() << 8 | Wire.read();
}

void printIMU() {
  // Format matches dashboard imuRegex:
  // IMU1 | AX=X AY=Y AZ=Z | GX=X GY=Y GZ=Z | Motor: ON/OFF
  Serial.print("IMU1 | AX="); Serial.print(accelX);
  Serial.print(" AY=");       Serial.print(accelY);
  Serial.print(" AZ=");       Serial.print(accelZ);
  Serial.print(" | GX=");     Serial.print(gyroX);
  Serial.print(" GY=");       Serial.print(gyroY);
  Serial.print(" GZ=");       Serial.print(gyroZ);
  Serial.print(" | Motor: ");
  Serial.println(motorEnabled ? "ON" : "OFF");
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

  initMPU6050();
  Serial.println("== Glove Controller Ready ==");
  Serial.println("Press button to toggle motor.");

  delay(500);  // brief settle time
}

void loop() {
  handleSerial();   // check for 'M' command from dashboard
  handleButton();

  // IMU read + print at fixed interval
  unsigned long now = millis();
  if (now - lastImuPrint >= IMU_INTERVAL) {
    lastImuPrint = now;
    readMPU6050();
    printIMU();
  }
}

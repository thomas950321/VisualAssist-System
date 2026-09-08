/*
 * Blind Assist - Smart Cane Node
 * Target: ESP32-S3 DevKitC + JSN-SR04T + MPU6050 + VL53L0X + two vibration outputs.
 *
 * The firmware reports a deliberately small text protocol over BLE notifications:
 *   Dist:123.4,Angle:-4.2,ToF:181
 *
 * Hardware safety:
 * - JSN-SR04T ECHO may be 5 V. Use a resistor divider or level shifter before an ESP32 GPIO.
 * - Never drive a vibration motor directly from an ESP32 GPIO. Use a transistor/MOSFET driver
 *   module with a flyback diode, or a ready-made 3 V vibration motor driver board.
 */

#include <Arduino.h>
#include <Wire.h>
#include <NewPing.h>
#include <MPU6050_tockn.h>
#include <Adafruit_VL53L0X.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <math.h>

// ---------- Pin map: verify against the exact ESP32-S3 DevKitC revision ----------
#define ULTRASONIC_TRIG_PIN 5
#define ULTRASONIC_ECHO_PIN 18
#define MAX_DISTANCE_CM 400
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define LEFT_MOTOR_PIN 25
#define RIGHT_MOTOR_PIN 26

// ---------- Detection policy ----------
#define FRONT_ANGLE_WINDOW_DEG 15.0f
#define OBSTACLE_ENTER_CM 90.0f
#define OBSTACLE_EXIT_CM 115.0f
#define PIT_DELTA_MM 130
#define TOF_INVALID_MM 8190
#define SENSOR_PERIOD_MS 80
#define NOTIFY_PERIOD_MS 120
#define VIBRATION_PERIOD_MS 40

// ---------- BLE UUIDs shared with the mobile app ----------
#define CANE_SERVICE_UUID "19b10f00-e8f2-537e-4f6c-d104768a1214"
#define CANE_CHARACTERISTIC_UUID "19b10f01-e8f2-537e-4f6c-d104768a1214"

NewPing sonar(ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN, MAX_DISTANCE_CM);
MPU6050 mpu(Wire);
Adafruit_VL53L0X tofSensor;
BLECharacteristic* telemetryCharacteristic = nullptr;
bool deviceConnected = false;
bool tofAvailable = false;

float compensatedDistanceCm = MAX_DISTANCE_CM;
float lastDistanceCm = MAX_DISTANCE_CM;
float angleDeg = 0.0f;
uint16_t tofMm = 500;
float tofBaselineMm = 180.0f;
bool obstacleActive = false;
bool pitActive = false;
uint32_t lastSensorMs = 0;
uint32_t lastNotifyMs = 0;
uint32_t lastVibrationMs = 0;
uint32_t lastTofCalibrationMs = 0;
uint32_t vibrationStopMs = 0;

class CaneServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    deviceConnected = true;
    Serial.println("Cane BLE connected");
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    Serial.println("Cane BLE disconnected");
    server->startAdvertising();
  }
};

static void setMotors(bool left, bool right) {
  // These GPIOs must control a transistor/MOSFET driver board, not the motors directly.
  digitalWrite(LEFT_MOTOR_PIN, left ? HIGH : LOW);
  digitalWrite(RIGHT_MOTOR_PIN, right ? HIGH : LOW);
}

static void urgentVibration() {
  const uint32_t now = millis();
  if (now - lastVibrationMs < VIBRATION_PERIOD_MS) return;
  lastVibrationMs = now;
  const bool pulse = ((now / VIBRATION_PERIOD_MS) % 2) == 0;
  setMotors(pulse, pulse);
}

static void pitVibration() {
  const uint32_t now = millis();
  if (now >= vibrationStopMs && now - lastVibrationMs >= 550) {
    lastVibrationMs = now;
    vibrationStopMs = now + 220;
    setMotors(true, false);
    return;
  }
  if (now >= vibrationStopMs) setMotors(false, false);
}

static float readUltrasonicCm() {
  const unsigned int rawCm = sonar.ping_cm();
  if (rawCm == 0) return MAX_DISTANCE_CM;
  return static_cast<float>(rawCm);
}

static uint16_t readTofMm() {
  if (!tofAvailable) return TOF_INVALID_MM;
  VL53L0X_RangingMeasurementData_t measurement;
  tofSensor.rangingTest(&measurement, false);
  if (measurement.RangeStatus == 4) return TOF_INVALID_MM;
  return measurement.RangeMilliMeter;
}

static void updateSensorFusion() {
  mpu.update();
  angleDeg = mpu.getAngleX();
  const float thetaRad = angleDeg * PI / 180.0f;
  const bool isInFrontWindow = fabsf(angleDeg) <= FRONT_ANGLE_WINDOW_DEG;

  if (isInFrontWindow) {
    const float rawDistance = readUltrasonicCm();
    const float corrected = rawDistance * cosf(thetaRad);
    // A median-like exponential filter reduces hand-swing spikes without hiding urgency.
    compensatedDistanceCm = 0.65f * compensatedDistanceCm + 0.35f * corrected;
    lastDistanceCm = compensatedDistanceCm;
  } else {
    compensatedDistanceCm = MAX_DISTANCE_CM;
  }

  tofMm = readTofMm();
  if (tofAvailable && tofMm != TOF_INVALID_MM && millis() - lastTofCalibrationMs < 4000) {
    tofBaselineMm = 0.92f * tofBaselineMm + 0.08f * static_cast<float>(tofMm);
  }

  const bool obstacleCandidate = isInFrontWindow && compensatedDistanceCm < OBSTACLE_ENTER_CM;
  if (obstacleActive) {
    obstacleActive = isInFrontWindow && compensatedDistanceCm < OBSTACLE_EXIT_CM;
  } else {
    obstacleActive = obstacleCandidate;
  }

  // ToF is installed downward. A sudden increase over the startup ground baseline
  // indicates a possible downward transition; it is a warning, not a proof of a pit.
  pitActive = tofAvailable && tofMm != TOF_INVALID_MM && static_cast<float>(tofMm) > tofBaselineMm + PIT_DELTA_MM;
}

static void notifyTelemetry() {
  if (!deviceConnected || !telemetryCharacteristic) return;
  const uint32_t now = millis();
  if (now - lastNotifyMs < NOTIFY_PERIOD_MS) return;
  lastNotifyMs = now;

  char payload[80];
  snprintf(payload, sizeof(payload), "Dist:%.1f,Angle:%.1f,ToF:%u",
           compensatedDistanceCm, angleDeg, tofMm);
  telemetryCharacteristic->setValue(reinterpret_cast<uint8_t*>(payload), strlen(payload));
  telemetryCharacteristic->notify();
}

static void updateFeedback() {
  if (pitActive) {
    pitVibration();
    return;
  }
  if (obstacleActive) {
    urgentVibration();
    return;
  }
  setMotors(false, false);
}

static void setupBle() {
  BLEDevice::init("SmartCane_BLE");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new CaneServerCallbacks());
  BLEService* service = server->createService(CANE_SERVICE_UUID);
  telemetryCharacteristic = service->createCharacteristic(
      CANE_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  telemetryCharacteristic->addDescriptor(new BLE2902());
  telemetryCharacteristic->setValue("Dist:400.0,Angle:0.0,ToF:500");
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(CANE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  BLEDevice::startAdvertising();
  Serial.println("SmartCane_BLE advertising");
}

void setup() {
  Serial.begin(115200);
  pinMode(LEFT_MOTOR_PIN, OUTPUT);
  pinMode(RIGHT_MOTOR_PIN, OUTPUT);
  setMotors(false, false);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  mpu.begin();
  mpu.calcGyroOffsets(true);

  if (!tofSensor.begin()) {
    tofAvailable = false;
    Serial.println("VL53L0X not found; ToF warnings are disabled.");
  } else {
    tofAvailable = true;
    Serial.println("VL53L0X ready");
  }

  lastTofCalibrationMs = millis();
  setupBle();
}

void loop() {
  const uint32_t now = millis();
  if (now - lastSensorMs >= SENSOR_PERIOD_MS) {
    lastSensorMs = now;
    updateSensorFusion();
  }
  updateFeedback();
  notifyTelemetry();
  delay(2);
}

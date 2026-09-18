/*
 * Blind Assist - Chest Vision Node
 * Target: Espressif ESP32-S3-EYE v2.1/v2.2 with Arduino-ESP32 camera driver.
 *
 * Fast path: expose a local MJPEG stream for the phone.
 * Slow path: expose /capture for an on-demand JPEG and /status for a physical-button event.
 * The phone is responsible for sending the JPEG to the cloud model and speaking the result.
 *
 * IMPORTANT:
 * - This sketch assumes the official ESP32-S3-EYE pin map documented by Espressif.
 * - GPIO0 is the on-board BOOT button. Do not hold it while resetting/flashing.
 * - For a custom ESP32-S3 + OV2640 board, replace the CAMERA_* constants with that board's map.
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "img_converters.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* FALLBACK_AP_SSID = "BlindAssist-Camera";
const char* FALLBACK_AP_PASSWORD = "blindassist";

// Official ESP32-S3-EYE v2.1/v2.2 camera wiring from Espressif BSP.
#define CAMERA_PIN_PWDN   -1
#define CAMERA_PIN_RESET  -1
#define CAMERA_PIN_XCLK   15
#define CAMERA_PIN_SIOD   4
#define CAMERA_PIN_SIOC   5
#define CAMERA_PIN_D7     16
#define CAMERA_PIN_D6     17
#define CAMERA_PIN_D5     18
#define CAMERA_PIN_D4     12
#define CAMERA_PIN_D3     10
#define CAMERA_PIN_D2     8
#define CAMERA_PIN_D1     9
#define CAMERA_PIN_D0     11
#define CAMERA_PIN_VSYNC  6
#define CAMERA_PIN_HREF   7
#define CAMERA_PIN_PCLK   13

// Official on-board BOOT button. Use it as a prototype trigger.
#define TRIGGER_BUTTON_PIN 0

// ---------- Layer 0: Chest Hardware Emergency Brake Pins ----------
// Dedicated non-camera pins on ESP32-S3-EYE
#define ULTRASONIC_TRIG_PIN 1
#define ULTRASONIC_ECHO_PIN 2
#define BRAKE_ALARM_PIN     44
#define EMERGENCY_BRAKE_DIST_CM 80.0f
#define ULTRASONIC_TIMEOUT_US 24000 // ~4 meters max

#define STREAM_BOUNDARY "blind-assist-boundary"
static const char* STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" STREAM_BOUNDARY;
static const char* STREAM_PART = "\r\n--" STREAM_BOUNDARY "\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t cameraHttpd = nullptr;
volatile uint32_t triggerCounter = 0;
uint32_t lastButtonChangeMs = 0;

// Layer 0 Fast Path Telemetry
float chestDistanceCm = 400.0f;
bool emergencyBrakeActive = false;
uint32_t lastSonarSampleMs = 0;
uint32_t lastAlarmToggleMs = 0;
bool alarmState = false;

static void addCorsHeaders(httpd_req_t* request) {
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store, no-cache, must-revalidate");
}

static esp_err_t sendJpegFrame(httpd_req_t* request) {
  camera_fb_t* frame = esp_camera_fb_get();
  if (!frame) {
    httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR, "camera capture failed");
    return ESP_FAIL;
  }

  uint8_t* jpegBuffer = frame->buf;
  size_t jpegLength = frame->len;
  bool converted = false;

  if (frame->format != PIXFORMAT_JPEG) {
    converted = frame2jpg(frame, 82, &jpegBuffer, &jpegLength);
    esp_camera_fb_return(frame);
    frame = nullptr;
    if (!converted) {
      httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR, "jpeg conversion failed");
      return ESP_FAIL;
    }
  }

  esp_err_t result = httpd_resp_send(request, reinterpret_cast<const char*>(jpegBuffer), jpegLength);
  if (frame) esp_camera_fb_return(frame);
  if (converted && jpegBuffer) free(jpegBuffer);
  return result;
}

static esp_err_t streamHandler(httpd_req_t* request) {
  addCorsHeaders(request);
  esp_err_t result = httpd_resp_set_type(request, STREAM_CONTENT_TYPE);
  if (result != ESP_OK) return result;

  char header[128];
  while (true) {
    camera_fb_t* frame = esp_camera_fb_get();
    if (!frame) {
      result = ESP_FAIL;
      break;
    }

    uint8_t* jpegBuffer = frame->buf;
    size_t jpegLength = frame->len;
    bool converted = false;
    if (frame->format != PIXFORMAT_JPEG) {
      converted = frame2jpg(frame, 82, &jpegBuffer, &jpegLength);
      esp_camera_fb_return(frame);
      frame = nullptr;
      if (!converted) {
        result = ESP_FAIL;
        break;
      }
    }

    size_t headerLength = snprintf(header, sizeof(header), STREAM_PART, jpegLength);
    result = httpd_resp_send_chunk(request, header, headerLength);
    if (result == ESP_OK) result = httpd_resp_send_chunk(request, reinterpret_cast<const char*>(jpegBuffer), jpegLength);
    if (result == ESP_OK) result = httpd_resp_send_chunk(request, "\r\n", 2);

    if (frame) esp_camera_fb_return(frame);
    if (converted && jpegBuffer) free(jpegBuffer);
    if (result != ESP_OK) break;
    delay(20);
  }
  return result;
}

static esp_err_t captureHandler(httpd_req_t* request) {
  addCorsHeaders(request);
  httpd_resp_set_type(request, "image/jpeg");
  return sendJpegFrame(request);
}

static esp_err_t statusHandler(httpd_req_t* request) {
  addCorsHeaders(request);
  httpd_resp_set_type(request, "application/json");
  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"triggerCounter\":%lu,\"ip\":\"%s\",\"ultrasonicCm\":%.1f,\"emergencyBrake\":%s}",
           static_cast<unsigned long>(triggerCounter),
           WiFi.localIP().toString().c_str(),
           chestDistanceCm,
           emergencyBrakeActive ? "true" : "false");
  return httpd_resp_send(request, payload, HTTPD_RESP_USE_STRLEN);
}

static void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.max_uri_handlers = 8;

  httpd_uri_t streamUri = { .uri = "/", .method = HTTP_GET, .handler = streamHandler, .user_ctx = nullptr };
  httpd_uri_t captureUri = { .uri = "/capture", .method = HTTP_GET, .handler = captureHandler, .user_ctx = nullptr };
  httpd_uri_t statusUri = { .uri = "/status", .method = HTTP_GET, .handler = statusHandler, .user_ctx = nullptr };

  if (httpd_start(&cameraHttpd, &config) == ESP_OK) {
    httpd_register_uri_handler(cameraHttpd, &streamUri);
    httpd_register_uri_handler(cameraHttpd, &captureUri);
    httpd_register_uri_handler(cameraHttpd, &statusUri);
    Serial.println("Camera HTTP server started: /, /capture, /status");
  } else {
    Serial.println("Camera HTTP server failed to start");
  }
}

static bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAMERA_PIN_D0;
  config.pin_d1 = CAMERA_PIN_D1;
  config.pin_d2 = CAMERA_PIN_D2;
  config.pin_d3 = CAMERA_PIN_D3;
  config.pin_d4 = CAMERA_PIN_D4;
  config.pin_d5 = CAMERA_PIN_D5;
  config.pin_d6 = CAMERA_PIN_D6;
  config.pin_d7 = CAMERA_PIN_D7;
  config.pin_xclk = CAMERA_PIN_XCLK;
  config.pin_pclk = CAMERA_PIN_PCLK;
  config.pin_vsync = CAMERA_PIN_VSYNC;
  config.pin_href = CAMERA_PIN_HREF;
  config.pin_sccb_sda = CAMERA_PIN_SIOD;
  config.pin_sccb_scl = CAMERA_PIN_SIOC;
  config.pin_pwdn = CAMERA_PIN_PWDN;
  config.pin_reset = CAMERA_PIN_RESET;
  config.xclk_freq_hz = 16000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 13;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;

  esp_err_t error = esp_camera_init(&config);
  if (error != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", error);
    return false;
  }

  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_brightness(sensor, 0);
    sensor->set_saturation(sensor, 0);
  }
  return true;
}

static void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to Wi-Fi: %s", WIFI_SSID);
  const uint32_t deadline = millis() + 15000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(400);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Camera URL: http://");
    Serial.println(WiFi.localIP());
    return;
  }

  Serial.println("Wi-Fi station failed; starting fallback access point.");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(FALLBACK_AP_SSID, FALLBACK_AP_PASSWORD);
  Serial.print("Fallback AP URL: http://");
  Serial.println(WiFi.softAPIP());
}

static float readUltrasonicDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, ULTRASONIC_TIMEOUT_US);
  if (duration == 0) return 400.0f;
  const float dist = duration * 0.0343f / 2.0f;
  return (dist > 1.0f && dist < 450.0f) ? dist : 400.0f;
}

static void updateLayer0EmergencyBrake() {
  const uint32_t now = millis();
  // Sample every ~25ms (< 30ms latency for urgent brake)
  if (now - lastSonarSampleMs >= 25) {
    lastSonarSampleMs = now;
    const float rawDist = readUltrasonicDistanceCm();
    if (rawDist < chestDistanceCm) {
      chestDistanceCm = rawDist;
    } else {
      chestDistanceCm = 0.7f * chestDistanceCm + 0.3f * rawDist;
    }
    emergencyBrakeActive = (chestDistanceCm < EMERGENCY_BRAKE_DIST_CM);
  }

  // Active fast pulse alarm when in emergency brake distance
  if (emergencyBrakeActive) {
    if (now - lastAlarmToggleMs >= 35) { // Rapid 35ms pulse
      lastAlarmToggleMs = now;
      alarmState = !alarmState;
      digitalWrite(BRAKE_ALARM_PIN, alarmState ? HIGH : LOW);
    }
  } else {
    alarmState = false;
    digitalWrite(BRAKE_ALARM_PIN, LOW);
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);

  pinMode(TRIGGER_BUTTON_PIN, INPUT_PULLUP);
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  pinMode(BRAKE_ALARM_PIN, OUTPUT);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  digitalWrite(BRAKE_ALARM_PIN, LOW);
  delay(300);

  if (!initCamera()) return;
  connectWiFi();
  startCameraServer();
  Serial.println("Layer 0 Hardware Emergency Brake active (< 80cm threshold, 25ms sampling).");
}

void loop() {
  updateLayer0EmergencyBrake();

  const bool pressed = digitalRead(TRIGGER_BUTTON_PIN) == LOW;
  const uint32_t now = millis();
  if (pressed && now - lastButtonChangeMs > 700) {
    lastButtonChangeMs = now;
    triggerCounter++;
    Serial.printf("Physical trigger event: %lu; phone may poll /status and call /capture.\n", static_cast<unsigned long>(triggerCounter));
  }
  delay(5);
}

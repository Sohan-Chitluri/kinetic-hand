#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_err.h"

// ================= I2C CONFIG =================
#define I2C_FREQ_HZ 100000

#define MPU6050_ADDR_1 0x68
#define MPU6050_ADDR_2 0x69

#define MPU6050_PWR_MGMT_1 0x6B
#define MPU6050_ACCEL_XOUT_H 0x3B
#define MPU6050_WHO_AM_I 0x75

// ================= FLEX CONFIG =================
#define FLEX1_CHANNEL ADC_CHANNEL_4   // GPIO32
#define FLEX2_CHANNEL ADC_CHANNEL_6   // GPIO34

static adc_oneshot_unit_handle_t adc_handle;

// ---------- Forward Declarations ----------
static void i2c_master_init(i2c_port_t port, int sda, int scl);
static esp_err_t mpu6050_write(i2c_port_t port, uint8_t addr, uint8_t reg, uint8_t data);
static esp_err_t mpu6050_read(i2c_port_t port, uint8_t addr, uint8_t reg, uint8_t *data, size_t len);
static void mpu6050_init(i2c_port_t port, uint8_t addr);
static void mpu6050_read_motion(i2c_port_t port, uint8_t addr,
                                int16_t *ax, int16_t *ay, int16_t *az,
                                int16_t *gx, int16_t *gy, int16_t *gz);
static uint8_t mpu6050_whoami(i2c_port_t port, uint8_t addr);
static void flex_adc_init(void);

// ================= I2C INIT =================
static void i2c_master_init(i2c_port_t port, int sda, int scl)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = sda,
        .scl_io_num = scl,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_FREQ_HZ
    };

    i2c_param_config(port, &conf);
    i2c_driver_install(port, conf.mode, 0, 0, 0);
}

// ================= MPU6050 LOW LEVEL =================
static esp_err_t mpu6050_write(i2c_port_t port, uint8_t addr, uint8_t reg, uint8_t data)
{
    uint8_t buf[2] = { reg, data };
    return i2c_master_write_to_device(port, addr, buf, 2, pdMS_TO_TICKS(100));
}

static esp_err_t mpu6050_read(i2c_port_t port, uint8_t addr, uint8_t reg,
                              uint8_t *data, size_t len)
{
    return i2c_master_write_read_device(port, addr,
                                        &reg, 1,
                                        data, len,
                                        pdMS_TO_TICKS(100));
}

static void mpu6050_init(i2c_port_t port, uint8_t addr)
{
    mpu6050_write(port, addr, MPU6050_PWR_MGMT_1, 0x00);
}

static void mpu6050_read_motion(i2c_port_t port, uint8_t addr,
                                int16_t *ax, int16_t *ay, int16_t *az,
                                int16_t *gx, int16_t *gy, int16_t *gz)
{
    uint8_t raw[14];
    mpu6050_read(port, addr, MPU6050_ACCEL_XOUT_H, raw, 14);

    *ax = (raw[0] << 8) | raw[1];
    *ay = (raw[2] << 8) | raw[3];
    *az = (raw[4] << 8) | raw[5];
    *gx = (raw[8] << 8) | raw[9];
    *gy = (raw[10] << 8) | raw[11];
    *gz = (raw[12] << 8) | raw[13];
}

static uint8_t mpu6050_whoami(i2c_port_t port, uint8_t addr)
{
    uint8_t whoami = 0xFF;

    i2c_cmd_handle_t cmd = i2c_cmd_link_create();

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, MPU6050_WHO_AM_I, true);

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_READ, true);
    i2c_master_read_byte(cmd, &whoami, I2C_MASTER_NACK);
    i2c_master_stop(cmd);

    i2c_master_cmd_begin(port, cmd, pdMS_TO_TICKS(1000));
    i2c_cmd_link_delete(cmd);

    return whoami;
}

// ================= FLEX ADC INIT =================
static void flex_adc_init(void)
{
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
    };

    adc_oneshot_new_unit(&init_config, &adc_handle);

    adc_oneshot_chan_cfg_t config = {
        .bitwidth = ADC_BITWIDTH_12,
        .atten = ADC_ATTEN_DB_12,
    };

    adc_oneshot_config_channel(adc_handle, FLEX1_CHANNEL, &config);
    adc_oneshot_config_channel(adc_handle, FLEX2_CHANNEL, &config);
}

// ================= MAIN =================
void app_main(void)
{
    // I2C Init
    i2c_master_init(I2C_NUM_0, 21, 22);
    i2c_master_init(I2C_NUM_1, 16, 17);

    // MPU Init
    mpu6050_init(I2C_NUM_0, MPU6050_ADDR_1);
    mpu6050_init(I2C_NUM_0, MPU6050_ADDR_2);
    mpu6050_init(I2C_NUM_1, MPU6050_ADDR_1);
    mpu6050_init(I2C_NUM_1, MPU6050_ADDR_2);

    // Flex Init
    flex_adc_init();

    printf("System Initialized\n");

    printf("IMU1 WHO_AM_I: 0x%02X\n", mpu6050_whoami(I2C_NUM_0, 0x68));
    printf("IMU2 WHO_AM_I: 0x%02X\n", mpu6050_whoami(I2C_NUM_0, 0x69));
    printf("IMU3 WHO_AM_I: 0x%02X\n", mpu6050_whoami(I2C_NUM_1, 0x68));
    printf("IMU4 WHO_AM_I: 0x%02X\n", mpu6050_whoami(I2C_NUM_1, 0x69));

    int16_t ax, ay, az, gx, gy, gz;

    while (1)
    {
        // -------- FLEX READ --------
        int flex1 = 0, flex2 = 0;
        adc_oneshot_read(adc_handle, FLEX1_CHANNEL, &flex1);
        adc_oneshot_read(adc_handle, FLEX2_CHANNEL, &flex2);

        float v1 = ((float)flex1 / 4095.0) * 3.3;
        float v2 = ((float)flex2 / 4095.0) * 3.3;

        printf("FLEX1: %4d (%.2f V) | FLEX2: %4d (%.2f V)\n",
               flex1, v1, flex2, v2);

        // -------- BUS 0 --------
        mpu6050_read_motion(I2C_NUM_0, 0x68, &ax,&ay,&az,&gx,&gy,&gz);
        printf("IMU1 | AX=%d AY=%d AZ=%d | GX=%d GY=%d GZ=%d\n",
               ax, ay, az, gx, gy, gz);

        mpu6050_read_motion(I2C_NUM_0, 0x69, &ax,&ay,&az,&gx,&gy,&gz);
        printf("IMU2 | AX=%d AY=%d AZ=%d | GX=%d GY=%d GZ=%d\n",
               ax, ay, az, gx, gy, gz);

        // -------- BUS 1 --------
        mpu6050_read_motion(I2C_NUM_1, 0x68, &ax,&ay,&az,&gx,&gy,&gz);
        printf("IMU3 | AX=%d AY=%d AZ=%d | GX=%d GY=%d GZ=%d\n",
               ax, ay, az, gx, gy, gz);

        mpu6050_read_motion(I2C_NUM_1, 0x69, &ax,&ay,&az,&gx,&gy,&gz);
        printf("IMU4 | AX=%d AY=%d AZ=%d | GX=%d GY=%d GZ=%d\n",
               ax, ay, az, gx, gy, gz);

        printf("--------------------------------------------------\n");

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

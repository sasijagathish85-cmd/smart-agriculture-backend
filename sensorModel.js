const mongoose = require("mongoose");

// ==========================================
// SENSOR DATA SCHEMA
// ==========================================
const sensorDataSchema = new mongoose.Schema(
    {
        // Temperature from DHT11
        temperature: {
            type: Number,
            required: true
        },

        // Humidity from DHT11
        humidity: {
            type: Number,
            required: true
        },

        // Soil moisture percentage
        soilMoisture: {
            type: Number,
            required: true
        },

        // Date and time of sensor reading
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        // Prevents unwanted extra fields
        strict: true,

        // Use the existing MongoDB collection
        collection: "sensor_data"
    }
);

// ==========================================
// EXPORT MODEL
// ==========================================
module.exports = mongoose.model(
    "SensorData",
    sensorDataSchema
);
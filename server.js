require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const SensorData = require("./sensorModel");

const app = express();

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());

// ===============================
// MONGODB CONNECTION
// ===============================
let isMongoConnected = false;

async function connectDB() {
    if (isMongoConnected && mongoose.connection.readyState === 1) {
        return;
    }

    await mongoose.connect(process.env.MONGODB_URI);
    isMongoConnected = true;

    console.log("MongoDB Atlas connected successfully");
}

// ===============================
// VARIABLES
// ===============================
let pumpState = false;
let controlMode = "AUTO";

let latestSensorData = {
    temperature: 0,
    humidity: 0,
    soilMoisture: 0
};

// AUTO MODE THRESHOLDS
const AUTO_ON_THRESHOLD = 40;
const AUTO_OFF_THRESHOLD = 60;

// ===============================
// AI RECOMMENDATION
// ===============================
function getAIRecommendation(
    temperature,
    humidity,
    soilMoisture
) {
    if (soilMoisture < 30 && temperature > 35) {
        return {
            status: "URGENT",
            recommendation:
                "Soil is very dry and temperature is high. Irrigation is recommended.",
            action: "PUMP_ON"
        };
    }

    if (soilMoisture < 40) {
        return {
            status: "DRY",
            recommendation:
                "Soil moisture is low. Irrigation is recommended.",
            action: "PUMP_ON"
        };
    }

    if (soilMoisture >= 40 && soilMoisture < 60) {
        return {
            status: "MODERATE",
            recommendation:
                "Soil moisture is moderate. Continue monitoring.",
            action: "MONITOR"
        };
    }

    if (temperature > 38 && humidity < 30) {
        return {
            status: "HOT",
            recommendation:
                "High temperature and low humidity detected. Monitor the crop closely.",
            action: "MONITOR"
        };
    }

    return {
        status: "HEALTHY",
        recommendation:
            "Environmental conditions are suitable. No irrigation required.",
        action: "PUMP_OFF"
    };
}

// ===============================
// HOME / HEALTH CHECK
// ===============================
app.get("/", async (req, res) => {
    try {
        await connectDB();

        res.json({
            success: true,
            message: "Smart Agriculture Monitoring Backend is running",
            database: "MongoDB Atlas connected"
        });

    } catch (error) {
        console.error("Home route error:", error);

        res.status(500).json({
            success: false,
            message: "Backend running but MongoDB connection failed"
        });
    }
});

// ===============================
// POST SENSOR DATA
// ESP32 → SERVER → MONGODB
// ===============================
app.post("/api/sensor", async (req, res) => {
    try {
        await connectDB();

        const {
            temperature,
            humidity,
            soilMoisture
        } = req.body;

        if (
            temperature === undefined ||
            humidity === undefined ||
            soilMoisture === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Missing sensor data"
            });
        }

        latestSensorData = {
            temperature: Number(temperature),
            humidity: Number(humidity),
            soilMoisture: Number(soilMoisture)
        };

        const ai = getAIRecommendation(
            latestSensorData.temperature,
            latestSensorData.humidity,
            latestSensorData.soilMoisture
        );

        // ===============================
        // AUTOMATIC PUMP CONTROL
        // ===============================
        if (controlMode === "AUTO") {

            if (
                latestSensorData.soilMoisture <
                AUTO_ON_THRESHOLD
            ) {
                pumpState = true;
            }

            else if (
                latestSensorData.soilMoisture >=
                AUTO_OFF_THRESHOLD
            ) {
                pumpState = false;
            }
        }

        // ===============================
        // SAVE TO MONGODB
        // ===============================
        const newSensorData = new SensorData({
            temperature: latestSensorData.temperature,
            humidity: latestSensorData.humidity,
            soilMoisture: latestSensorData.soilMoisture
        });

        await newSensorData.save();

        console.log(
            `Temp: ${latestSensorData.temperature}°C | ` +
            `Humidity: ${latestSensorData.humidity}% | ` +
            `Soil: ${latestSensorData.soilMoisture}% | ` +
            `Pump: ${pumpState ? "ON" : "OFF"} | ` +
            `Mode: ${controlMode}`
        );

        res.json({
            success: true,
            data: latestSensorData,
            pump: pumpState,
            mode: controlMode,
            ai: ai
        });

    } catch (error) {

        console.error("Sensor API Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to save sensor data"
        });
    }
});

// ===============================
// GET SENSOR HISTORY
// ===============================
app.get("/api/sensor", async (req, res) => {

    try {
        await connectDB();

        const data = await SensorData
            .find()
            .sort({ createdAt: -1 })
            .limit(100);

        res.json(data);

    } catch (error) {

        console.error("Sensor History Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch sensor data"
        });
    }
});

// ===============================
// GET LATEST DATA
// ===============================
app.get("/api/latest", async (req, res) => {

    try {
        await connectDB();

        const ai = getAIRecommendation(
            latestSensorData.temperature,
            latestSensorData.humidity,
            latestSensorData.soilMoisture
        );

        res.json({
            temperature: latestSensorData.temperature,
            humidity: latestSensorData.humidity,
            soilMoisture: latestSensorData.soilMoisture,
            pump: pumpState,
            mode: controlMode,
            ai: ai
        });

    } catch (error) {

        console.error("Latest Data Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch latest data"
        });
    }
});

// ===============================
// GET PUMP STATUS
// ===============================
app.get("/api/pump", async (req, res) => {

    try {
        await connectDB();

        res.json({
            pump: pumpState,
            mode: controlMode
        });

    } catch (error) {

        console.error("Pump Status Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch pump status"
        });
    }
});

// ===============================
// CONTROL PUMP
// MANUAL MODE
// ===============================
app.post("/api/pump", async (req, res) => {

    try {
        await connectDB();

        const { state } = req.body;

        if (typeof state !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "State must be true or false"
            });
        }

        pumpState = state;
        controlMode = "MANUAL";

        console.log(
            `Manual Pump: ${pumpState ? "ON" : "OFF"}`
        );

        res.json({
            success: true,
            pump: pumpState,
            mode: controlMode
        });

    } catch (error) {

        console.error("Pump Control Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to control pump"
        });
    }
});

// ===============================
// GET CURRENT MODE
// ===============================
app.get("/api/mode", async (req, res) => {

    try {
        await connectDB();

        res.json({
            mode: controlMode,
            pump: pumpState
        });

    } catch (error) {

        console.error("Mode Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch mode"
        });
    }
});

// ===============================
// CHANGE AUTO / MANUAL MODE
// ===============================
app.post("/api/mode", async (req, res) => {

    try {
        await connectDB();

        const { mode } = req.body;

        if (
            mode !== "AUTO" &&
            mode !== "MANUAL"
        ) {
            return res.status(400).json({
                success: false,
                message: "Mode must be AUTO or MANUAL"
            });
        }

        controlMode = mode;

        if (controlMode === "AUTO") {

            if (
                latestSensorData.soilMoisture <
                AUTO_ON_THRESHOLD
            ) {
                pumpState = true;
            }

            else if (
                latestSensorData.soilMoisture >=
                AUTO_OFF_THRESHOLD
            ) {
                pumpState = false;
            }
        }

        console.log(
            `Control Mode Changed: ${controlMode}`
        );

        res.json({
            success: true,
            mode: controlMode,
            pump: pumpState
        });

    } catch (error) {

        console.error("Mode Change Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to change mode"
        });
    }
});
connectDB()
    .then(() => {
        console.log("MongoDB Atlas connected successfully");
    })
    .catch((error) => {
        console.error("MongoDB connection error:", error);
    });


// ===============================
// VERCEL EXPORT
// ===============================
module.exports = app;
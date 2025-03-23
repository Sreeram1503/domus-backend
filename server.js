const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const OpenAI = require("openai");
const cors = require("cors");
const bodyParser = require("body-parser");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());

// Load keys and URLs from environment variables
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FLASK_API_URL = process.env.FLASK_API_URL;

// WebSocket handler for LLMSection
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("message", async (data) => {
        console.log("Message received:", data);
        const prompt = data.prompt;
        if (!prompt) return socket.emit("response", { error: "No prompt provided" });

        try {
            const response = await axios.get(FLASK_API_URL);
            const detections = response.data.detections;

            let detectionText = "Current camera view detections:\n";
            if (detections.length > 0) {
                detectionText += detections.map(d => `- ${d.label} (Confidence: ${d.confidence}%) at ${d.timestamp}`).join("\n");
            } else {
                detectionText += "No objects detected.";
            }

            const openaiResponse = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are Domus, a smart home assistant. You have access to live detection data from a camera. Use this information to answer questions about what is in front of the camera." },
                    { role: "system", content: detectionText },
                    { role: "user", content: prompt },
                ],
            });

            const answer = openaiResponse.choices[0].message.content;
            socket.emit("response", { message: answer });

        } catch (error) {
            console.error("WebSocket error:", error);
            socket.emit("response", { error: "Failed to generate response" });
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

// HTTP POST handler for VoiceAssistant
app.post("/ask_llm", async (req, res) => {
    const prompt = req.body.query;
    if (!prompt) return res.status(400).json({ error: "No query provided" });

    try {
        const response = await axios.get(FLASK_API_URL);
        const detections = response.data.detections;

        let detectionText = "Current camera view detections:\n";
        if (detections.length > 0) {
            detectionText += detections.map(d => `- ${d.label} (Confidence: ${d.confidence}%) at ${d.timestamp}`).join("\n");
        } else {
            detectionText += "No objects detected.";
        }

        const openaiResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are Domus, a smart home assistant. You have access to live detection data from a camera. Use this information to answer questions about what is in front of the camera." },
                { role: "system", content: detectionText },
                { role: "user", content: prompt },
            ],
        });

        const answer = openaiResponse.choices[0].message.content;
        res.json({ answer });

    } catch (error) {
        console.error("HTTP error:", error);
        res.status(500).json({ error: "LLM processing failed" });
    }
});

// Start the server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
async function makeNWSRequest(url) {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json"
    };
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        return (await response.json());
    }
    catch (error) {
        console.error("Error making NWS request: ", error);
        return null;
    }
}
function formatAlert(feature) {
    const props = feature.properties;
    return [
        `Event: ${props.event || "Unknown"}`,
        `Area: ${props.areaDesc || "Unknown"}`,
        `Severity: ${props.severity || "Unknown"}`,
        `Status: ${props.status || "Unknown"}`,
        `Headline: ${props.headline || "Unknown"}`,
        "---"
    ].join("\n");
}
// Create Server Instance
const server = new mcp_js_1.McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {}
    }
});
server.tool("get-alerts", "Get weather alerts for a state", { state: zod_1.z.string().length(2).describe("Two-letter state code (e.g. NY)") }, async ({ state }) => {
    const stateCode = state.toUpperCase();
    const url = `${NWS_API_BASE}/alerts/active?area=${stateCode}`;
    const alertsData = await makeNWSRequest(url);
    if (!alertsData) {
        return {
            content: [{ type: "text", text: "No alerts found" }]
        };
    }
    const features = alertsData.features || [];
    if (features.length === 0) {
        return {
            content: [{ type: "text", text: `No active alerts for ${stateCode}` }]
        };
    }
    const formattedAlerts = features.map(formatAlert);
    const alertText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n\n")}`;
    return {
        content: [{ type: "text", text: alertText }]
    };
});
server.tool("get-forecast", "Get weather forecast for a location", {
    latitude: zod_1.z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: zod_1.z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude of the location")
}, async ({ latitude, longitude }) => {
    // Get grid point data
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest(pointsUrl);
    if (!pointsData) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`
                }
            ]
        };
    }
    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to get forecast URL from grid point data"
                }
            ]
        };
    }
    // Get forecast data
    const forecastData = await makeNWSRequest(forecastUrl);
    if (!forecastData) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to retrieve forecast data"
                }
            ]
        };
    }
    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: "No forecast periods available"
                }
            ]
        };
    }
    // Format forecast periods
    const formattedForecast = periods.map((period) => [
        `${period.name || "Unknown"}:`,
        `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
        `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
        `${period.shortForecast || "No forecast available"}`,
        "---"
    ].join("\n"));
    const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;
    return {
        content: [
            {
                type: "text",
                text: forecastText
            }
        ]
    };
});
async function start() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
}
start().catch((error) => {
    console.error("Error starting server: ", error);
    process.exit(1);
});

"""
OmniScribe Air - Web Application & Local IPC Server
===================================================
Hosts the high-contrast dashboard and delivers sub-second NPU telemetry, 
live transcription streaming, and structured document generation.
"""

import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from omniscribe_engine import OmniScribeEngine

app = FastAPI(
    title="OmniScribe Air (Snapdragon AI Lab Edition)",
    description="Air-Gapped Ambient Clinical & Legal Intelligence on Qualcomm Hexagon NPU",
    version="1.0.0"
)

# Enable CORS for local IPC
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = OmniScribeEngine(mode="clinical")

# Mount static assets
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>OmniScribe Air Starting Up...</h1>")

@app.get("/api/telemetry")
async def get_telemetry():
    return JSONResponse(content=engine.get_hardware_telemetry())

@app.post("/api/mode/{mode}")
async def set_mode(mode: str):
    if mode in ["clinical", "legal"]:
        engine.mode = mode
        return JSONResponse({"status": "success", "mode": mode})
    return JSONResponse({"status": "error", "message": "Invalid mode"}, status_code=400)

@app.get("/api/benchmark")
async def get_benchmark():
    benchmark_file = os.path.join("benchmarks", "snapdragon_x_profile.json")
    if os.path.exists(benchmark_file):
        with open(benchmark_file, "r") as f:
            return JSONResponse(content=json.load(f))
    return JSONResponse(content=engine.get_hardware_telemetry())

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            req = json.loads(data)
            action = req.get("action")
            
            if action == "start_session":
                mode = req.get("mode", engine.mode)
                engine.mode = mode
                total_steps = len(engine.scenarios[engine.mode]["raw_dialogue"])
                
                # Stream each dialogue turn with simulated NPU speech-to-text latency
                for i in range(total_steps):
                    step_data = engine.get_step_stream(i)
                    await websocket.send_text(json.dumps({
                        "type": "turn",
                        "data": step_data
                    }))
                    await asyncio.sleep(1.8)  # Natural human speech cadence for live demo
                    
                # Final step: Generate structured SOAP / Legal document
                final_data = engine.get_step_stream(total_steps)
                await websocket.send_text(json.dumps({
                    "type": "final_summary",
                    "data": final_data
                }))
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket Error: {e}")

if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("  OmniScribe Air Server Starting")
    print("  URL: http://127.0.0.1:8000")
    print("=" * 60 + "\n")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

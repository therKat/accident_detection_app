import websockets
import json
import base64
from yolo_detector import YOLODetector
from accident_handler import AccidentHandler
import logging
import os
import socket
import asyncio
import cv2
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return False
        except socket.error:
            return True


def find_available_port(start_port=8765):
    port = start_port
    while is_port_in_use(port):
        port += 1
    return port


class AccidentDetectionServer:
    def __init__(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(os.path.dirname(current_dir), 'model', 'best.pt')

        logger.info(f"Initializing YOLODetector with model path: {model_path}")
        self.detector = YOLODetector(model_path)
        self.accident_handler = AccidentHandler()
        self.active_connections = set()
        self.detection_active = False
        self.video_capture = None

    async def register(self, websocket):
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")

    async def unregister(self, websocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def send_frame(self, frame, message):
        if not self.active_connections:
            return

        _, buffer = cv2.imencode('.jpg', frame)
        frame_base64 = base64.b64encode(buffer).decode('utf-8')

        # Prepare websocket message
        ws_message = {
            'type': 'frame',
            'frame': frame_base64,
            'timestamp': datetime.now().isoformat(),
            'detected': message.get('detected', False),
            'detections': message.get('detections', [])  # Make sure to include detections
        }

        logger.info(f"Sending frame with detections: {ws_message['detections']}")

        # Send to all connected clients
        websockets_to_remove = set()
        for websocket in self.active_connections:
            try:
                await websocket.send(json.dumps(ws_message))
            except websockets.exceptions.ConnectionClosed:
                websockets_to_remove.add(websocket)
            except Exception as e:
                logger.error(f"Error sending message: {e}")

        # Clean up closed connections
        for websocket in websockets_to_remove:
            await self.unregister(websocket)

    async def handle_message(self, websocket, message):
        try:
            data = json.loads(message)
            command = data.get('command')

            if command == 'start':
                if self.video_capture is None:
                    self.video_capture = cv2.VideoCapture(0)
                    if not self.video_capture.isOpened():
                        logger.error("Failed to open camera")
                        return
                    logger.info("Camera opened successfully")

                self.detection_active = True
                asyncio.create_task(self.detection_loop())
                logger.info("Detection started")

            elif command == 'stop':
                self.detection_active = False
                if self.video_capture:
                    self.video_capture.release()
                    self.video_capture = None
                logger.info("Detection stopped")
            elif command == 'set_threshold':
                threshold = data.get('threshold', 0.7)
                self.detector.model.conf = threshold
                logger.info(f"Updated detection threshold to {threshold}")

            elif command == 'confirm_accident':
                    confirmed = data.get('confirmed', False)
                    timestamp = data.get('timestamp')
                    location = data.get('location', {})
                    logger.info(
                        f"Accident confirmation received: {'Confirmed' if confirmed else 'Rejected'} at {timestamp}")

                    if confirmed:
                        # Update accident record with confirmation and location
                        accidents = self.accident_handler.load_accidents()
                        for accident in accidents:
                            if accident['timestamp'] == timestamp:
                                accident['confirmed'] = True
                                accident['processed'] = True
                                accident['location'] = location
                                self.accident_handler.update_accident(accident['id'], accident)
                                break

        except json.JSONDecodeError:
            logger.error("Invalid JSON message received")
        except Exception as e:
            logger.error(f"Error handling message: {str(e)}")

    async def detection_loop(self):
        try:
            frame_count = 0

            while self.detection_active and self.video_capture and self.video_capture.isOpened():
                ret, frame = self.video_capture.read()
                if not ret:
                    logger.error("Failed to capture frame")
                    break

                frame_count += 1
                logger.info(f"Processing frame {frame_count}")

                # Perform detection
                detection_result = self.detector.detect_accident(frame)
                logger.info(f"Detection result: {detection_result['detected']}")  # Add debug log

                if detection_result['detected']:
                    logger.info(f"Detections found: {detection_result['detections']}")  # Add debug log

                # Draw on frame if detection found
                if detection_result['detected']:
                    for det in detection_result['detections']:
                        bbox = det['bbox']
                        conf = det['confidence']
                        logger.info(f"Drawing detection with confidence: {conf}")  # Add debug log
                        cv2.rectangle(frame,
                                      (int(bbox[0]), int(bbox[1])),
                                      (int(bbox[2]), int(bbox[3])),
                                      (0, 0, 255), 2)
                        cv2.putText(frame,
                                    f"Accident: {conf:.2f}",
                                    (int(bbox[0]), int(bbox[1] - 10)),
                                    cv2.FONT_HERSHEY_SIMPLEX,
                                    0.5, (0, 0, 255), 2)

                # Send frame to web client
                message = {
                    'type': 'frame',
                    'frame_number': frame_count,
                    'timestamp': datetime.now().isoformat(),
                    'detected': detection_result['detected'],
                    'detections': detection_result.get('detections', [])
                }
                logger.info(f"Sending message to client: {message}")  # Add debug log
                await self.send_frame(frame, message)
                await asyncio.sleep(0.033)  # ~30 FPS

        except Exception as e:
            logger.error(f"Error in detection loop: {str(e)}")
            logger.exception(e)
        finally:
            if self.video_capture:
                self.video_capture.release()
                self.video_capture = None


async def handle_websocket(websocket):
    server = AccidentDetectionServer()
    await server.register(websocket)
    try:
        async for message in websocket:
            await server.handle_message(websocket, message)
    finally:
        await server.unregister(websocket)


async def main():
    port = find_available_port()
    if port != 8765:
        logger.warning(f"Port 8765 is in use, using port {port} instead")

    async with websockets.serve(handle_websocket, "localhost", port):
        logger.info(f"WebSocket server started on ws://localhost:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        # Kiểm tra và kill process đang sử dụng port 8765 (Windows only)
        if os.name == 'nt' and is_port_in_use(8765):
            os.system('netstat -ano | findstr :8765')
            os.system('taskkill /F /PID $(netstat -ano | findstr :8765 | awk "{print $5}")')

        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutting down")
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
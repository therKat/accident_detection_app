import cv2
import torch
import numpy as np
from ultralytics import YOLO
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class YOLODetector:
    def __init__(self, model_path='model/best.pt'):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")
        self.model = YOLO(model_path)

    def detect_accident(self, frame):
        # Ensure frame is in the correct format
        if len(frame.shape) == 2:
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2RGB)
        elif frame.shape[2] == 4:
            frame = cv2.cvtColor(frame, cv2.COLOR_RGBA2RGB)

        # Create a copy of frame for drawing
        display_frame = frame.copy()

        # Perform detection
        results = self.model(frame, conf=0.25)  # Lowered confidence threshold

        detections = []
        if len(results) > 0:
            result = results[0]

            # Process each detected object
            for box in result.boxes:
                confidence = float(box.conf)
                class_id = int(box.cls)
                bbox = box.xyxy[0].cpu().numpy()

                detection = {
                    'confidence': confidence,
                    'class': class_id,
                    'bbox': [float(x) for x in bbox]
                }
                detections.append(detection)

                # Draw on the display frame
                cv2.rectangle(display_frame,
                              (int(bbox[0]), int(bbox[1])),
                              (int(bbox[2]), int(bbox[3])),
                              (0, 0, 255), 2)

                # Add label
                label = f"Accident: {confidence:.2f}"
                cv2.putText(display_frame,
                            label,
                            (int(bbox[0]), int(bbox[1] - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.5, (0, 0, 255), 2)

                logger.info(f"Detection: Class {class_id} with confidence {confidence:.2f}")

        return {
            'detected': len(detections) > 0,
            'frame': display_frame,
            'detections': detections,
            'original_frame': frame
        }
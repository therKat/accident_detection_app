import json
import os
from datetime import datetime
import cv2


class AccidentHandler:
    def __init__(self, accidents_file='accidents/accidents.json'):
        self.accidents_file = accidents_file
        self.ensure_file_exists()

    def ensure_file_exists(self):
        if not os.path.exists(os.path.dirname(self.accidents_file)):
            os.makedirs(os.path.dirname(self.accidents_file))

        if not os.path.exists(self.accidents_file):
            with open(self.accidents_file, 'w') as f:
                json.dump([], f)

    def load_accidents(self):
        with open(self.accidents_file, 'r') as f:
            return json.load(f)

    def save_accident(self, frame, detection_result):
        # Extract best detection if available
        if 'best_detection' in detection_result:
            detection = detection_result['best_detection']
        elif 'detections' in detection_result and detection_result['detections']:
            detection = detection_result['detections'][0]
        else:
            return None

        # Save frame as image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_path = f"accidents/images/accident_{timestamp}.jpg"

        if not os.path.exists(os.path.dirname(image_path)):
            os.makedirs(os.path.dirname(image_path))

        cv2.imwrite(image_path, frame)

        # Create accident record
        accident_record = {
            "id": timestamp,
            "timestamp": datetime.now().isoformat(),
            "location": "Unknown",
            "confidence": detection['confidence'],
            "class": detection.get('class', 0),
            "bbox": detection['bbox'],
            "image_path": image_path,
            "processed": False,
            "notes": ""
        }

        # Load existing accidents and append new one
        accidents = self.load_accidents()
        accidents.append(accident_record)

        # Save updated accidents list
        with open(self.accidents_file, 'w') as f:
            json.dump(accidents, f, indent=2)

        return accident_record

    def update_accident(self, accident_id, updates):
        accidents = self.load_accidents()

        for accident in accidents:
            if accident['id'] == accident_id:
                accident.update(updates)
                break

        with open(self.accidents_file, 'w') as f:
            json.dump(accidents, f, indent=2)

    def get_accident(self, accident_id):
        accidents = self.load_accidents()
        return next((acc for acc in accidents if acc['id'] == accident_id), None)
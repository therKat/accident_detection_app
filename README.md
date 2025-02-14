
---

# 🚀 **Accident Detection System** (Electron + Python Backend)

Hệ thống phát hiện tai nạn giao thông theo thời gian thực sử dụng **YOLOv8**, **Electron.js** và **Python WebSocket Backend**.

---

## 📌 **1. Yêu cầu hệ thống**
- **Python 3.10 **  
- **Node.js 16+**  
- **pip** (Python package manager), **npm** (Node.js package manager)

## 📂 **2. Cấu trúc thư mục**
```
/project-root
│── backend/                
│   ├── accident_detection_server.py
│   ├── accident_handler.py
│   ├── yolo_detector.py
│   ├── requirements.txt
│── model/
│   └── best.pt              # Mô hình YOLO đã huấn luyện
│── frontend/
│   ├── src/
│   │   ├── camera-setup.html
│   │   ├── camera-setup.js
│   │   ├── detection.html
│   │   ├── renderer.js
│   ├── main.js
│   ├── package.json
│   ├── node_modules/
│   ├── renderer.js
│── README.md
```

---

## ⚙ **3. Cài đặt**
### **🔹 3.1. Cài đặt Backend (Python)**
```bash
pip install -r requirements.txt  # Cài đặt thư viện
```

### **🔹 3.2. Cài đặt Frontend (Electron)**
```bash
cd frontend
npm install
```

---

## 🚀 **4. Chạy hệ thống**
### **🔹 4.1. Chạy Backend**
```bash
cd backend
python accident_detection_server.py
```

### **🔹 4.2. Chạy Frontend**
```bash
cd frontend
npm start
```

---


## 👨‍💻 **5. Đóng góp & Liên hệ**
Mọi góp ý và vấn đề xin vui lòng mở **issue** trên GitHub. 🚀
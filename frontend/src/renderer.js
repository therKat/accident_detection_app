const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let ws = null;
let confidenceThreshold = 0.70;
let lastDetectionTime = 0;
const DETECTION_COOLDOWN = 10000;
let isModalOpen = false;
let isProcessingDetection = false;
let lastDetectedLocation = null;
let currentAccidentData = null;

// Camera configuration from setup
let cameraConfig = null;

function getAccidentsFilePath() {
    const userDataPath = require('electron').ipcRenderer.sendSync('get-user-data-path');
    return path.join(userDataPath, 'accidents.json');
}

document.addEventListener('DOMContentLoaded', () => {
    // Các logic khác giữ nguyên
    const savedConfig = localStorage.getItem('cameraConfig');
    if (savedConfig) {
        try {
            cameraConfig = JSON.parse(savedConfig);
            console.log('Loaded camera configuration:', cameraConfig);
        } catch (error) {
            console.error('Error parsing camera configuration:', error);
        }
    }

    // Kết nối WebSocket và các sự kiện khác giữ nguyên
    connectWebSocket();

    // Load danh sách tai nạn
    renderAccidentsList();

    document.getElementById('clearAccidentHistory').addEventListener('click', clearAccidentHistory);

    // Các sự kiện khác giữ nguyên
    document.getElementById('startDetection').addEventListener('click', startDetection);
    document.getElementById('stopDetection').addEventListener('click', stopDetection);

    // Confidence threshold control
    const thresholdInput = document.getElementById('confidenceThreshold');
    const thresholdValue = document.getElementById('thresholdValue');

    thresholdInput.addEventListener('input', (e) => {
        confidenceThreshold = parseFloat(e.target.value);
        thresholdValue.textContent = confidenceThreshold.toFixed(2);

        // Send threshold to WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                command: 'set_threshold',
                threshold: confidenceThreshold
            }));
        }
    });

    // Modal close button
    document.querySelector('.modal-close').addEventListener('click', () => {
        document.getElementById('accidentModal').style.display = 'none';
        isModalOpen = false;
        isProcessingDetection = false;
    });
});

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8765');

    ws.onopen = () => {
        console.log('Kết nối với máy chủ backend thành công');
        document.getElementById('status').textContent = 'Đã Kết Nối';
        document.getElementById('status').className = 'status-connected';

        // Send camera configuration if available
        if (cameraConfig) {
            ws.send(JSON.stringify({
                command: 'set_camera',
                deviceId: cameraConfig.deviceId,
                location: cameraConfig.cameraLocation
            }));
        }
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onerror = (error) => {
        console.error('Lỗi kết nối WebSocket:', error);
        document.getElementById('status').textContent = 'Lỗi Kết Nối';
        document.getElementById('status').className = 'status-disconnected';
    };

    ws.onclose = () => {
        console.log('Kết nối WebSocket đã đóng');
        document.getElementById('status').textContent = 'Ngắt Kết Nối';
        document.getElementById('status').className = 'status-disconnected';
        setTimeout(connectWebSocket, 5000);
    };
}

function startDetection() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: 'start' }));
    }
}

function stopDetection() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: 'stop' }));
    }
}

function handleWebSocketMessage(event) {
    const data = JSON.parse(event.data);

    if (data.type === 'frame') {
        updateVideoFeed(data);

        if (!isProcessingDetection &&
            data.detected &&
            Array.isArray(data.detections) &&
            data.detections.length > 0) {

            const highConfidenceDetections = data.detections.filter(
                detection => detection.confidence > confidenceThreshold
            );

            if (highConfidenceDetections.length > 0) {
                const currentTime = Date.now();
                const bestDetection = highConfidenceDetections.reduce(
                    (prev, current) => prev.confidence > current.confidence ? prev : current
                );

                const timeSinceLastDetection = currentTime - lastDetectionTime;

                const isSameLocation = isSimilarDetection(lastDetectedLocation, bestDetection.bbox);

                if (timeSinceLastDetection > DETECTION_COOLDOWN && !isModalOpen && !isSameLocation) {
                    isProcessingDetection = true;
                    lastDetectedLocation = bestDetection.bbox;

                    showAccidentModal({
                        ...data,
                        detections: [bestDetection]
                    });

                    lastDetectionTime = currentTime;
                }
            }
        }
    }
}
// Helper function to format camera coordinates
function formatCameraCoordinates(cameraLocation) {
    if (!cameraLocation) return '-';
    return `${cameraLocation.lat.toFixed(6)}, ${cameraLocation.lng.toFixed(6)}`;
}

function showAccidentDetailsModal(accident) {
    const modal = document.getElementById('accidentModal');
    const modalContent = modal.querySelector('.accident-modal-content');
    
    // Clone template
    const template = document.getElementById('accident-details-template');
    const content = template.content.cloneNode(true);
    
    // Update content
    content.getElementById('detectionImage').src = `data:image/jpeg;base64,${accident.imageBase64}`;
    content.getElementById('confidence-value').textContent = `${(accident.confidence * 100).toFixed(2)}%`;
    content.getElementById('timestamp-value').textContent = new Date(accident.timestamp).toLocaleString('vi-VN');
    content.getElementById('address-value').textContent = accident.cameraConfig.detailedAddress || 'Chưa cập nhật địa chỉ chi tiết';
    content.getElementById('coordinates-value').textContent = formatCameraCoordinates(accident.cameraConfig.cameraLocation);
    content.getElementById('distance-value').textContent = `${calculateDistanceFromHistoricalAccident(accident) || '-'} km`;

    // Clear and append new content
    modalContent.innerHTML = '';
    modalContent.appendChild(content);

    // Add event listeners
    setupEventListeners(modal, accident.cameraConfig.cameraLocation, accident.cameraConfig.stationLocation, true);

    // Show modal
    modal.style.display = 'flex';
    isModalOpen = true;
}

function showAccidentModal(data) {
    currentAccidentData = data;
    const modal = document.getElementById('accidentModal');
    const modalContent = modal.querySelector('.accident-modal-content');
    const detection = data.detections[0];

    // Clone template
    const template = document.getElementById('new-accident-template');
    const content = template.content.cloneNode(true);

    // Load camera config
    let cameraConfig = {};
    const savedConfig = localStorage.getItem('cameraConfig');
    if (savedConfig) {
        try {
            cameraConfig = JSON.parse(savedConfig);
        } catch (error) {
            console.error('Lỗi khi parse cấu hình camera:', error);
        }
    }

    // Update content
    content.getElementById('detectionImage').src = `data:image/jpeg;base64,${data.frame}`;
    content.getElementById('confidence-value').textContent = `${(detection.confidence * 100).toFixed(2)}%`;
    content.getElementById('timestamp-value').textContent = new Date().toLocaleString('vi-VN');
    content.getElementById('address-value').textContent = cameraConfig.detailedAddress || 'Chưa cập nhật địa chỉ chi tiết';
    content.getElementById('coordinates-value').textContent = formatCameraCoordinates(cameraConfig.cameraLocation);
    
    let distanceToAccident = '-';
    if (cameraConfig.cameraLocation && cameraConfig.stationLocation) {
        distanceToAccident = calculateDistance(
            cameraConfig.stationLocation.lat,
            cameraConfig.stationLocation.lng,
            cameraConfig.cameraLocation.lat,
            cameraConfig.cameraLocation.lng
        ).toFixed(2) + ' km';
    }
    content.getElementById('distance-value').textContent = distanceToAccident;

    // Clear and append new content
    modalContent.innerHTML = '';
    modalContent.appendChild(content);

    // Add event listeners
    setupEventListeners(modal, cameraConfig.cameraLocation, cameraConfig.stationLocation, false);

    // Show modal
    modal.style.display = 'flex';
    isModalOpen = true;
}

// Helper function to setup event listeners
function setupEventListeners(modal, cameraLocation, stationLocation, isHistorical) {
    const findHospitalBtn = modal.querySelector('#findNearestHospitalBtn');
    const directionsBtn = modal.querySelector('#directionsToAccidentBtn');
    const closeBtn = modal.querySelector('#closeAccidentDetailsBtn');

    if (findHospitalBtn) {
        findHospitalBtn.addEventListener('click', () => {
            if (cameraLocation) {
                const mapsUrl = `https://www.google.com/maps/search/bệnh+viện+gần+đây/@${cameraLocation.lat},${cameraLocation.lng},15z`;
                openGoogleMaps(mapsUrl);
            } else {
                alert("Không tìm thấy tọa độ camera.");
            }
        });
    }

    if (directionsBtn) {
        directionsBtn.addEventListener('click', () => {
            openDirections(isHistorical, cameraLocation, stationLocation);
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            isModalOpen = false;
        });
    }
}

function renderAccidentsList(limit = 5) {
    try {
        const filePath = getAccidentsFilePath();
        const accidentsList = document.getElementById('accidentsList');
        const viewAllBtn = document.getElementById('viewAllAccidents');
        const clearHistoryBtn = document.getElementById('clearAccidentHistory');
        accidentsList.innerHTML = ''; 

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            let accidents = JSON.parse(fileContent || '[]');

            accidents = accidents.reverse();

            const displayedAccidents = accidents.slice(0, limit);

            displayedAccidents.forEach(accident => {
                const accidentElement = document.createElement('div');
                accidentElement.classList.add('accident-item');
                
                const formattedTime = new Date(accident.timestamp).toLocaleString('vi-VN');
                const confidence = (accident.confidence * 100).toFixed(2);
                const address = accident.cameraConfig.detailedAddress || 'Chưa cập nhật';

                accidentElement.innerHTML = `
                    <div class="accident-header">
                        <span class="accident-time">${formattedTime}</span>
                        <span class="accident-confidence">Độ tin cậy: ${confidence}%</span>
                    </div>
                    <div class="accident-details">
                        <span>Địa điểm: ${address}</span>
                    </div>
                `;

                accidentElement.addEventListener('click', () => {
                    showAccidentDetailsModal(accident);
                });

                accidentsList.appendChild(accidentElement);
            });

            if (accidents.length > limit) {
                viewAllBtn.style.display = 'block';
                viewAllBtn.onclick = () => renderAccidentsList(accidents.length);
            } else {
                viewAllBtn.style.display = 'none';
            }

            clearHistoryBtn.style.display = accidents.length > 0 ? 'block' : 'none';
        } else {
            viewAllBtn.style.display = 'none';
            clearHistoryBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Lỗi khi hiển thị danh sách tai nạn:', error);
    }
}

function clearAccidentHistory() {
    try {
        const filePath = getAccidentsFilePath();
        
        const confirmed = confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử tai nạn?');
        
        if (confirmed) {
            fs.writeFileSync(filePath, '[]');
            
            renderAccidentsList();
        }
    } catch (error) {
        console.error('Lỗi khi xóa lịch sử tai nạn:', error);
        alert('Không thể xóa lịch sử tai nạn. Vui lòng thử lại.');
    }
}

function calculateDistanceFromHistoricalAccident(accident) {
    const savedConfig = localStorage.getItem('cameraConfig');
    if (!savedConfig) return null;

    try {
        const config = JSON.parse(savedConfig);
        
        if (config.stationLocation && 
            accident.cameraConfig.cameraLocation) {
            
            return calculateDistance(
                config.stationLocation.lat,
                config.stationLocation.lng,
                accident.cameraConfig.cameraLocation.lat,
                accident.cameraConfig.cameraLocation.lng
            ).toFixed(2);
        }
    } catch (error) {
        console.error('Lỗi khi tính khoảng cách:', error);
    }

    return null;
}

function updateVideoFeed(data) {
    const videoFeed = document.getElementById('videoFeed');
    if (videoFeed) {
        videoFeed.src = `data:image/jpeg;base64,${data.frame}`;
    }
}

function isSimilarDetection(prevLocation, currentLocation) {
    if (!prevLocation || !currentLocation) return false;

    const SIMILARITY_THRESHOLD = 0.2;

    const xDiff = Math.abs(prevLocation[0] - currentLocation[0]) / Math.abs(prevLocation[2] - prevLocation[0]);
    const yDiff = Math.abs(prevLocation[1] - currentLocation[1]) / Math.abs(prevLocation[3] - prevLocation[1]);

    return xDiff < SIMILARITY_THRESHOLD && yDiff < SIMILARITY_THRESHOLD;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính trái đất (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function openGoogleMaps(url) {
    const width = 1080; // Độ rộng cửa sổ Google Maps
    const height = 1000; // Chiều cao cửa sổ Google Maps
    const left = (screen.width - width) / 2; // Căn giữa màn hình
    const top = (screen.height - height) / 2;

    window.open(url, "_blank", `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

function confirmAccident(isAccident) {
    if (isAccident && currentAccidentData) {
        // Chỉ lưu khi xác nhận là tai nạn
        saveAccident(currentAccidentData);
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        const savedConfig = localStorage.getItem('cameraConfig');
        const config = savedConfig ? JSON.parse(savedConfig) : {};
        
        ws.send(JSON.stringify({
            command: 'confirm_accident',
            confirmed: isAccident,
            timestamp: new Date().toISOString(),
            location: config.cameraLocation || null,
            detailedAddress: config.detailedAddress || null
        }));
    }

    // Đóng modal
    document.getElementById('accidentModal').style.display = 'none';
    isModalOpen = false;
    isProcessingDetection = false;

    // Reset dữ liệu tai nạn
    currentAccidentData = null;
}

function saveAccident(accidentData) {
    try {
        const filePath = getAccidentsFilePath();
        let accidents = [];

        // Đọc file hiện tại nếu tồn tại
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            accidents = JSON.parse(fileContent || '[]');
        }

        // Thêm tai nạn mới
        accidents.push({
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            confidence: accidentData.detections[0].confidence,
            imageBase64: accidentData.frame,
            cameraConfig: JSON.parse(localStorage.getItem('cameraConfig') || '{}')
        });

        // Giới hạn số lượng tai nạn (ví dụ: tối đa 50 tai nạn)
        if (accidents.length > 50) {
            accidents = accidents.slice(-50);
        }

        // Ghi lại file
        fs.writeFileSync(filePath, JSON.stringify(accidents, null, 2));

        // Cập nhật giao diện
        renderAccidentsList();
    } catch (error) {
        console.error('Lỗi khi lưu tai nạn:', error);
    }
}

function openDirections(isFromHistory,cameraLocation, stationLocation) {
    if (!cameraLocation || !stationLocation) {
        alert("Không tìm thấy tọa độ trạm hoặc camera.");
        return;
    }
    let googleMapsUrl = ``;

    if (isFromHistory) {
        googleMapsUrl = `https://www.google.com/maps/dir/?api=1`
        + `&origin=${stationLocation.lat},${stationLocation.lng}`
        + `&destination=${cameraLocation.lat},${cameraLocation.lng}`
        + `&travelmode=driving`;
        
    } else{
        googleMapsUrl = `https://www.google.com/maps/dir/?api=1`
        + `&origin=${stationLocation.lat},${stationLocation.lng}`
        + `&destination=hospital+near+${cameraLocation.lat},${cameraLocation.lng}`
        + `&waypoints=${cameraLocation.lat},${cameraLocation.lng}`
        + `&travelmode=driving`;
    }    

    openGoogleMaps(googleMapsUrl);
}
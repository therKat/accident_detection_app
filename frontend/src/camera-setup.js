const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let map = null;
let marker = null;
let mapUser = null;
let markerUser = null;
let stationPosition = null;
let selectedCameraPosition = null;
let availableCameras = [];
let selectedCameraDeviceId = null;

// Function to get the configuration file path
function getConfigFilePath() {
    const userDataPath = ipcRenderer.sendSync('get-user-data-path');
    return path.join(userDataPath, 'camera_config.json');
}

function saveConfiguration(config) {
    try {
        const configPath = getConfigFilePath();
        const detailedAddress = document.getElementById('cameraDetailedAddress').value;
        
        // Tạo object config mới với đầy đủ thông tin
        const completeConfig = {
            ...config,
            detailedAddress: detailedAddress || 'Chưa cập nhật địa chỉ chi tiết'  // Giá trị mặc định
        };

        // Lưu vào file
        fs.writeFileSync(configPath, JSON.stringify(completeConfig, null, 2));
        
        // Lưu vào localStorage
        localStorage.setItem('cameraConfig', JSON.stringify(completeConfig));
        
        console.log('Camera configuration saved successfully:', completeConfig);
    } catch (error) {
        console.error('Error saving camera configuration:', error);
    }
}

// Function to load configuration from file
function loadConfiguration() {
    try {
        const configPath = getConfigFilePath();
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        }
    } catch (error) {
        console.error('Error loading camera configuration:', error);
    }
    return null;
}

function showErrorModal(message) {
    const errorModal = document.getElementById('errorModal');
    const errorModalMessage = document.getElementById('errorModalMessage');
    
    // Set error message
    errorModalMessage.textContent = message;
    
    // Display modal
    errorModal.style.display = 'flex';
    
    // Add shake animation to modal content
    const modalContent = errorModal.querySelector('.error-modal-content');
    modalContent.style.animation = 'shake 0.5s';
}

// Close error modal event listener
function setupErrorModalClose() {
    const errorModal = document.getElementById('errorModal');
    const closeButton = document.getElementById('closeErrorModal');
    
    closeButton.addEventListener('click', () => {
        errorModal.style.display = 'none';
        
        // Remove shake animation
        const modalContent = errorModal.querySelector('.error-modal-content');
        modalContent.style.animation = 'none';
    });

    // Close modal when clicking outside
    errorModal.addEventListener('click', (event) => {
        if (event.target === errorModal) {
            errorModal.style.display = 'none';
            const modalContent = errorModal.querySelector('.error-modal-content');
            modalContent.style.animation = 'none';
        }
    });
}

function validateSetup() {
    // Validate camera selection
    if (!selectedCameraDeviceId) {
        showErrorModal('Vui lòng chọn nguồn camera');
        return false;
    }

    // Validate camera location
    if (!selectedCameraPosition) {
        showErrorModal('Vui lòng xác định vị trí camera trên bản đồ');
        return false;
    }

    // Validate station location
    if (!stationPosition) {
        showErrorModal('Không thể xác định vị trí người dùng');
        return false;
    }
    const detailedAddress = document.getElementById('cameraDetailedAddress').value;
    if (!detailedAddress) {
        showErrorModal('Vui lòng nhập địa chỉ chi tiết của camera');
        return false;
    }

    return true;
}

function initializeMap() {
    if (typeof google === 'undefined') {
        showErrorModal('Google Maps chưa được tải');
        return;
    }

    // Khởi tạo map với vị trí mặc định (Hà Nội)
    map = new google.maps.Map(document.getElementById('mapContainer'), {
        zoom: 15,
        center: { lat: 20.98073116500081, lng: 105.78945219697249 },
        mapTypeId: google.maps.MapTypeId.ROADMAP
    });

    // Tạo marker có thể kéo thả
    marker = new google.maps.Marker({
        map: map,
        draggable: true,
        animation: google.maps.Animation.DROP
    });

    // Xử lý kéo thả marker
    google.maps.event.addListener(marker, 'dragend', function() {
        const position = marker.getPosition();
        updateSelectedLocation(position.lat(), position.lng());
    });

    // Xử lý click trên bản đồ
    map.addListener('click', function(event) {
        marker.setPosition(event.latLng);
        updateSelectedLocation(event.latLng.lat(), event.latLng.lng());
    });

    mapUser = new google.maps.Map(document.getElementById('userMapContainer'), {
        zoom: 15,
        center: { lat: 20.98073116500081, lng: 105.78945219697249 },
        mapTypeId: google.maps.MapTypeId.ROADMAP
    });

    markerUser = new google.maps.Marker({
        map: mapUser,
        draggable: true,
        animation: google.maps.Animation.DROP
    });

    google.maps.event.addListener(markerUser, 'dragend', function() {
        const position = markerUser.getPosition();
        updateUserSelectedLocation(position.lat(), position.lng());
    });

    mapUser.addListener('click', function(event) {
        markerUser.setPosition(event.latLng);
        updateUserSelectedLocation(event.latLng.lat(), event.latLng.lng());
    });
    // Load saved configuration if exists
    const savedConfig = loadConfiguration();
    if (savedConfig) {
        populateConfigFromSavedData(savedConfig);
    }
}

function populateConfigFromSavedData(savedConfig) {
    // Populate camera selection
    if (savedConfig.deviceId) {
        const cameraSelect = document.getElementById('cameraSelect');
        const option = Array.from(cameraSelect.options).find(opt => opt.value === savedConfig.deviceId);
        if (option) {
            cameraSelect.value = savedConfig.deviceId;
            selectedCameraDeviceId = savedConfig.deviceId;
        }
    }
    if (savedConfig.detailedAddress) {
        document.getElementById('cameraDetailedAddress').value = savedConfig.detailedAddress;
    }

    // Populate camera location
    if (savedConfig.cameraLocation) {
        const { lat, lng } = savedConfig.cameraLocation;
        updateSelectedLocation(lat, lng);
        map.setCenter({ lat, lng });
        marker.setPosition({ lat, lng });
    }
    if (savedConfig.stationLocation) {
        const { lat, lng } = savedConfig.stationLocation;
        updateUserSelectedLocation(lat, lng);
        mapUser.setCenter({ lat, lng });
        markerUser.setPosition({ lat, lng });
    }

    // Populate station location
    if (savedConfig.stationLocation) {
        const { lat, lng } = savedConfig.stationLocation;
        updateUserSelectedLocation(lat, lng);
        stationPosition = { lat, lng };
        document.getElementById('stationLat').textContent = lat.toFixed(6);
        document.getElementById('stationLng').textContent = lng.toFixed(6);
    }
}

function updateSelectedLocation(lat, lng) {
    document.getElementById('selectedLat').textContent = lat.toFixed(6);
    document.getElementById('selectedLng').textContent = lng.toFixed(6);
    selectedCameraPosition = { lat, lng };
}

function updateUserSelectedLocation(lat, lng) {
    document.getElementById('stationLat').textContent = lat.toFixed(6);
    document.getElementById('stationLng').textContent = lng.toFixed(6);
    selectedCameraPosition = { lat, lng };
}

function getCurrentStationLocation() {
    if (!navigator.geolocation) {
        showErrorModal('Trình duyệt không hỗ trợ định vị');
        setFallbackLocation();
        return;
    }

    const options = {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            stationPosition = {
                lat: latitude,
                lng: longitude
            };

            document.getElementById('stationLat').textContent = latitude.toFixed(6);
            document.getElementById('stationLng').textContent = longitude.toFixed(6);

            updateMapLocation(latitude, longitude);
        },
        (error) => {
            // showErrorModal('Không thể xác định vị trí. Vui lòng kiểm tra cài đặt định vị.');
            setFallbackLocation();
        },
        options
    );
}

function setFallbackLocation() {
    const fallbackLocation = {
        lat: 20.98073116500081,
        lng: 105.78945219697249
    };

    stationPosition = fallbackLocation;

    document.getElementById('stationLat').textContent = fallbackLocation.lat.toFixed(6);
    document.getElementById('stationLng').textContent = fallbackLocation.lng.toFixed(6);

    updateMapLocation(fallbackLocation.lat, fallbackLocation.lng);
}

function updateMapLocation(lat, lng) {
    if (map) {
        map.setCenter({ lat, lng });

        if (marker) {
            marker.setPosition({ lat, lng });
        }

        updateSelectedLocation(lat, lng);
    }
    if (mapUser) {
        mapUser.setCenter({ lat, lng });

        if (mapUser) {
            mapUser.setPosition({ lat, lng });
        }

        updateUserSelectedLocation(lat, lng);
    }
}

async function getAvailableCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        const select = document.getElementById('cameraSelect');
        select.innerHTML = '<option value="">-- Chọn camera --</option>';

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${index + 1}`;
            select.appendChild(option);
        });

        if (videoDevices.length === 0) {
            showErrorModal('Không tìm thấy camera nào.');
        }

        // Thêm sự kiện sau khi danh sách đã load xong
        select.addEventListener('change', (event) => {
            selectedCameraDeviceId = event.target.value;
            console.log("Camera được chọn:", selectedCameraDeviceId);
        });

    } catch (error) {
        console.error('Lỗi khi lấy danh sách camera:', error);
    }
}

document.addEventListener('DOMContentLoaded', async  () => {
    // Set up error modal close functionality
    setupErrorModalClose();
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("Danh sách thiết bị:", devices);
    // Load Google Maps
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyCqgmoPRz6Okc1-VQ4t6omkRDG4GSolf0A&callback=initializeMap`;
    script.async = true;
    script.defer = true;
    window.initializeMap = initializeMap;
    document.body.appendChild(script);

    document.getElementById('startDetectionPage').addEventListener('click', () => {
        if (!validateSetup()) return;

        // Save configuration to file
        const cameraConfig = {
            deviceId: 1,
            cameraLocation: selectedCameraPosition,
            stationLocation: stationPosition
        };
        saveConfiguration(cameraConfig);

        // Navigate to detection page
        window.location.href = 'detection.html';
    });

    getAvailableCameras();

    getCurrentStationLocation();

    
    //
    populateDefaultCameras();
});
// Danh sách 3 camera mặc định
const defaultCameras = [
    {
        name: "HNI_Ngã tư Tôn Thất Thiệp - Trần Phú",
        lat: 21.0329792067924, 
        lng: 105.84368232601848,
        address: "3 Tôn Thất Thiệp, Phường Điện Biên, Quận Ba Đình, Hà Nội"
    },
    {
        name: "HNI_LLGT_FPT",
        lat: 21.02732449663438, 
        lng: 105.7860373118823,
        address: "3 Tôn Thất Thuyết, Dịch Vọng Hậu, Cầu Giấy, Hà Nội , Việt Nam"
    },
    {
        name: "HNI_LLGT_Ngân hàng Á Châu",
        lat: 21.025826784043925, 
        lng: 105.785451135578,
        address: "2 Ng. 7 P. Tôn Thất Thuyết, Dịch Vọng Hậu, Cầu Giấy, Hà Nội, Việt Nam"
    },
    {
        name: "HNI_LLGT_Phạm Văn Bạch - Vòng Xuyến",
        lat: 21.027233968805763, 
        lng: 105.78772643951052,
        address: "Dịch Vọng, Cầu Giấy, Hà Nội, Việt Nam"
    },
    {
        name: "HNI_LLGT_Phạm Văn Bạch - Viện Kiểm Sát",
        lat: 21.025773150656086, 
        lng: 105.78566549425877,
        address: "Lô D26, Phường Yên hòa, Cầu Giấy, Hà Nội, Việt Nam"
    },
    {
        name: "HNI_NT_KDT_Nguyễn Trãi",
        lat: 20.991219368423753, 
        lng: 105.80283854111961,
        address: "Số 4 Nguyễn Xiển, Thanh Xuân, Hà Nội"
    },
    {
        name: "HNI_NT_KDT_Cột đèn giao thông- Nguyễn Xiển",
        lat: 20.991621166331395, 
        lng: 105.8030472230946,
        address: "Khuất Duy Tiến, Thanh Xuân, Hà Nội, Việt Nam"
    },
];

function populateDefaultCameras() {
    const select = document.getElementById('defaultCameraSelect');

    // Xóa tất cả option cũ để tránh trùng lặp
    select.innerHTML = '<option value="">-- Chọn một camera mặc định --</option>';

    defaultCameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = camera.name;
        select.appendChild(option);
    });
}

document.getElementById('defaultCameraSelect').addEventListener('change', (e) => {
    const selectedIndex = e.target.value;
    if (selectedIndex !== "") {
        const selectedCamera = defaultCameras[selectedIndex];

        // Cập nhật địa chỉ chi tiết
        document.getElementById('cameraDetailedAddress').value = selectedCamera.address;

        // Cập nhật vị trí trên bản đồ
        updateSelectedLocation(selectedCamera.lat, selectedCamera.lng);
        map.setCenter({ lat: selectedCamera.lat, lng: selectedCamera.lng });
        marker.setPosition({ lat: selectedCamera.lat, lng: selectedCamera.lng });
    }
});

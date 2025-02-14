const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');

let mainWindow;
let pythonProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            permissions: ['camera', 'geolocation'], 
            enableBlinkFeatures: "MediaCapture",
        },
        // autoHideMenuBar: true
    });

    mainWindow.loadFile(path.join(__dirname, '../frontend/src/camera-setup.html'));
    
    // mainWindow.removeMenu();

    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['geolocation', 'media'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
        return true;
    });
}

function startPythonProcess() {
    const pythonScript = path.join(__dirname, '../backend/accident_detection_server.py');
    pythonProcess = spawn('python', [pythonScript]);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
        if (mainWindow) {
            mainWindow.webContents.send('python-output', data.toString());
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
        if (mainWindow) {
            mainWindow.webContents.send('python-error', data.toString());
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    startPythonProcess();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
    if (pythonProcess) {
        pythonProcess.kill();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers for camera setup and detection
ipcMain.on('camera-setup-complete', (event, cameraConfig) => {
    // Save camera configuration or perform any necessary setup
    console.log('Camera setup complete:', cameraConfig);
});

// Add handler to get user data path
ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData');
});

ipcMain.on('start-detection', (event) => {
    mainWindow.webContents.send('detection-status', 'started');
});

ipcMain.on('stop-detection', (event) => {
    mainWindow.webContents.send('detection-status', 'stopped');
});
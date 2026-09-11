const { app, BrowserWindow } = require('electron');
const path = require('path');

// Khởi chạy Express Server ngầm
require('./server.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Maximo SQL Query Console",
        icon: path.join(__dirname, 'public/favicon.ico'), // Tùy chọn icon nếu có
        autoHideMenuBar: true, // Ẩn thanh menu mặc định của cửa sổ
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Tải ứng dụng từ Express Server local
    mainWindow.loadURL('http://localhost:3000');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
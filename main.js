const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Cấu hình ghi log cho autoUpdater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// BẮT BUỘC: Tắt tính năng tự động tải file để chờ người dùng xác nhận
autoUpdater.autoDownload = false;

// Khởi chạy Express Server ngầm
const expressServer = require('./server.js');

let mainWindow;

function checkAutoUpdate() {
    if (!app.isPackaged) return;

    // Xóa các listener cũ để tránh bị trùng lặp sự kiện
    autoUpdater.removeAllListeners();

    // 1. Kiểm tra phiên bản
    autoUpdater.on('checking-for-update', () => {
        log.info('Đang kiểm tra bản mới...');
    });

    // 1.1 NẾU CÓ BẢN MỚI: Hiển thị Popup hỏi ý kiến người dùng
    autoUpdater.on('update-available', (info) => {
        log.info(`Phát hiện phiên bản mới: v${info.version}`);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Phát hiện bản cập nhật mới',
            message: `Đã có phiên bản mới v${info.version}.\n\nBạn có muốn tải bản cập nhật này về không?`,
            buttons: ['Tải về ngay', 'Bỏ qua'],
            defaultId: 0,
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                // 2. Bấm "Tải về ngay" -> Bắt đầu tiến trình tải file
                log.info('Người dùng đồng ý tải bản mới.');
                autoUpdater.downloadUpdate();
            } else {
                log.info('Người dùng chọn bỏ qua bản cập nhật.');
            }
        });
    });

    // 1.2 NẾU KHÔNG CÓ BẢN MỚI: Im lặng ghi log, KHÔNG hiện Popup
    autoUpdater.on('update-not-available', (info) => {
        log.info('Ứng dụng đang ở phiên bản mới nhất (Không hiển thị popup).');
    });

    // Bắt lỗi nếu quá trình tải hoặc kiểm tra thất bại
    autoUpdater.on('error', (err) => {
        log.error('Lỗi Auto-Update:', err);
        if (mainWindow) mainWindow.setProgressBar(-1); // Tắt thanh tiến trình nếu lỗi
    });

    // 2.1 Đang tải: Hiển thị thanh tiến trình (% tải) trực tiếp trên icon Taskbar Windows
    autoUpdater.on('download-progress', (progressObj) => {
        const percent = progressObj.percent / 100;
        
        // Hiển thị thanh phần trăm màu xanh chạy dưới icon ứng dụng trên Taskbar
        if (mainWindow) {
            mainWindow.setProgressBar(percent);
        }

        let log_message = `Đang tải: ${progressObj.percent.toFixed(1)}% (${(progressObj.transferred / 1024 / 1024).toFixed(1)}MB / ${(progressObj.total / 1024 / 1024).toFixed(1)}MB)`;
        log.info(log_message);
    });

    // 2.2 Tải xong: Xóa thanh tiến trình Taskbar -> Hỏi cài đặt ngay hoặc để lần sau
    autoUpdater.on('update-downloaded', (info) => {
        // Reset lại thanh tiến trình Taskbar về bình thường
        if (mainWindow) mainWindow.setProgressBar(-1);

        dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: 'Cập nhật sẵn sàng',
            message: `Đã tải xong phiên bản v${info.version}.\n\nBạn có muốn khởi động lại để nâng cấp ngay không?`,
            buttons: ['Cập nhật ngay', 'Để sau'],
            defaultId: 0,
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    // Kích hoạt tiến trình kiểm tra
    autoUpdater.checkForUpdates();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Maximo SQL Query Console",
        icon: path.join(__dirname, 'public/favicon.ico'),
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadURL('http://localhost:3000');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        checkAutoUpdate();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('will-quit', () => {
    if (expressServer && typeof expressServer.close === 'function') {
        expressServer.close();
    }
});

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
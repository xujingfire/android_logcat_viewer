/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import { spawn, exec, execSync } from 'child_process';

// Fix PATH on macOS to find 'adb'
if (process.platform === 'darwin') {
  const commonPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools')
  ];
  const currentPath = process.env.PATH || '';
  const existingPaths = currentPath.split(':');
  const newPaths = commonPaths.filter(p => fs.existsSync(p) && !existingPaths.includes(p));
  if (newPaths.length > 0) {
    process.env.PATH = [...newPaths, ...existingPaths].join(':');
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

// 模拟连接设备的静态列表
const SIMULATED_DEVICES = [
  { id: '8HGX249FA81039', model: 'Google Pixel 8 Pro', release: '14', sdk: '34', status: 'device' },
  { id: 'emulator-5554', model: 'Android SDK Emulator', release: '13', sdk: '33', status: 'device' },
  { id: 'SAMSUNG_S24_ULTRA_01', model: 'Samsung Galaxy S24 Ultra', release: '14', sdk: '34', status: 'offline' }
];

// 模拟包名对应的当前 PID 缓存
const simulatedPids: { [pkg: string]: number } = {
  'com.tencent.mm': 8210,
  'com.ss.android.ugc.aweme': 13912,
  'com.android.systemui': 1248,
  'com.google.android.gms': 2145,
  'com.example.logcatdemo': 28450
};

// 检查本地 ADB 是否可用
function checkAdbAvailable(): boolean {
  try {
    execSync('adb --version', { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

// 1. 获取连接设备
app.get('/api/devices', (req, res) => {
  const adbAvailable = checkAdbAvailable();
  
  if (!adbAvailable) {
    // 如果无本地 adb，返回模拟设备，并附带 adbAvailable: false
    return res.json({
      adbAvailable: false,
      devices: SIMULATED_DEVICES
    });
  }

  // 执行 adb devices
  exec('adb devices -l', async (error, stdout, stderr) => {
    if (error || stderr) {
      return res.json({ adbAvailable: true, error: error?.message || stderr, devices: SIMULATED_DEVICES });
    }

    const lines = stdout.split('\n');
    const rawDevices: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const id = parts[0];
          const status = parts[1]; // device, unauthorized, offline, etc.
          // 提取 model 等信息
          let fallbackModel = 'Unknown Android Device';
          const modelMatch = line.match(/model:(\S+)/);
          if (modelMatch) {
            fallbackModel = modelMatch[1].replace(/_/g, ' ');
          }
          rawDevices.push({ id, status, fallbackModel });
        }
      }
    }

    // 并行获取在线设备的高级属性（如品牌、真实型号、Android版本、API版本）
    const devicePromises = rawDevices.map(async (d) => {
      if (d.status === 'device') {
        try {
          const props = await new Promise<{ brand: string; model: string; release: string; sdk: string }>((resolve) => {
            const cmd = `adb -s ${d.id} shell "getprop ro.product.brand; getprop ro.product.model; getprop ro.build.version.release; getprop ro.build.version.sdk"`;
            exec(cmd, { timeout: 1500 }, (err, out) => {
              if (err || !out) {
                resolve({ brand: '', model: '', release: '', sdk: '' });
              } else {
                const parts = out.split('\n').map(p => p.trim()).filter(Boolean);
                resolve({
                  brand: parts[0] || '',
                  model: parts[1] || '',
                  release: parts[2] || '',
                  sdk: parts[3] || ''
                });
              }
            });
          });

          let finalModel = d.fallbackModel;
          if (props.model) {
            const brandUpper = props.brand ? props.brand.toUpperCase() : '';
            const modelUpper = props.model;
            // 避免品牌名重复拼装，比如 "OPPO OPPO CPH2353"
            if (brandUpper && !modelUpper.toUpperCase().startsWith(brandUpper)) {
              // 首字母大写化
              const formattedBrand = props.brand.charAt(0).toUpperCase() + props.brand.slice(1);
              finalModel = `${formattedBrand} ${props.model}`;
            } else {
              finalModel = props.model;
            }
          }

          return {
            id: d.id,
            model: finalModel,
            status: d.status,
            release: props.release || undefined,
            sdk: props.sdk || undefined
          };
        } catch (e) {
          return { id: d.id, model: d.fallbackModel, status: d.status };
        }
      } else {
        return { id: d.id, model: d.fallbackModel, status: d.status };
      }
    });

    const devices = await Promise.all(devicePromises);

    res.json({
      adbAvailable: true,
      devices
    });
  });
});

// 1.5 获取所有进程的 PID -> 进程名映射
app.get('/api/ps', (req, res) => {
  const { deviceId } = req.query;
  const adbAvailable = checkAdbAvailable();
  if (!adbAvailable) {
    return res.json({ pidMap: {} });
  }
  const cmd = deviceId ? `adb -s ${deviceId} shell "ps -A || ps"` : `adb shell "ps -A || ps"`;
  exec(cmd, { timeout: 3000 }, (error, stdout) => {
    if (error || !stdout) {
      return res.json({ pidMap: {} });
    }
    
    const lines = stdout.split('\n');
    const pidMap: { [pid: string]: string } = {};
    let pidIndex = -1;
    let nameIndex = -1;

    const headerLine = lines[0];
    if (headerLine) {
      const headers = headerLine.trim().split(/\s+/);
      pidIndex = headers.indexOf('PID');
      if (pidIndex === -1) pidIndex = headers.findIndex(h => h.toUpperCase() === 'PID');
      nameIndex = headers.indexOf('NAME');
      if (nameIndex === -1) nameIndex = headers.findIndex(h => h.toUpperCase() === 'NAME');
      if (nameIndex === -1) nameIndex = headers.findIndex(h => h.toUpperCase() === 'CMD');
      if (nameIndex === -1) nameIndex = headers.findIndex(h => h.toUpperCase() === 'COMMAND');
    }

    if (pidIndex === -1) pidIndex = 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length > pidIndex) {
        const pid = parts[pidIndex];
        if (/^\d+$/.test(pid)) {
          let name = '';
          if (nameIndex !== -1 && nameIndex < parts.length) {
            name = parts[nameIndex];
          } else {
            name = parts[parts.length - 1];
          }
          if (name) {
            if (name.startsWith('/')) {
              name = name.substring(name.lastIndexOf('/') + 1);
            }
            pidMap[pid] = name;
          }
        }
      }
    }
    res.json({ pidMap });
  });
});

// 2. 获取进程 PID (支持真实和模拟)
app.get('/api/pid', (req, res) => {
  const { packageName, simulated, deviceId } = req.query;
  
  if (!packageName) {
    return res.status(400).json({ error: 'Package name is required' });
  }

  const pkgStr = String(packageName);

  if (simulated === 'true' || !checkAdbAvailable()) {
    // 模拟 PID 查询
    const pid = simulatedPids[pkgStr] || null;
    return res.json({ packageName: pkgStr, pid: pid ? String(pid) : '' });
  }

  // 真实 ADB PID 查询
  const pidCmd = deviceId ? `adb -s ${deviceId} shell pidof ${pkgStr}` : `adb shell pidof ${pkgStr}`;
  exec(pidCmd, (error, stdout, stderr) => {
    if (error || stderr) {
      return res.json({ packageName: pkgStr, pid: '' });
    }
    res.json({ packageName: pkgStr, pid: stdout.trim() });
  });
});

// 模拟触发特定事件（冷启动、发生闪退）
let pendingAction: { type: string; pkg: string; data?: any } | null = null;
app.post('/api/simulate-action', (req, res) => {
  const { action, packageName } = req.body;
  if (action && packageName) {
    pendingAction = { type: action, pkg: packageName };
    
    // 如果是冷启动，更新模拟的 PID 营造出进程启动的效果
    if (action === 'cold_start') {
      simulatedPids[packageName] = Math.floor(Math.random() * 20000) + 10000;
      pendingAction.data = { newPid: simulatedPids[packageName] };
    }
    
    return res.json({ success: true, message: `Action ${action} queued for ${packageName}` });
  }
  res.status(400).json({ error: 'Invalid parameters' });
});

// 3. SSE 日志流接口
app.get('/api/stream-logs', (req, res) => {
  const { mode, clearBuffer, deviceId } = req.query;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // 禁用 nginx 缓冲
  });

  const sendEvent = (event: string, data: string) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify({ text: data })}\n\n`);
  };

  const adbAvailable = checkAdbAvailable();
  
  // 3a. 真实 ADB 模式
  if (mode === 'real' && adbAvailable) {
    if (clearBuffer === 'true') {
      try {
        const clearCmd = deviceId ? `adb -s ${deviceId} logcat -c` : 'adb logcat -c';
        execSync(clearCmd);
        sendEvent('system', 'ADB 日志缓冲区已清空\n');
      } catch (err: any) {
        sendEvent('system', `清空缓冲区失败: ${err.message}\n`);
      }
    }

    sendEvent('system', `正在启动真实 ADB Logcat 实时捕获[设备: ${deviceId || '默认'}]...\n`);

    const adbArgs: string[] = [];
    if (deviceId) {
      adbArgs.push('-s', String(deviceId));
    }
    adbArgs.push('logcat', '-v', 'threadtime');
    const logcat = spawn('adb', adbArgs);

    logcat.stdout.on('data', (data) => {
      sendEvent('log', data.toString());
    });

    logcat.stderr.on('data', (data) => {
      sendEvent('error', data.toString());
    });

    logcat.on('close', (code) => {
      sendEvent('closed', `adb logcat 进程已终止，退出码: ${code}`);
      res.end();
    });

    // 客户端关闭连接时，杀死 adb 进程
    req.on('close', () => {
      logcat.kill();
    });
    return;
  }

  // 3b. 模拟日志流模式
  sendEvent('system', '正在初始化高保真 Android Logcat 模拟器...\n');
  sendEvent('system', '提示: 当前处于“日志模拟模式”。如需连接真实手机，请在右侧侧边栏切换为“USB真机模式”（需电脑本地安装 adb 并通过 USB 开启调试）。\n');

  // 定义多组高保真应用日志模板
  const apps = [
    {
      pkg: 'com.tencent.mm',
      tag: 'MicroMsg.MMSync',
      logs: [
        { level: 'I', msg: 'SyncTask started, trigger reason: manual_refresh_pull' },
        { level: 'D', msg: 'Checking db file integrity... MMSync.db state: OK' },
        { level: 'I', msg: 'Network request: get_new_messages, size: 450 bytes' },
        { level: 'D', msg: 'Parse sync response payload... found 0 new messages' },
        { level: 'V', msg: 'MMSync task completed successfully, connection keep-alive = true' }
      ]
    },
    {
      pkg: 'com.tencent.mm',
      tag: 'MicroMsg.ChattingUI',
      logs: [
        { level: 'I', msg: 'ChattingUI onResume, loaded conversation user: wxid_92482fj192' },
        { level: 'V', msg: 'Load draft message for user: wxid_92482fj192 -> null' },
        { level: 'D', msg: 'Recalculate keyboard panel height, screenWidth=1080, density=3.0' },
        { level: 'W', msg: 'Image cache size reached threshold (52.4MB), invoking soft trim memory' },
        { level: 'D', msg: 'Pre-fetching avatar thumb images... size = 12' }
      ]
    },
    {
      pkg: 'com.ss.android.ugc.aweme',
      tag: 'TikTokPlayer',
      logs: [
        { level: 'I', msg: 'Player prepareVideoAsync, videoId: aweme_v2_9103982429' },
        { level: 'D', msg: 'VideoEngine setDataSource: https://v.tiktokcdn.com/9103982429.mp4' },
        { level: 'V', msg: 'Render Frame rate: 60.0 fps, container format: mp4, h264' },
        { level: 'I', msg: 'Buffer state update: cached 1240ms, playPosition: 0ms, playProgress: 0%' },
        { level: 'W', msg: 'Heavy frame drop detected! Skipped 15 frames during rendering transition' },
        { level: 'I', msg: 'Player state transitioned: STATE_PREPARED -> STATE_PLAYING' }
      ]
    },
    {
      pkg: 'com.ss.android.ugc.aweme',
      tag: 'TikTokFeed',
      logs: [
        { level: 'I', msg: 'Requesting next feed recommendations... cursor: 12' },
        { level: 'D', msg: 'http get: https://api.tiktok.com/aweme/v1/feed?count=6&device_id=982498' },
        { level: 'I', msg: 'Feed response parse success. Got 6 items, total size: 12.4KB' },
        { level: 'D', msg: 'Caching recommendation card ID: aweme_card_9128392183' }
      ]
    },
    {
      pkg: 'com.android.systemui',
      tag: 'NotificationService',
      logs: [
        { level: 'I', msg: 'Notification posted from pkg=com.tencent.mm, id=1003, channel=chat_msg' },
        { level: 'D', msg: 'Active notifications: 4. Re-ordering stack based on priority scores.' },
        { level: 'V', msg: 'Invalidating status bar notification icons view, trigger redraw' },
        { level: 'I', msg: 'Vibrator service triggered pattern: [0, 80, 150, 80], intensity=high' }
      ]
    },
    {
      pkg: 'com.android.systemui',
      tag: 'BatteryService',
      logs: [
        { level: 'I', msg: 'Battery level updated: 84%, scale: 100, temp: 31.4C, voltage: 4120mV' },
        { level: 'D', msg: 'Charging path status: discharging, screen: on, draw: 450mA' },
        { level: 'V', msg: 'Notify battery change listeners... callback count: 18' }
      ]
    },
    {
      pkg: 'com.google.android.gms',
      tag: 'GmsLocationProvider',
      logs: [
        { level: 'D', msg: 'RequestLocationUpdates: client=com.eg.android.Alipay, interval=10000ms, priority=PRIORITY_BALANCED_POWER_ACCURACY' },
        { level: 'I', msg: 'FusedLocationProvider: returning last cached location (lat=31.2304, lng=121.4737, accuracy=15.2m)' },
        { level: 'V', msg: 'Geofence evaluation took 1ms, active geofences: 0' }
      ]
    },
    {
      pkg: 'com.google.android.gms',
      tag: 'FirebaseMessaging',
      logs: [
        { level: 'I', msg: 'FCM connection established with mtalk.google.com:5228, latency=82ms' },
        { level: 'D', msg: 'Heartbeat ping sent... acknowledged in 42ms' },
        { level: 'I', msg: 'Received message: topic=null, collapse_key=chat_com.tencent.mm' }
      ]
    }
  ];

  const systemLogs = [
    { level: 'I', tag: 'dalvikvm', logs: ['GC_CONCURRENT freed 2048K, 14% free 16420K/19120K, paused 1ms+2ms, total 18ms'] },
    { level: 'D', tag: 'skia', logs: ['Shader cache compiled 1 new shader in 24ms, total size: 450KB'] },
    { level: 'I', tag: 'PowerManagerService', logs: ['Going to sleep due to power button click (lock_screen=true)...'] },
    { level: 'I', tag: 'PowerManagerService', logs: ['Waking up from sleep (reason: gesture_double_tap)...'] },
    { level: 'W', tag: 'InputDispatcher', logs: ['Application is not responding: Window{41fa1830 u0 com.example.logcatdemo/com.example.logcatdemo.MainActivity}. It has been 5005ms since dispatching.' ] },
    { level: 'W', tag: 'Choreographer', logs: ['Skipped 34 frames! The application may be doing too much work on its main thread.'] }
  ];

  // 定时器模拟实时日志产生
  let logInterval: NodeJS.Timeout;

  const startSimulation = () => {
    logInterval = setInterval(() => {
      // 1. 检查是否有特殊待处理事件（如：冷启动、闪退）
      if (pendingAction) {
        const action = pendingAction;
        pendingAction = null; // 消费掉

        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        const dateStr = `${mm}-${dd} ${hh}:${min}:${ss}.${ms}`;

        const pid = simulatedPids[action.pkg] || 12840;
        const tid = pid + Math.floor(Math.random() * 20);

        if (action.type === 'cold_start') {
          // 发送一系列冷启动日志
          const startLogs = [
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  1248  1282 I ActivityManager: Start proc ${pid}:${action.pkg}/u0a158 for activity {${action.pkg}/.MainActivity}` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} I dalvikvm: Late-enabling CheckJNI for process ${action.pkg}` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} D AndroidRuntime: >>>>>> START com.android.internal.os.RuntimeInit uid 10158 <<<<<<` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} D MainActivity: onCreate() lifecycle start` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} I MainActivity: View loaded successfully, rendering UI layout` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} V MainActivity: registration token requested successfully` })}\n\n`
          ];
          startLogs.forEach(log => res.write(log));
          return;
        }

        if (action.type === 'crash') {
          // 发送闪退崩溃日志，包含完整的 Java Crash 堆栈，增强真实感！
          const crashLogs = [
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} D AndroidRuntime: Shutting down VM` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: FATAL EXCEPTION: main` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: Process: ${action.pkg}, PID: ${pid}` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: java.lang.NullPointerException: Attempt to invoke virtual method 'boolean java.lang.String.equals(java.lang.Object)' on a null object reference` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat com.example.logcatdemo.MainActivity.onClickTriggerCrash(MainActivity.java:42)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat android.view.View.performClick(View.java:7448)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat android.view.View.performClickInternal(View.java:7425)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat android.view.View.access$3600(View.java:810)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat android.view.View$PerformClick.run(View.java:28305)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat android.os.Handler.handleCallback(Handler.java:938)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  ${pid}  ${pid} E AndroidRuntime: \tat android.os.Handler.dispatchMessage(Handler.java:99)` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  1248  1282 W ActivityManager:   Force finishing activity ${action.pkg}/.MainActivity` })}\n\n`,
            `event: log\ndata: ${JSON.stringify({ text: `${dateStr}  1248  1282 I ActivityManager: Process ${action.pkg} (pid ${pid}) has died` })}\n\n`
          ];
          crashLogs.forEach(log => res.write(log));
          
          // 更新 PID 为空，表明进程已死
          simulatedPids[action.pkg] = 0;
          return;
        }
      }

      // 2. 正常频率生成随机日志
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const ms = String(now.getMilliseconds()).padStart(3, '0');
      const dateStr = `${mm}-${dd} ${hh}:${min}:${ss}.${ms}`;

      // 随机选择生成应用日志还是系统日志
      const isSystem = Math.random() < 0.25;

      if (isSystem) {
        const sys = systemLogs[Math.floor(Math.random() * systemLogs.length)];
        const logMsg = sys.logs[Math.floor(Math.random() * sys.logs.length)];
        const logLine = `${dateStr}  1248  1412 ${sys.level} ${sys.tag}: ${logMsg}`;
        sendEvent('log', logLine);
      } else {
        const app = apps[Math.floor(Math.random() * apps.length)];
        const pid = simulatedPids[app.pkg] || 0;
        
        // 如果 PID 为 0，表明进程目前死了，略过不写此进程的日志，或者 15% 几率冷启动拉活
        if (pid === 0) {
          if (Math.random() < 0.15) {
            simulatedPids[app.pkg] = Math.floor(Math.random() * 20000) + 10000;
            const newPid = simulatedPids[app.pkg];
            sendEvent('log', `${dateStr}  1248  1282 I ActivityManager: Auto-restart proc ${newPid}:${app.pkg} for broadcast sync`);
          }
          return;
        }

        const logChoice = app.logs[Math.floor(Math.random() * app.logs.length)];
        const tid = pid + Math.floor(Math.random() * 15);
        const logLine = `${dateStr}  ${String(pid).padStart(5, ' ')}  ${String(tid).padStart(5, ' ')} ${logChoice.level} ${app.tag}: ${logChoice.msg}`;
        sendEvent('log', logLine);
      }
    }, 150); // 每 150ms 产出一条
  };

  startSimulation();

  req.on('close', () => {
    clearInterval(logInterval);
  });
});

// 4. Vite / Express 开发服务配置
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

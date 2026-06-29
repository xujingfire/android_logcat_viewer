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
    // 本地无 adb，返回空设备列表
    return res.json({
      adbAvailable: false,
      devices: []
    });
  }

  // 执行 adb devices
  exec('adb devices -l', async (error, stdout, stderr) => {
    if (error || stderr) {
      return res.json({ adbAvailable: true, error: error?.message || stderr, devices: [] });
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

// 2. 获取进程 PID
app.get('/api/pid', (req, res) => {
  const { packageName, deviceId } = req.query;
  
  if (!packageName) {
    return res.status(400).json({ error: 'Package name is required' });
  }

  const pkgStr = String(packageName);

  if (!checkAdbAvailable()) {
    return res.json({ packageName: pkgStr, pid: '' });
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

// 3. SSE 日志流接口（仅真实 ADB）
app.get('/api/stream-logs', (req, res) => {
  const { clearBuffer, deviceId } = req.query;
  
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

  // 无可用 ADB 时直接提示并关闭
  if (!checkAdbAvailable()) {
    sendEvent('system', '未检测到本地 ADB。请在运行服务的机器上安装 Android platform-tools 并通过 USB 连接真机后重试。\n');
    sendEvent('closed', '无可用 ADB 环境');
    res.end();
    return;
  }

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

# Android Logcat Viewer

一款高仿 Android Studio Darcula 主题的轻量级 Android Logcat 实时日志查看器。基于真实 `adb` 直连设备，提供清晰的列式日志渲染、包名/PID 追踪、等级过滤与正则检索，帮助你高效定位问题。

> 纯真机驱动：所有日志均来自通过 USB 连接的真实 Android 设备（`adb logcat`），不含任何模拟/演示数据。

## ✨ 功能特性

- **实时日志捕获**：基于 `adb logcat -v threadtime` 的实时数据流。
- **设备选择**：自动发现并列出已连接的真机（型号、Android 版本、API Level、在线状态）。
- **包名过滤 + PID 追踪**：输入应用包名后自动 `pidof` 轮询，App 重启拿到新 PID 时自动跟随。
- **运行进程补全**：自动读取设备上运行中的进程，提供包名快速选择。
- **日志等级过滤**：支持 Verbose / Debug / Info / Warn / Error / Fatal 最低等级过滤。
- **关键字检索**：支持普通关键字与正则表达式检索 Tag 与日志内容。
- **Darcula 渲染风格**：等级配色、Tag 着色、URL 自动识别，贴近 Android Studio 体验。
- **滑动窗口缓冲**：可选 500 / 1500 / 3000 行缓冲上限，超限自动丢弃最旧日志，长时间运行不卡顿。
- **日志导出**：将当前过滤结果导出为 `.txt` 文件。
- **个性化设置**（Web 版）：自定义行高、字号、列宽与各等级颜色，配置持久化到本地。

## 📦 两种运行形态

本仓库包含两套实现，共享一致的 UI 风格与交互：

| 形态 | 目录 | 适用场景 |
| --- | --- | --- |
| **Electron 桌面应用** | [`electron-project/`](electron-project/) | 推荐。直接在本机调用 `adb`，可打包为 macOS / Windows / Linux 安装包 |
| **Web 版（React + Express）** | 仓库根目录（[`src/`](src/) + [`server.ts`](server.ts)） | 浏览器中使用，由 Node 服务端代理 `adb` 并通过 SSE 推送日志 |

## 🔧 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools)（提供 `adb`，且 `adb` 需在系统 `PATH` 中）
- 一台开启「USB 调试」并已授权的 Android 真机

> macOS 下程序会自动尝试在 `/usr/local/bin`、`/opt/homebrew/bin` 与 `~/Library/Android/sdk/platform-tools` 中查找 `adb`。

## 🚀 快速开始

### 方式一：Electron 桌面应用（推荐）

```bash
cd electron-project
npm install
npm start
```

打包为各平台安装包：

```bash
npm run dist:mac     # macOS (dmg / zip)
npm run dist:win     # Windows (nsis / zip)
npm run dist:linux   # Linux (AppImage / deb)
```

### 方式二：Web 版

```bash
npm install
npm run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。服务端会调用本机 `adb` 并通过 SSE 将日志推送到浏览器，因此运行该服务的机器需安装 `adb` 并连接真机。

生产构建与运行：

```bash
npm run build
npm run start
```

## 🕹️ 使用说明

1. 通过 USB 连接 Android 真机并开启「USB 调试」。
2. 在「设备选择」中选中目标设备（无设备时会提示连接真机）。
3. 点击「开始监听」，开始实时抓取日志。
4. 可选操作：
   - 在「包名」中填写要追踪的应用包名，仅展示该进程日志（自动跟随 PID）。
   - 调整「最低等级」过滤噪音。
   - 在检索框中输入关键字或正则表达式。
   - 通过「缓冲区」选择保留的最大日志行数。
   - 点击「导出」保存当前日志，「清空」清除当前视图。

## 🗂️ 项目结构

```
.
├── electron-project/      # Electron 桌面应用
│   ├── main.js            # 主进程：adb 进程管理、设备/PID 查询
│   └── index.html         # 渲染进程：UI 与日志渲染
├── src/                   # Web 版前端（React）
│   └── App.tsx            # 主组件
├── server.ts              # Web 版后端（Express + Vite + SSE 日志流）
├── index.html             # Web 版入口
└── package.json           # Web 版依赖与脚本
```

## 🛠️ 技术栈

- **桌面端**：Electron + 原生 HTML/CSS/JS
- **Web 端**：React 19、Vite、Express、TypeScript、Tailwind CSS、Server-Sent Events
- **日志来源**：Android Debug Bridge（`adb logcat`）

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

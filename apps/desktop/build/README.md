# Application Icons

此目录包含NetMate应用的图标文件。

## 文件要求

请将以下图标文件放置在此目录中：

### Windows
- **icon.ico** - Windows应用图标
  - 推荐尺寸：256x256 或包含多个尺寸（16, 32, 48, 64, 128, 256）
  - 格式：ICO

### macOS
- **icon.icns** - macOS应用图标
  - 推荐尺寸：包含多个尺寸（16, 32, 64, 128, 256, 512, 1024）
  - 格式：ICNS
  - 可以使用在线工具或命令行工具将PNG转换为ICNS

### Linux
- **icon.png** - Linux应用图标
  - 推荐尺寸：512x512 或 1024x1024
  - 格式：PNG（透明背景）

## 转换工具

### PNG to ICNS (macOS)
如果只有PNG文件，可以使用以下方法转换：

**在线工具：**
- https://cloudconvert.com/png-to-icns
- https://anyconv.com/png-to-icns-converter/

**macOS命令行：**
```bash
# 创建iconset目录
mkdir icon.iconset

# 生成不同尺寸（需要有1024x1024的原图icon.png）
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# 转换为icns
iconutil -c icns icon.iconset
```

### PNG to ICO (Windows)
**在线工具：**
- https://cloudconvert.com/png-to-ico
- https://convertio.co/png-ico/

**注意：**
- 建议生成包含多个尺寸的ICO文件，以便在不同场景下显示最佳效果
- 可以选择包含16x16, 32x32, 48x48, 64x64, 128x128, 256x256等尺寸

## 图标设计建议

1. **简洁清晰**：图标应该在小尺寸下也能清晰辨认
2. **透明背景**：PNG和部分ICO应使用透明背景
3. **统一风格**：各平台图标应保持一致的视觉风格
4. **高分辨率**：提供高分辨率版本以支持Retina/高DPI显示器
5. **圆角处理**：macOS通常会自动应用圆角，设计时可考虑这一点

## 使用

将准备好的图标文件放入此目录后：

1. **开发环境**：重新启动应用即可看到新图标
   ```bash
   pnpm dev:desktop
   ```

2. **打包**：构建时会自动使用这些图标
   ```bash
   pnpm -C apps/desktop dist
   ```

## 当前状态

- [x] icon.ico (Windows) - 353 KB
- [x] icon.icns (macOS) - 646 KB
- [x] icon.png (Linux) - 100 KB

✅ 所有图标文件已就位，可以正常使用！

## 目录结构

```
build/
├── icon.ico          # Windows应用图标（主文件）
├── icon.icns         # macOS应用图标（主文件）
├── icon.png          # Linux应用图标（主文件）
├── win/              # Windows原始文件（备份）
│   └── icon.ico
├── mac/              # macOS原始文件（备份）
│   └── icon.icns
├── png/              # 多尺寸PNG文件（备份）
│   ├── 16x16.png
│   ├── 24x24.png
│   ├── 32x32.png
│   ├── 48x48.png
│   ├── 64x64.png
│   ├── 128x128.png
│   ├── 256x256.png
│   ├── 512x512.png
│   └── 1024x1024.png
└── README.md         # 本文件
```

## 使用说明

图标已配置完成，无需额外操作。

### 开发模式
```bash
pnpm dev:desktop
```
应用窗口会显示新图标。

### 打包安装程序
```bash
pnpm -C apps/desktop dist
```
生成的安装包会包含设置的图标。

## 更换图标

如果需要更换图标，只需替换 `build/` 根目录下的三个主文件：
- `icon.ico`
- `icon.icns`
- `icon.png`

然后重新运行 `pnpm dev:desktop` 或 `pnpm dist` 即可。

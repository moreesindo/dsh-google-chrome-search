# DSH Google Chrome Search

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地 Google 搜索提供器。它通过 Chrome 扩展使用你当前的 Chrome 用户配置访问 Google，将自然搜索结果的标题、链接和摘要传回 DSH。

它不调用 DeepSeek、Google Custom Search 或其他付费搜索 API，因此插件本身没有按次 API 费用。

## 工作方式

1. DSH 的 `ctx.web` 调用 `google-chrome` 搜索提供器。
2. 提供器通过仅监听 `127.0.0.1` 的 WebSocket 桥接发送查询。
3. Chrome 扩展复用一个专用 Google 标签页，读取自然搜索结果。
4. 标题、网址和摘要经过过滤、去重和长度限制后返回 DSH。

扩展不会读取 Cookie、浏览历史或其他标签页内容。如果 Google 显示 CAPTCHA，插件会返回 `GOOGLE_CAPTCHA`，需要你在专用搜索标签页中手动完成验证；插件不会尝试绕过验证。

## 要求

- Node.js 20 或更高版本
- DeepSeek Harness `0.1.0-rc.6` 或兼容版本
- Google Chrome

## 安装

### 1. 安装 DSH 插件

```sh
dsh plugin --profile web add github:moreesindo/dsh-google-chrome-search
```

### 2. 生成配对口令

```sh
openssl rand -hex 24
```

保存输出值，下面的 DSH 配置和 Chrome 扩展必须填写同一个值。不要把真实口令提交到 Git。

### 3. 配置 DSH Web profile

编辑 `~/.dsh/profiles/web/cordis.patch.yml`：

```yaml
- id: web
  config:
    searchProvider: google-chrome
- id: tool-web
  disabled: false
  config:
    fetch: false
    searchTimeoutMs: 60000
- insert:
    - id: web-search-google-chrome
      name: dsh-web-search-google-chrome
      config:
        token: 在这里填写生成的配对口令
        port: 32145
        timeoutMs: 30000
```

重启 DSH Web 服务。前台运行时可使用：

```sh
dsh web
```

### 4. 加载 Chrome 扩展

1. 克隆本仓库，或使用由包管理器下载的项目目录。
2. 在 Chrome 打开 `chrome://extensions`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目的 `extension/` 目录。
5. 点击扩展图标，填写端口 `32145` 和步骤 2 生成的配对口令。
6. 点击“保存并连接”，等待出现“已连接到本机 DSH”。

## 开发

```sh
npm install
npm run check
```

桥接集成测试会临时监听本机随机回环端口。项目包含协议验证、认证/断线/超时处理、CAPTCHA 检测、Google 结果解析和扩展配置测试。

## 安全说明

- 桥接服务器拒绝绑定非回环地址。
- Chrome 扩展与 DSH 使用共享口令认证。
- 扩展权限仅覆盖 Google 搜索页。
- 返回结果只接受 HTTP/HTTPS URL，并进行去重与长度限制。
- `extension/local-config.js` 已被 Git 忽略，仅用于可选的本地开发配置。

## 费用与限制

- 插件本身不产生搜索 API 费用。
- 搜索会消耗本机网络流量；本地或云端模型仍按你原有的方式消耗资源或计费。
- Google 页面结构变化可能需要更新解析规则。
- 使用时请遵守 Google 服务条款以及所在地适用法律。

## 许可证

[MIT](LICENSE)

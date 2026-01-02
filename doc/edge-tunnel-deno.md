# Deno deploy Install

## 纯 Deno 版本说明

本项目提供纯 Deno 版本（`main-deno.ts`），不依赖任何 npm 包，可以直接在 Deno Deploy 上部署。

**特点**：
- 无需 npm install，直接部署
- 纯 WebSocket 代理功能
- 无前端管理界面，专注于代理功能
- 支持 VLESS 协议

**入口文件**：`apps/deno-vless/src/main-deno.ts`

## 风险提示

`Deno deploy` 采用 [fair use policy](https://deno.com/deploy/docs/fair-use-policy), 翻译成中文就是`看良心使用`。 违反可能会封号。

## Fork 本项目到自己 Github 下

![fork](./fork.jpg)

**请定期按照 github 的提示，同步 code 到自己的项目**。
![sync](./sync.jpg)

## 登录 Deno deploy

用 Github 账户登录 https://deno.com/deploy

> 相关免费策略，https://deno.com/deploy/pricing

## New Project

请在配置过程中 **记住 UUID**, 并且选择正确的部署入口文件。`apps\deno-vless\src\main-deno.ts`
![deno-link](./deno-link.jpg)

### 流程演示

> GIF 仅仅是流程演示，具体入口文件，请看上图。

https://raw.githubusercontent.com/zizifn/edgetunnel/main/doc/deno-deploy.gif

如果 UUID 忘记 或者入口文件有变化，也可以在 deno 管理界面修改项目的配置。

https://raw.githubusercontent.com/zizifn/edgetunnel/main/doc/deno-deploy2.gif

其他更多配置，比如使用量，请自行探索。

## 项目地址

点击 View 项目会自动打开。

**注意**：这是纯 Deno 版本，没有前端管理界面。

如果环境变量 `UUID` 未设置或无效，会返回 `401` 页面，页面会显示一个随机生成的 UUID，请记住它并在 Deno Deploy 的环境变量中设置。

设置好 UUID 后，访问页面会显示简单的状态信息，确认代理正在运行。

请使用你的 VLESS 客户端（如 v2rayN）连接到 Deno Deploy 提供的 URL。

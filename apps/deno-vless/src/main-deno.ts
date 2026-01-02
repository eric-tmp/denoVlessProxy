import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { v4 as uuidv4, validate as uuidValidate } from 'https://deno.land/std@0.208.0/uuid/mod.ts';

// 简化的 chunk 函数，替代 lodash-es
function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// 内联的 401 HTML
const HTML_401 = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>401 - UUID Not Valid</title>
</head>
<body>
    <h1 style="color: red;">Not set valid UUID in Environment Variables.</h1>
    <h2>Please use tool to generate and <span style="color: red;">remember</span> UUID or use this one <span style="color: blue;" id="uuidSpan"></span></h2>
    <h3>You must use same UUID for login this page after config valid UUID Environment Variables</h3>
    <h2>Please refer to <a href="https://github.com/zizifn/edgetunnel/blob/main/doc/edge-tunnel-deno.md#%E6%B5%81%E7%A8%8B%E6%BC%94%E7%A4%BA">deno deploy guide</a></h2>
    <h3>Or maybe check below <a href="https://raw.githubusercontent.com/zizifn/edgetunnel/main/doc/deno-deploy2.gif">GIF</a></h3>
    <img src="https://raw.githubusercontent.com/zizifn/edgetunnel/main/doc/deno-deploy2.gif" alt="guide" srcset="">
    <script>
        let uuid = URL.createObjectURL(new Blob([])).substr(-36);
        document.getElementById('uuidSpan').textContent = uuid
    </script>
</body>
</html>`;

const userID = Deno.env.get('UUID') || '';
const isVaildUser = uuidValidate(userID);

if (!isVaildUser) {
  console.log('not set valid UUID');
}

const handler = async (req: Request): Promise<Response> => {
  // 如果 UUID 无效，返回 401
  if (!isVaildUser) {
    return new Response(HTML_401, {
      status: 401,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  }

  // 检查是否为 WebSocket 升级请求
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    // 非 WebSocket 请求，返回简单的状态页面
    return new Response(
      `<html>
        <body>
          <h1>Vless Proxy is running</h1>
          <p>WebSocket proxy is ready. Use your VLESS client to connect.</p>
          <p>UUID: ${userID}</p>
        </body>
      </html>`,
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      }
    );
  }

  // WebSocket 升级
  const { socket, response } = Deno.upgradeWebSocket(req);
  let remoteConnection: Deno.TcpConn | null = null;
  let address = '';
  let port = 0;

  socket.onopen = () => console.log('socket opened');

  socket.onmessage = async (e) => {
    try {
      if (!(e.data instanceof ArrayBuffer)) {
        return;
      }

      const vlessBuffer: ArrayBuffer = e.data;

      // 如果已经建立了远程连接，直接转发数据
      if (remoteConnection) {
        await remoteConnection.write(new Uint8Array(vlessBuffer));
        return;
      }

      // VLESS 协议解析
      // https://github.com/v2ray/v2ray-core/issues/2636
      // 1 字节  16 字节     1 字节       M 字节      1 字节  2 字节   1 字节  S 字节  X 字节
      // 协议版本  等价 UUID  附加信息长度 M 附加信息 ProtoBuf  指令     端口    地址类型   地址    请求数据

      if (vlessBuffer.byteLength < 24) {
        console.log('invalid data');
        return;
      }

      const version = new Uint8Array(vlessBuffer.slice(0, 1));
      
      // 验证 UUID
      const uuidBuffer = new Uint8Array(vlessBuffer.slice(1, 17));
      const requestUUID = Array.from(uuidBuffer)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      
      if (requestUUID !== userID.replace(/-/g, '')) {
        console.log('invalid user');
        socket.close();
        return;
      }

      const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];

      // 跳过附加信息
      const command = new Uint8Array(
        vlessBuffer.slice(18 + optLength, 18 + optLength + 1)
      )[0];

      // 0x01 TCP, 0x02 UDP, 0x03 MUX
      if (command === 1) {
        // TCP - 支持
      } else {
        console.log(
          `command ${command} is not support, command 01-tcp,02-udp,03-mux`
        );
        socket.close();
        return;
      }

      const portIndex = 18 + optLength + 1;
      const portBuffer = vlessBuffer.slice(portIndex, portIndex + 2);
      const portRemote = new DataView(portBuffer).getUint16(0, false); // big-endian
      port = portRemote;

      let addressIndex = portIndex + 2;
      const addressBuffer = new Uint8Array(
        vlessBuffer.slice(addressIndex, addressIndex + 1)
      );

      // 1 -> ipv4, 2 -> domain name, 3 -> ipv6
      const addressType = addressBuffer[0];
      let addressLength = 0;
      let addressValueIndex = addressIndex + 1;
      let addressValue = '';

      switch (addressType) {
        case 1: // IPv4
          addressLength = 4;
          addressValue = Array.from(
            new Uint8Array(
              vlessBuffer.slice(
                addressValueIndex,
                addressValueIndex + addressLength
              )
            )
          ).join('.');
          break;
        case 2: // Domain name
          addressLength = new Uint8Array(
            vlessBuffer.slice(addressValueIndex, addressValueIndex + 1)
          )[0];
          addressValueIndex += 1;
          addressValue = new TextDecoder().decode(
            vlessBuffer.slice(
              addressValueIndex,
              addressValueIndex + addressLength
            )
          );
          break;
        case 3: // IPv6
          addressLength = 16;
          const addressChunkBy2: number[][] = chunk(
            new Uint8Array(
              vlessBuffer.slice(
                addressValueIndex,
                addressValueIndex + addressLength
              )
            ),
            2
          );
          addressValue = addressChunkBy2
            .map((items) =>
              items
                .map((item) => item.toString(16).padStart(2, '0'))
                .join('')
            )
            .join(':');
          break;
        default:
          console.log(`[${address}:${port}] invalid address type`);
          socket.close();
          return;
      }

      address = addressValue;

      if (!addressValue) {
        console.log(`[${address}:${port}] addressValue is empty`);
        socket.close();
        return;
      }

      console.log(`[${address}:${port}] connecting`);

      // 建立远程连接
      remoteConnection = await Deno.connect({
        port: port,
        hostname: addressValue,
      });

      const rawDataIndex = addressValueIndex + addressLength;
      const rawClientData = vlessBuffer.slice(rawDataIndex);
      await remoteConnection.write(new Uint8Array(rawClientData));

      // 发送 VLESS 响应头
      let chunkDatas = [new Uint8Array([version[0], 0])];
      remoteConnection.readable
        .pipeTo(
          new WritableStream({
            start() {
              socket.send(new Blob(chunkDatas));
            },
            write(chunk) {
              socket.send(new Blob([chunk]));
            },
          })
        )
        .catch((error) => {
          console.log(
            `[${address}:${port}] remoteConnection pipe to has error`,
            error
          );
        });
    } catch (error) {
      console.log(`[${address}:${port}] request handler has error`, error);
    }
  };

  socket.onerror = (e) =>
    console.log(`[${address}:${port}] socket errored:`, e);
  
  socket.onclose = () => {
    console.log(`[${address}:${port}] socket closed`);
    if (remoteConnection) {
      try {
        remoteConnection.close();
      } catch (e) {
        // ignore
      }
    }
  };

  return response;
};

// Deno Deploy 不需要手动指定端口
serve(handler);
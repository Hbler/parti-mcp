import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, ChildProcess } from "child_process";
import { Writable } from "stream";

const startServer = (): ChildProcess => {
  const proc = spawn("tsx", ["src/index.ts"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  return proc;
};

const sendJsonRpc = (
  proc: ChildProcess,
  request: object
): Promise<object> => {
  return new Promise((resolve, reject) => {
    if (!proc.stdin || !proc.stdout) {
      reject(new Error("Process stdin/stdout not available"));
      return;
    }

    let buffer = "";
    const timeout = setTimeout(() => {
      proc.stdout?.removeListener("data", onData);
      reject(new Error("JSON-RPC request timeout"));
    }, 5000);

    const onData = (data: Buffer) => {
      buffer += data.toString();

      // Try to parse complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const response = JSON.parse(line);
            clearTimeout(timeout);
            proc.stdout?.removeListener("data", onData);
            resolve(response);
            return;
          } catch (e) {
            // Continue trying
          }
        }
      }
    };

    proc.stdout?.on("data", onData);
    (proc.stdin as Writable).write(JSON.stringify(request) + "\n");
  });
};

test("Server process starts without error", async () => {
  const server = startServer();
  assert.notEqual(server.pid, undefined);

  // Wait a bit for server to initialize
  await new Promise((resolve) => setTimeout(resolve, 1000));

  assert.equal(server.exitCode, null, "Server should still be running");

  server.kill();
});

test("Can call 'ping' tool via JSON-RPC over stdio", async () => {
  const server = startServer();

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // First send initialization request
  const initRequest = {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  await sendJsonRpc(server, initRequest);

  // Send initialized notification
  const initializedNotif = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  };
  (server.stdin as Writable).write(JSON.stringify(initializedNotif) + "\n");
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Now send tool call request
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "ping",
      arguments: {},
    },
  };

  const response = await sendJsonRpc(server, request);

  // Response should have content array with text response
  assert.notEqual(response, undefined);
  assert.notEqual((response as any).result, undefined);
  assert.notEqual((response as any).result.content, undefined);
  assert(Array.isArray((response as any).result.content));
  assert.equal((response as any).result.content[0].type, "text");
  assert.equal((response as any).result.content[0].text, "pong");

  server.kill();
});

test("Server lists 'render_site_plan' tool in tools", async () => {
  const server = startServer();

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // First send initialization request
  const initRequest = {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  await sendJsonRpc(server, initRequest);

  // Send initialized notification
  const initializedNotif = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  };
  (server.stdin as Writable).write(JSON.stringify(initializedNotif) + "\n");
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Now send list tools request
  const request = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  };

  const response = await sendJsonRpc(server, request);

  assert.notEqual(response, undefined);
  const toolNames = ((response as any).result?.tools || []).map(
    (tool: any) => tool.name
  );
  assert(toolNames.includes("render_site_plan"), `Expected render_site_plan in ${JSON.stringify(toolNames)}`);

  server.kill();
});

test("Server lists 'render_floor_plan' tool in tools", async () => {
  const server = startServer();

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // First send initialization request
  const initRequest = {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  await sendJsonRpc(server, initRequest);

  // Send initialized notification
  const initializedNotif = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  };
  (server.stdin as Writable).write(JSON.stringify(initializedNotif) + "\n");
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Now send list tools request
  const request = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
    params: {},
  };

  const response = await sendJsonRpc(server, request);

  assert.notEqual(response, undefined);
  const toolNames = ((response as any).result?.tools || []).map(
    (tool: any) => tool.name
  );
  assert(toolNames.includes("render_floor_plan"), `Expected render_floor_plan in ${JSON.stringify(toolNames)}`);

  server.kill();
});

test("Clipper WASM instance initializes on server startup", async () => {
  const server = startServer();

  // Wait for server to start and initialize Clipper
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Server should still be running (if Clipper init failed, it would crash)
  assert.equal(server.exitCode, null, "Server should still be running with Clipper initialized");

  server.kill();
});

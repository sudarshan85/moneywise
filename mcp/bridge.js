/**
 * MoneyWise MCP bridge: Claude desktop (stdio) <-> the MCP endpoint on Fly.
 *
 * Claude desktop starts this via run.sh inside WSL. All tools live in the
 * backend (backend/src/mcp/) and run against the live database; this file
 * only forwards tools/list and tools/call, adding the bearer token.
 *
 * It connects to Fly lazily, on the first tool request, so a sleeping or
 * unreachable VM never makes Claude desktop's startup handshake fail.
 *
 * stdout is the MCP protocol channel. Log with console.error only.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SERVER_INSTRUCTIONS } from '../backend/src/mcp/rules.js';

const MCP_URL = process.env.MONEYWISE_MCP_URL || 'https://moneywise.fly.dev/mcp';
const TOKEN = process.env.MCP_TOKEN;
// The first request may wake a stopped Fly VM.
const TIMEOUT_MS = 60_000;

let remote = null;

function connectRemote() {
    if (!TOKEN) {
        return Promise.reject(new Error('MCP_TOKEN is not set. Put it in mcp/.env (see mcp/README.md).'));
    }
    if (!remote) {
        remote = (async () => {
            const client = new Client({ name: 'moneywise-bridge', version: '2.0.0' });
            const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
                requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } }
            });
            await client.connect(transport, { timeout: TIMEOUT_MS });
            return client;
        })().catch(err => {
            remote = null;
            throw err;
        });
    }
    return remote;
}

const unreachable = err => `MoneyWise connector error (${MCP_URL}): ${err.message}`;

const server = new Server(
    { name: 'moneywise', version: '2.0.0' },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
);

server.setRequestHandler(ListToolsRequestSchema, async request => {
    const client = await connectRemote().catch(err => {
        throw new Error(unreachable(err));
    });
    return client.listTools(request.params, { timeout: TIMEOUT_MS });
});

server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
        const client = await connectRemote();
        return await client.callTool(request.params, undefined, { timeout: TIMEOUT_MS });
    } catch (err) {
        console.error('[moneywise-bridge]', err.message);
        return { content: [{ type: 'text', text: unreachable(err) }], isError: true };
    }
});

await server.connect(new StdioServerTransport());
console.error(`[moneywise-bridge] ready, forwarding to ${MCP_URL}`);

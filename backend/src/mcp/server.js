/**
 * MoneyWise MCP endpoint: POST /mcp on the Express app.
 *
 * Runs next to the live database, so tools read and write production data
 * directly. Claude desktop reaches it through the local stdio bridge in mcp/
 * (bridge.js), which sends `Authorization: Bearer <MCP_TOKEN>`.
 *
 * Stateless Streamable HTTP: every request gets a fresh server + transport,
 * and replies are plain JSON (no SSE stream to keep open through Fly's proxy).
 * With MCP_TOKEN unset the endpoint does not exist (404).
 */

import crypto from 'crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SERVER_INSTRUCTIONS } from './rules.js';
import { registerReadTools } from './readTools.js';
import { registerWriteTools } from './writeTools.js';

function createMcpServer() {
    const server = new McpServer(
        { name: 'moneywise', version: '2.0.0' },
        { instructions: SERVER_INSTRUCTIONS }
    );
    registerReadTools(server);
    registerWriteTools(server);
    return server;
}

function tokenMatches(header) {
    const expected = Buffer.from(`Bearer ${process.env.MCP_TOKEN}`);
    const given = Buffer.from(header || '');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function requireMcpToken(req, res, next) {
    if (!process.env.MCP_TOKEN) return res.status(404).json({ error: 'Not found' });
    if (!tokenMatches(req.get('authorization'))) return res.status(401).json({ error: 'Invalid MCP token' });
    next();
}

const router = express.Router();

router.post('/', requireMcpToken, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
        transport.close();
        server.close();
    });
    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        console.error('[mcp] request failed:', err);
        if (!res.headersSent) {
            res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
    }
});

// No server-initiated stream and no sessions to end.
router.all('/', requireMcpToken, (req, res) => {
    res.set('Allow', 'POST').status(405).json({ error: 'Method not allowed' });
});

export default router;

/**
 * MoneyWise local MCP connector.
 *
 * Claude desktop (Windows) starts this over stdio via run.sh inside WSL. It is
 * strictly read-only: the connection refuses writes (query_only) and no tool
 * modifies anything. The only thing it changes is the local copy of the
 * database, when it refreshes it from production.
 *
 * stdout is the MCP protocol channel. Log with console.error only.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getDb, ensureFresh, STALE_AFTER_HOURS } from './data.js';
import { buildSnapshot, CRITICAL_RULES } from './snapshot.js';

const MAX_QUERY_ROWS = 500;

const server = new McpServer(
    { name: 'moneywise', version: '1.0.0' },
    {
        instructions: [
            "Read-only access to MoneyWise, Sudarshan's personal envelope-budgeting app (USD).",
            'Start with get_financial_snapshot for any question about his spending, budgets or finances; use query_moneywise for follow-up detail.',
            `Data is a local copy of production, refreshed automatically when older than ${STALE_AFTER_HOURS} hours. Call refresh_moneywise_data when he says he has entered new transactions, and always mention it when dataFreshness reports a syncError.`,
            'If moneywise.md is in the project knowledge, it explains the budgeting model in full. Essential rules:',
            ...CRITICAL_RULES.map(rule => `- ${rule}`)
        ].join('\n')
    }
);

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function textResult(value) {
    return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
}

function errorResult(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
}

server.registerTool(
    'get_financial_snapshot',
    {
        title: 'MoneyWise financial snapshot',
        description:
            "The complete MoneyWise database in one result: every account (with balances), every category (envelope) " +
            'with its monthly target, every transaction and envelope transfer, the current Ready to Assign breakdown, ' +
            "and the current month's dashboard (each envelope's available balance, activity and carried-forward). " +
            'Also includes data freshness and the rules needed to read it correctly. Use this first for any overview, ' +
            'review or rundown of finances.',
        inputSchema: {
            refresh: z.boolean().optional().describe(
                'Pull a fresh copy from production first, even if the local copy is recent. Takes ~20-40 seconds.'
            )
        },
        annotations: READ_ONLY
    },
    async ({ refresh }) => {
        try {
            const freshness = await ensureFresh({ force: !!refresh });
            return textResult(buildSnapshot(getDb(), freshness));
        } catch (err) {
            console.error('[moneywise-mcp] snapshot failed:', err);
            return errorResult(`Could not build the MoneyWise snapshot: ${err.message}`);
        }
    }
);

server.registerTool(
    'query_moneywise',
    {
        title: 'Query MoneyWise (read-only SQL)',
        description:
            'Run one read-only SQLite query against the MoneyWise database for detail the snapshot does not make easy. ' +
            'Tables: transactions(id, date, amount, account_id, category_id, memo, status, type, is_reconciliation_point) ' +
            "— amount < 0 is money out, date is NULL for pending; category_transfers(id, date, from_category_id, " +
            "to_category_id, amount, memo) — memo 'Auto Funded' is monthly funding; categories(id, name, monthly_amount, " +
            'is_system, is_hidden); accounts(id, name, type, in_moneypot, is_hidden); app_settings(key, value). ' +
            `Returns at most ${MAX_QUERY_ROWS} rows. Writes are refused.`,
        inputSchema: {
            sql: z.string().min(1).describe('A single SELECT (or WITH ... SELECT) statement.')
        },
        annotations: READ_ONLY
    },
    async ({ sql }) => {
        try {
            const freshness = await ensureFresh();
            const stmt = getDb().prepare(sql);
            if (!stmt.reader) {
                return errorResult('Only read-only queries that return rows are allowed.');
            }
            const rows = [];
            let truncated = false;
            for (const row of stmt.raw(true).iterate()) {
                if (rows.length === MAX_QUERY_ROWS) {
                    truncated = true;
                    break;
                }
                rows.push(row);
            }
            return textResult({
                columns: stmt.columns().map(c => c.name),
                rows,
                rowCount: rows.length,
                truncated,
                dataFreshness: freshness
            });
        } catch (err) {
            return errorResult(`Query failed: ${err.message}`);
        }
    }
);

server.registerTool(
    'refresh_moneywise_data',
    {
        title: 'Refresh MoneyWise data',
        description:
            'Pull a fresh copy of the MoneyWise database from production now. Use when Sudarshan says he has entered ' +
            'or changed transactions, or asks for the latest data. Takes ~20-40 seconds.',
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
    },
    async () => {
        const freshness = await ensureFresh({ force: true });
        if (freshness.syncError) return errorResult(`Refresh failed: ${freshness.syncError}`);
        const db = getDb();
        const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
        return textResult({
            ...freshness,
            transactions: count('transactions'),
            categoryTransfers: count('category_transfers'),
            latestTransactionDate: db.prepare('SELECT MAX(date) AS d FROM transactions').get().d
        });
    }
);

await server.connect(new StdioServerTransport());
console.error('[moneywise-mcp] ready');

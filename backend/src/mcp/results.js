// MCP tool result shapes.

export function textResult(value) {
    return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
}

export function errorResult(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
}

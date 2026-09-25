#!/bin/bash
# Entry point for Claude desktop on Windows, configured as:
#   wsl.exe -e /home/sudarshan/moneywise/mcp/run.sh
# stdout is the MCP protocol channel, so nothing here may print to it.

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.fly/bin:$PATH"

cd "$(dirname "$0")" || exit 1
exec node server.js

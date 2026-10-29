// Run by Claude Desktop / Claude Code directly. No network needed.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildServer } from "./mcp.js"
const server = buildServer("claude")
await server.connect(new StdioServerTransport())

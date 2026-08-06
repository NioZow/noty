/**
 * MCP Streamable HTTP endpoint for Next.js App Router.
 *
 * Uses the Web-Standard Streamable HTTP transport from
 * `@modelcontextprotocol/sdk` so the endpoint works under both the Next.js
 * dev server (Turbopack) and a production `next start`.
 *
 * @module mcp/route
 */

import { buildMcpServer } from "../lib/mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

async function handleMcpRequest(request: Request): Promise<Response> {
  // Fresh server per request avoids "already connected to a transport" errors
  // in stateless mode (required by the SDK).
  const mcp = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  return transport.handleRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}

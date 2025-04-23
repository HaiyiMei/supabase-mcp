#!/usr/bin/env node

import express from "express";
import type { Request, Response } from "express";
import { parseArgs } from "node:util";
import packageJson from '../package.json' with { type: 'json' };
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createSupabaseMcpServer } from "./server.js";

const { version } = packageJson;

async function main() {
  const {
    values: {
      ["read-only"]: readOnly,
      ["api-url"]: apiUrl,
      ["version"]: showVersion,
      port: cliPort,
    },
  } = parseArgs({
    options: {
      ["read-only"]: {
        type: "boolean",
        default: false,
      },
      ["api-url"]: {
        type: "string",
      },
      ["version"]: {
        type: "boolean",
      },
      ["port"]: {
        type: "string",
        default: "3001",
      },
    },
  });

  if (showVersion) {
    console.log(version);
    process.exit(0);
  }

  try {
    console.log("Starting Supabase MCP SSE server...");

    // Create express app
    const app = express();

    // Store servers and transports keyed by sessionId
    const sessions: { 
      [sessionId: string]: { 
        transport: SSEServerTransport, 
        server: ReturnType<typeof createSupabaseMcpServer> 
      } 
    } = {};

    // SSE endpoint for establishing connection with access token in URL
    app.get("/sse/:accessToken", async (req: Request, res: Response) => {
      const accessToken = req.params.accessToken;
      
      if (!accessToken) {
        console.error("No access token provided in URL");
        res.status(401).send("Access token is required");
        return;
      }
      
      console.log("New SSE connection request");
      
      // Create the Supabase MCP server with the token from URL
      const server = createSupabaseMcpServer({
        platform: {
          accessToken,
          apiUrl,
        },
        readOnly,
      });
      
      const transport = new SSEServerTransport("/messages", res);
      sessions[transport.sessionId] = { transport, server };
      
      res.on("close", () => {
        delete sessions[transport.sessionId];
        console.log(`Connection closed for session ID: ${transport.sessionId}`);
      });
      
      await server.connect(transport);
    });

    // Endpoint for receiving messages from client
    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const session = sessions[sessionId];
      
      console.log(`Received message for session ID: ${sessionId}`);
      
      if (session?.transport) {
        await session.transport.handlePostMessage(req, res);
      } else {
        console.log(`No transport found for session ID: ${sessionId}`);
        res.status(400).send("No transport found for sessionId");
      }
    });

    // Start the express server
    const port = cliPort || process.env.PORT || "3001";
    app.listen(parseInt(port), () => {
      console.log(
        `Supabase MCP SSE server v${version} listening on port ${port}`
      );
      console.log(`SSE endpoint available at http://localhost:${port}/sse/:accessToken`);
      console.log(
        `Message endpoint available at http://localhost:${port}/messages`
      );
    });
  } catch (error) {
    console.error("Error starting Supabase MCP SSE server:", error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

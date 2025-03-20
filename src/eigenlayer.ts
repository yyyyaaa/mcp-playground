import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(new URL(".", import.meta.url).pathname, "../.env"),
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Mistral } from "@mistralai/mistralai";

const server = new McpServer({
  name: "EigenLayer AVS Service",
  version: "0.0.1",
});

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const EIGEN_EXPLORER_API_KEY = process.env.EIGEN_EXPLORER_API_KEY;

async function fetchAVS() {
  try {
    const response = await fetch("https://api.eigenexplorer.com/avs", {
      headers: {
        "X-API-Token": EIGEN_EXPLORER_API_KEY || "",
      },
    });

    if (!response.ok) {
      throw new Error(`AVS API HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    return json;
  } catch (error) {
    console.error("Error fetching AVS endpoint", error);
    return [];
  }
}

server.tool(
  "get-avs-list",
  "Query AVSs data",
  {
    fullPrompt: z.string().describe("The complete user query about AVS data"),
    avsName: z.string().optional().describe("The name of the AVS to focus on"),
  },
  async ({ fullPrompt, avsName }) => {
    try {
      const avsData = await fetchAVS();

      const mistralClient = new Mistral({ apiKey: MISTRAL_API_KEY });
      const chatResponse = await mistralClient.chat.complete({
        model: "mistral-large-latest",
        messages: [
          {
            role: "user",
            content: `
              You are an EigenLayer AVS data assistant. Your task is to analyze AVS data and respond to user queries.

              Here is the AVS data from the EigenExplorer API:
              ${JSON.stringify(avsData, null, 2)}

              User query: ${fullPrompt}
              AVS name: ${avsName}

              Provide a detailed, well-structured response that directly addresses the user's query about the AVS data.
              Focus on being accurate, informative, and comprehensive.

              You can use the following format to structure your response:
              - Introduction
              - Data Analysis
              - Conclusion

              Explain the advanced concepts (if any) for users who are not familiar with EigenLayer along the way.
            `,
          },
        ],
      });

      if (!chatResponse.choices || chatResponse.choices.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No response from EigenLayer AVS data assistant",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `${chatResponse.choices[0].message.content}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            // biome-ignore lint:
            text: `Error fetching AVS data ${(error as any).message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("EigenLayer MCP server started on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main()", error);
  process.exit(1);
});

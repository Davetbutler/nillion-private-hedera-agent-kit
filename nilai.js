const dotenv = require('dotenv');
dotenv.config();

const readline = require('readline');
const axios = require('axios');
const { Client, PrivateKey } = require('@hashgraph/sdk');
const { HederaLangchainToolkit, coreQueriesPlugin, coreAccountPlugin } = require('hedera-agent-kit');

// Nilai LLM wrapper with tool-calling orchestration
class NilaiLLMWithTools {
  constructor(apiKey, tools, baseURL, model) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
    this.tools = tools;
    this.toolMap = {};
    tools.forEach(tool => {
      this.toolMap[tool.name] = tool;
    });
  }

  async callNilai(messages) {
    const url = `${this.baseURL}/chat/completions`;
    const payload = {
      model: this.model,
      messages,
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 2048,
      stream: false,
      nilrag: {}
    };
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
    const response = await axios.post(url, payload, { headers });
    return response.data.choices[0].message.content;
  }

  async getToolDecision(userInput) {
    const messages = [
      {
        role: 'system',
        content: `You are a Hedera blockchain assistant. Analyze the user's request and determine:

1. If a tool is needed, respond with JSON: {"toolName": "tool_name", "parameters": {...}}
2. If no tool is needed, respond with your answer directly

Available tools:
- get_hbar_balance_query_tool: Check HBAR balance (no parameters needed)
- get_account_query_tool: Get account details (optional parameters: {"accountId": "0.0.xxxx"})
- transfer_hbar_tool: Transfer HBAR (requires parameters: {"transfers": [{"accountId": "0.0.1234", "amount": 10}]})

Examples:
- "What's my balance?" → {"toolName": "get_hbar_balance_query_tool", "parameters": {}}
- "Show details for 0.0.1234" → {"toolName": "get_account_query_tool", "parameters": {"accountId": "0.0.1234"}}
- "Transfer 10 HBAR to 0.0.800" → {"toolName": "transfer_hbar_tool", "parameters": {"transfers": [{"accountId": "0.0.800", "amount": 10}]}}
- "Hello" → "Hello! I can help you check HBAR balances and send transfers."

Return ONLY JSON for tool calls, or plain text for general responses.`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.callNilai(messages);
    try {
      const parsed = JSON.parse(response.trim());
      return { toolName: parsed.toolName, parameters: parsed.parameters || {}, response: null };
    } catch (e) {
      return { toolName: null, parameters: null, response: response };
    }
  }

  async executeTool(toolName, parameters) {
    const tool = this.toolMap[toolName];
    if (!tool) throw new Error(`Tool ${toolName} not found`);
    try {
      return await tool.invoke(parameters);
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  async formatToolResult(userInput, toolName, toolResult) {
    const messages = [
      {
        role: 'system',
        content: `You are a Hedera blockchain assistant. Format the tool result into a clear, human-readable response.

For balance results: Show the balance clearly
For transfer results: Show transaction ID and status
For errors: Explain what went wrong

If a transaction ID is present, append a Testnet explorer link on a new line using this format:
Explorer: https://testnet.hederaexplorer.io/search-details/transaction/<TRANSACTION_ID>

Be concise and helpful.`
      },
      {
        role: 'user',
        content: `User asked: "${userInput}"
Tool used: ${toolName}
Tool result: ${JSON.stringify(toolResult)}

Please format this into a clear response for the user.`
      }
    ];
    return await this.callNilai(messages);
  }

  async invoke(initialMessages) {
    const userInput = initialMessages[initialMessages.length - 1]?.content || '';
    const decision = await this.getToolDecision(userInput);
    if (!decision.toolName) {
      return { content: decision.response, role: 'assistant' };
    }
    const toolResult = await this.executeTool(decision.toolName, decision.parameters);
    const finalResponse = await this.formatToolResult(userInput, decision.toolName, toolResult);
    return { content: finalResponse, role: 'assistant' };
  }
}

function createLLM(tools) {
  if (!process.env.NILAI_API_KEY || !process.env.NILAI_BASE_URL) {
    throw new Error('Set NILAI_API_KEY and NILAI_BASE_URL in your environment');
  }
  return new NilaiLLMWithTools(
    process.env.NILAI_API_KEY,
    tools,
    process.env.NILAI_BASE_URL,
    process.env.NILAI_MODEL || 'meta-llama/Llama-3.1-8B-Instruct'
  );
}

async function main() {
  // Hedera client and toolkit (for tools execution)
  const client = Client.forTestnet().setOperator(
    process.env.HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY),
  );

  const hederaAgentToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreQueriesPlugin, coreAccountPlugin]
    },
  });

  const tools = hederaAgentToolkit.getTools();

  // Initialize Nilai LLM with tools
  const llm = createLLM(tools);

  // One-shot CLI mode if a prompt is provided as arguments
  const cliPrompt = process.argv.slice(2).join(' ').trim();
  if (cliPrompt) {
    const messages = [
      {
        role: 'system',
        content: `You are a Hedera blockchain assistant. You can help with: checking HBAR balances and sending HBAR transfers.`
      },
      {
        role: 'user',
        content: `${cliPrompt}${process.env.HEDERA_ACCOUNT_ID ? `\n\nAccount ID: ${process.env.HEDERA_ACCOUNT_ID}` : ''}`
      }
    ];
    const response = await llm.invoke(messages);
    console.log(typeof response === 'string' ? response : response.content || response);
    return;
  }

  // Interactive mode
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('🤖 Nilai chat. Type your question, or "exit" to quit.');

  const ask = () => {
    rl.question('You: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      if (!userInput.trim()) {
        ask();
        return;
      }

      try {
        const messages = [
          {
            role: 'system',
            content: `You are a Hedera blockchain assistant. You can help with: checking HBAR balances and sending HBAR transfers.`
          },
          {
            role: 'user',
            content: `${userInput}${process.env.HEDERA_ACCOUNT_ID ? `\n\nAccount ID: ${process.env.HEDERA_ACCOUNT_ID}` : ''}`
          }
        ];
        const resp = await llm.invoke(messages);
        console.log('Assistant:', typeof resp === 'string' ? resp : resp.content || resp);
      } catch (e) {
        console.error('Error:', e.message);
      }
      ask();
    });
  };
  ask();
}

main().catch(console.error);
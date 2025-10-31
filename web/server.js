const dotenv = require('dotenv');
dotenv.config();

const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Client, PrivateKey } = require('@hashgraph/sdk');
const { HederaLangchainToolkit, coreQueriesPlugin, coreAccountPlugin } = require('hedera-agent-kit');

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
      { role: 'user', content: userInput }
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

function createToolkit(accountIdOverride, privateKeyOverride) {
  const operatorAccountId = accountIdOverride || process.env.HEDERA_ACCOUNT_ID;
  const operatorPrivateKey = privateKeyOverride || process.env.HEDERA_PRIVATE_KEY;
  const client = Client.forTestnet().setOperator(
    operatorAccountId,
    PrivateKey.fromStringECDSA(operatorPrivateKey)
  );

  const hederaAgentToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreQueriesPlugin, coreAccountPlugin],
      context: { accountId: operatorAccountId }
    }
  });

  return hederaAgentToolkit;
}

function createLLM(tools) {
  if (!process.env.NILAI_API_KEY || !process.env.NILAI_BASE_URL) {
    throw new Error('Set NILAI_API_KEY and NILAI_BASE_URL');
  }
  return new NilaiLLMWithTools(
    process.env.NILAI_API_KEY,
    tools,
    process.env.NILAI_BASE_URL,
    process.env.NILAI_MODEL || 'meta-llama/Llama-3.1-8B-Instruct'
  );
}

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  try {
    const { message, accountId, privateKey } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const toolkit = createToolkit(accountId, privateKey);
    const tools = toolkit.getTools();
    const llm = createLLM(tools);

    const messages = [
      { role: 'system', content: 'You are a Hedera blockchain assistant.' },
      { role: 'user', content: `${message}${(accountId || process.env.HEDERA_ACCOUNT_ID) ? `\n\nAccount ID: ${accountId || process.env.HEDERA_ACCOUNT_ID}` : ''}` }
    ];

    const response = await llm.invoke(messages);
    res.json({ content: response.content || response });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Unexpected error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Web app listening on http://localhost:${port}`);
});



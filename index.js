const dotenv = require('dotenv');
dotenv.config();

const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { createAgent } = require('langchain');
const { Client, PrivateKey } = require('@hashgraph/sdk');
const { HederaLangchainToolkit, coreQueriesPlugin, coreAccountPlugin } = require('hedera-agent-kit');
const axios = require('axios');
const readline = require('readline');

// Custom nilAI LLM with tool calling capabilities
class NilaiLLMWithTools {
  constructor(apiKey, tools) {
    this.apiKey = apiKey;
    this.baseURL = 'https://nilai-f910.nillion.network/v1';
    this.tools = tools;
    this.toolMap = {};
    
    // Create a map of tool names to tool functions
    tools.forEach(tool => {
      this.toolMap[tool.name] = tool;
    });
  }

  async callNilai(messages) {
    try {
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'meta-llama/Llama-3.1-8B-Instruct',
        messages: messages,
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 2048,
        stream: false,
        nilrag: {}
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling nilAI:', error.response?.data || error.message);
      throw error;
    }
  }




  // Step 1: Get tool decision and parameters from nilAI
  async getToolDecision(userInput) {
    const messages = [
      {
        role: 'system',
        content: `You are a Hedera blockchain assistant. Analyze the user's request and determine:

1. If a tool is needed, respond with JSON: {"toolName": "tool_name", "parameters": {...}}
2. If no tool is needed, respond with your answer directly

Available tools:
- get_hbar_balance_query_tool: Check HBAR balance (no parameters needed)
- transfer_hbar_tool: Transfer HBAR (requires parameters: {"transfers": [{"accountId": "0.0.1234", "amount": 10}]})

Examples:
- "What's my balance?" → {"toolName": "get_hbar_balance_query_tool", "parameters": {}}
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
    
    // Try to parse as JSON (tool decision)
    try {
      const parsed = JSON.parse(response.trim());
      return {
        toolName: parsed.toolName,
        parameters: parsed.parameters || {},
        response: null
      };
    } catch (e) {
      // Not JSON, so it's a direct response
      return {
        toolName: null,
        parameters: null,
        response: response
      };
    }
  }

  // Step 2: Execute the tool with parameters
  async executeTool(toolName, parameters) {
    const tool = this.toolMap[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    try {
      const result = await tool.invoke(parameters);
      return result;
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      return `Error: ${error.message}`;
    }
  }

  // Step 3: Format tool result into human-readable form
  async formatToolResult(userInput, toolName, toolResult) {
    const messages = [
      {
        role: 'system',
        content: `You are a Hedera blockchain assistant. Format the tool result into a clear, human-readable response.

For balance results: Show the balance clearly
For transfer results: Show transaction ID and status
For errors: Explain what went wrong

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

    const response = await this.callNilai(messages);
    return response;
  }

  // Main conversation loop with tool calling
  async invoke(initialMessages) {
    const userInput = initialMessages[initialMessages.length - 1]?.content || '';
    
    // Step 1: Call nilAI to detect which tool to use and get parameters
    const toolDecision = await this.getToolDecision(userInput);
    
    if (!toolDecision.toolName) {
      // No tool needed, return nilAI's response directly
      return {
        content: toolDecision.response,
        role: 'assistant'
      };
    }
    
    // Step 2: Execute the tool with the parameters
    const toolResult = await this.executeTool(toolDecision.toolName, toolDecision.parameters);
    
    // Step 3: Call nilAI to format the tool result into human-readable form
    const finalResponse = await this.formatToolResult(userInput, toolDecision.toolName, toolResult);
    
    return {
      content: finalResponse,
      role: 'assistant'
    };
  }
}

// Choose your AI provider (install the one you want to use)
function createLLM(tools = []) {
  // Option 1: nilAI with tool calling (requires NILAI_API_KEY in .env)
  if (process.env.NILAI_API_KEY) {
    return new NilaiLLMWithTools(process.env.NILAI_API_KEY, tools);
  }
  
  
  // If no provider is configured, throw an error
  console.error('No AI provider configured. Please either:');
  console.error('1. Set NILAI_API_KEY in .env for nilAI with tool calling');
  console.error('2. Set OPENAI_API_KEY in .env for OpenAI');
  process.exit(1);
}

async function main() {
  // Hedera client setup (Testnet by default)
  const client = Client.forTestnet().setOperator(
    process.env.HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY),
  );

  const hederaAgentToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreQueriesPlugin, coreAccountPlugin] // queries and account management
    },
  });
  
  // Fetch tools from toolkit
  const tools = hederaAgentToolkit.getTools();

  // Initialize AI model with tools
  const llm = createLLM(tools);

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🤖 Hedera Blockchain Assistant with nilAI');
  console.log('💡 You can ask about HBAR balances and send HBAR transfers');
  console.log('📝 Type "exit" to quit\n');

  const askQuestion = () => {
    rl.question('You: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }

      if (userInput.trim() === '') {
        askQuestion();
        return;
      }

      try {
        console.log('🤔 Processing your request...\n');
        
        // Prepare messages for the AI
                const messages = [
                  { 
                    role: 'system', 
                    content: `You are a Hedera blockchain assistant. You can help with:

1. Check HBAR balances - say "I'll use get_hbar_balance_query_tool"
2. Send HBAR transfers - say "I'll use transfer_hbar_tool" 
3. Other requests - say "I can only check HBAR balances and send HBAR transfers"

IMPORTANT RULES:
- For balance requests: Respond with "I'll use get_hbar_balance_query_tool"
- For transfer requests: Respond with "I'll use transfer_hbar_tool" 
- For other requests: Say "I can only check HBAR balances and send HBAR transfers. Other features are not supported yet."
- Be explicit about which tool you want to use
- Don't make up information - always use actual tool results

Available tools: get_hbar_balance_query_tool, transfer_hbar_tool` 
                  },
                  { 
                    role: 'user', 
                    content: `${userInput}\n\nAccount ID: ${process.env.HEDERA_ACCOUNT_ID}`
                  }
                ];
        
        // Call the AI with tool calling capabilities
        const response = await llm.invoke(messages);
        
        // Show the assistant response
        console.log('🤖 Assistant:', response.content);
        console.log('\n' + '─'.repeat(50) + '\n');
        
      } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n' + '─'.repeat(50) + '\n');
      }

      // Ask for the next question
      askQuestion();
    });
  };

  // Start the interactive session
  askQuestion();
}

main().catch(console.error);
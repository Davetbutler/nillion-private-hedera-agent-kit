const dotenv = require('dotenv');
dotenv.config();

const { ChatPromptTemplate } = require('@langchain/core/prompts');
// Agents API not used; we'll invoke a toolkit tool directly
const { Client, PrivateKey } = require('@hashgraph/sdk');
const { HederaLangchainToolkit, coreQueriesPlugin } = require('hedera-agent-kit');

// Choose Nilai via OpenAI-compatible client
function createLLM() {
  if (process.env.NILAI_API_KEY && process.env.NILAI_BASE_URL) {
    const { ChatOpenAI } = require('@langchain/openai');
    return new ChatOpenAI({
      model: process.env.NILAI_MODEL || 'meta-llama/Llama-3.1-8B-Instruct',
      apiKey: process.env.NILAI_API_KEY,
      configuration: {
        baseURL: process.env.NILAI_BASE_URL,
      },
    });
  }

  throw new Error('No compatible API key found. Set NILAI_API_KEY and NILAI_BASE_URL.');
}

async function main() {
  // Initialize AI model
  const llm = createLLM();

  // Hedera client setup (Testnet by default)
  const client = Client.forTestnet().setOperator(
    process.env.HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY),
  );

  const hederaAgentToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreQueriesPlugin] // all our core plugins here https://github.com/hedera-dev/hedera-agent-kit/tree/main/typescript/src/plugins
    },
  });
  
  // Fetch tools from toolkit
  const tools = hederaAgentToolkit.getTools();

  // Find and invoke the balance query tool directly
  const balanceTool = tools.find(t => t.name === 'get_hbar_balance_query_tool');
  if (!balanceTool) {
    throw new Error('get_hbar_balance_query_tool not found in toolkit');
  }

  const result = await balanceTool.invoke({});
  console.log(result);
}

main().catch(console.error);
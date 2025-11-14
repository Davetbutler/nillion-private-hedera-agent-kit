<iframe
  src="https://nilcc.nillion.com/api/badge?verificationUrl=https%3A%2F%2Fgithub.com%2FDavetbutler%2Fnillion-private-hedera-agent-kit%2Fblob%2Fmain%2Fmeasurement-hash.json&reportUrl=https%3A%2F%2F7c901ca2-f48d-4208-ab2e-fc560ea39f0b.workloads.nilcc.sandbox.nillion.network%2Fnilcc%2Fapi%2Fv2%2Freport"
  width={260}
  height={90}
  style={{ border: 'none' }}
/>

# Hedera Agent Kit - Private Implementation

A submission for ETHOnline hackathon using HederaAgentKit.

## 🎯 Project Goal

Currently, when using HAK the centralised AI provider (e.g. OpenAI) that you choose to use gets to see all the queries you are making. I wanted to avoid this, and implement the HAK to be compatibale with nilAI. nilAI provides private AI inference, run inside a TEE. Watch the short video below for an overview of the project.

## 📹 Demo Video

[Watch video overview of project](https://www.loom.com/share/4b3b548431084761aa650d04044f1157)   

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Copy `.env.example` to `.env` (if available)
   - Configure your Hedera network credentials

3. **Run the application:**
   ```bash
   node index.js
   ```

## 📁 Project Structure

```
├── index.js          # Main application entry point
├── package.json      # Project dependencies
├── .env             # Environment configuration
└── README.md        # This file
```

## 🔧 Configuration

Make sure to configure your `.env` file with the necessary Hedera network credentials and agent settings before running the application.

## 📝 License

This project is part of the ETHOnline hackathon submission.

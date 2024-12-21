const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');

class decisions {
    constructor(wallets, network = 'mainnet-beta', aiConfig = {}) {
        this.connection = new Connection(network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com', 'confirmed');
        this.wallets = wallets;
        this.aiConfig = {
            modelEndpoint: aiConfig.modelEndpoint || process.env.CLAUDE_ENDPOINT,
            apiKey: aiConfig.apiKey || process.env.CLAUDE_API_KEY,
            minConfidence: aiConfig.minConfidence || 0.75,
            historicalDataDays: aiConfig.historicalDataDays || 30
        };
        this.tradingPatterns = new Map();
        this.walletProfiles = new Map();
    }

    __init() {
        console.log('Initializing AI-powered trading analysis...');
        this.initializeAISystem();
    }

    async initializeAISystem() {
        try {
            await this.loadHistoricalData();
            await this.initializeWalletProfiles();
            console.log('AI system initialized successfully');
        } catch (error) {
            console.error('Error initializing AI system:', error);
            throw error;
        }
    }

    async loadHistoricalData() {
        const currentTime = new Date().getTime() / 1000;
        const startTime = currentTime - (this.aiConfig.historicalDataDays * 24 * 60 * 60);
        
        for (const wallet of this.wallets) {
            try {
                const signatures = await this.connection.getSignaturesForAddress(
                    new PublicKey(wallet),
                    { limit: 1000, before: currentTime, until: startTime }
                );
                
                const transactions = await Promise.all(
                    signatures.map(sig => this.connection.getParsedTransaction(sig.signature))
                );
                
                this.tradingPatterns.set(wallet, this.analyzeTradingPattern(transactions));
            } catch (error) {
                console.error(`Error loading historical data for wallet ${wallet}:`, error);
            }
        }
    }

    analyzeTradingPattern(transactions) {
        const pattern = {
            buyFrequency: {},
            sellFrequency: {},
            averageHoldTime: {},
            successRate: {},
            preferredTokens: new Set(),
            riskProfile: 'unknown'
        };

        transactions.forEach(tx => {
            if (!tx?.meta) return;
            
            // Analyze transaction type and update patterns
            this.updatePatternFromTransaction(pattern, tx);
        });

        return pattern;
    }

    async getTokenAccounts(publicKey) {
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
            new PublicKey(publicKey),
            {
                programId: TOKEN_PROGRAM_ID
            }
        );
        return tokenAccounts.value;
    }

    async getTokens(publicKey) {
        try {
            const tokenAccounts = await this.getTokenAccounts(publicKey);
            
            if (tokenAccounts.length === 0) {
                return [];
            }
            
            const tokens = [];
            
            for (let account of tokenAccounts) {
                const { account: tokenData } = account;
                const tokenAmount = tokenData.data.parsed.info.tokenAmount;
                
                tokens.push({
                    token: account.account.data.parsed.info.mint,
                    amount: tokenAmount.uiAmount
                });
            }
            
            return tokens;
        } catch (error) {
            console.error('Error fetching tokens:', error);
            return [];
        }
    }

    async analyzeWalletBehavior(wallet) {
        const pattern = this.tradingPatterns.get(wallet);
        if (!pattern) return null;

        const prompt = this.constructAIPrompt(pattern);
        try {
            const analysis = await this.queryAI(prompt);
            return this.parseAIResponse(analysis);
        } catch (error) {
            console.error('Error analyzing wallet behavior:', error);
            return null;
        }
    }

    async queryAI(prompt) {
        try {
            const response = await axios.post(this.aiConfig.modelEndpoint, {
                prompt,
                max_tokens: 1000,
                temperature: 0.7,
                headers: {
                    'Authorization': `Bearer ${this.aiConfig.apiKey}`
                }
            });
            return response.data.choices[0].text;
        } catch (error) {
            console.error('Error querying AI:', error);
            throw error;
        }
    }

    constructAIPrompt(pattern) {
        return `Analyze the following trading pattern and provide insights:
                Buy Frequency: ${JSON.stringify(pattern.buyFrequency)}
                Sell Frequency: ${JSON.stringify(pattern.sellFrequency)}
                Average Hold Time: ${JSON.stringify(pattern.averageHoldTime)}
                Success Rate: ${JSON.stringify(pattern.successRate)}
                Risk Profile: ${pattern.riskProfile}
                
                Please provide:
                1. Trading strategy classification
                2. Risk assessment
                3. Token preference analysis
                4. Success probability for current market conditions`;
    }

    parseAIResponse(response) {
        // Implement parsing logic based on your AI model's output format
        return {
            strategy: response.strategy,
            riskLevel: response.riskLevel,
            confidenceScore: response.confidenceScore,
            recommendations: response.recommendations
        };
    }

    async decideWhatToBuy(wallets) {
        const tokenData = {};
        const aiInsights = {};

        // Gather token data and AI insights for each wallet
        for (const wallet of wallets) {
            const tokens = await this.getTokens(wallet);
            const walletAnalysis = await this.analyzeWalletBehavior(wallet);
            
            if (walletAnalysis) {
                aiInsights[wallet] = walletAnalysis;
            }

            for (let token of tokens) {
                if (!tokenData[token.token]) {
                    tokenData[token.token] = { 
                        count: 0, 
                        totalAmount: 0,
                        aiScore: 0
                    };
                }
                tokenData[token.token].count++;
                tokenData[token.token].totalAmount += token.amount;
                
                // Incorporate AI insights into scoring
                if (aiInsights[wallet]) {
                    tokenData[token.token].aiScore += 
                        this.calculateAIScore(token.token, aiInsights[wallet]);
                }
            }
        }

        const tokenScores = Object.keys(tokenData).map(token => {
            const { count, totalAmount, aiScore } = tokenData[token];

            // Enhanced scoring algorithm incorporating AI insights
            const score = (count * 0.3) + 
                         (totalAmount * 0.3) + 
                         (aiScore * 0.4);

            return { token, score, aiConfidence: aiScore / count };
        });

        // Filter out low-confidence predictions
        const filteredScores = tokenScores.filter(
            item => item.aiConfidence >= this.aiConfig.minConfidence
        );

        // Sort by score
        filteredScores.sort((a, b) => b.score - a.score);

        return filteredScores.map(item => ({
            token: item.token,
            score: item.score,
            confidence: item.aiConfidence,
            recommendation: this.generateRecommendation(item)
        }));
    }

    calculateAIScore(token, analysis) {
        let score = 0;
        
        if (analysis.strategy === 'momentum') score += 0.3;
        if (analysis.riskLevel === 'moderate') score += 0.2;
        if (analysis.confidenceScore > 0.8) score += 0.5;
        
        return score;
    }

    generateRecommendation(scoredToken) {
        const confidence = scoredToken.confidence;
        const score = scoredToken.score;

        if (confidence > 0.9 && score > 0.8) {
            return 'Strong Buy';
        } else if (confidence > 0.7 && score > 0.6) {
            return 'Buy';
        } else if (confidence > 0.5 && score > 0.4) {
            return 'Hold';
        } else {
            return 'Monitor';
        }
    }

    updatePatternFromTransaction(pattern, tx) {
        // Implementation details for pattern updating
        const timestamp = tx.blockTime;
        const instructions = tx.transaction.message.instructions;
        
        instructions.forEach(instruction => {
            if (this.isSwapInstruction(instruction)) {
                const { inputToken, outputToken, amount } = this.parseSwapInstruction(instruction);
                
                pattern.preferredTokens.add(outputToken);
                
                if (!pattern.buyFrequency[outputToken]) {
                    pattern.buyFrequency[outputToken] = 0;
                }
                pattern.buyFrequency[outputToken]++;
                
                // Update other pattern metrics
                this.updateSuccessRate(pattern, tx);
                this.updateRiskProfile(pattern, amount);
            }
        });
    }

    isSwapInstruction(instruction) {
        // Implementation for detecting swap instructions
        return instruction.program === 'spl-token' && 
               instruction.parsed?.type === 'transfer';
    }

    parseSwapInstruction(instruction) {
        // Implementation for parsing swap details
        return {
            inputToken: instruction.parsed.info.source,
            outputToken: instruction.parsed.info.destination,
            amount: instruction.parsed.info.amount
        };
    }

    updateSuccessRate(pattern, tx) {
        // Implementation for updating success rate based on transaction outcome
        const isSuccessful = tx.meta.err === null;
        const token = tx.transaction.message.accountKeys[0].toString();
        
        if (!pattern.successRate[token]) {
            pattern.successRate[token] = { success: 0, total: 0 };
        }
        
        pattern.successRate[token].total++;
        if (isSuccessful) {
            pattern.successRate[token].success++;
        }
    }

    updateRiskProfile(pattern, amount) {
        // Implementation for updating risk profile based on transaction amount
        const riskScores = [];
        Object.values(pattern.successRate).forEach(rate => {
            const score = (rate.success / rate.total) * (amount > 1000 ? 2 : 1);
            riskScores.push(score);
        });
        
        const avgRiskScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length;
        pattern.riskProfile = avgRiskScore > 1.5 ? 'high' : 
                            avgRiskScore > 1.0 ? 'moderate' : 'conservative';
    }
}

module.exports = decisions;
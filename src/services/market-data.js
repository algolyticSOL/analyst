const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');

class MarketDataService {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(
            config.network === 'devnet' ? 
                'https://api.devnet.solana.com' : 
                'https://api.mainnet-beta.solana.com',
            'confirmed'
        );
        this.cache = new Map();
        this.lastUpdate = new Map();
    }

    async getMarketContext(token) {
        try {
            const [price, volume, liquidity] = await Promise.all([
                this.getTokenPrice(token),
                this.getTokenVolume(token),
                this.getTokenLiquidity(token)
            ]);

            const volatility = await this.calculateVolatility(token);
            const trend = this.analyzeTrend(price, volume);
            
            return {
                price,
                volume,
                liquidity,
                volatility,
                trend,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error fetching market context:', error);
            return null;
        }
    }

    async getTokenPrice(token) {
        // Implement price fetching logic here
        // You might want to use a price oracle or DEX API
        try {
            const response = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token}&vs_currencies=usd`);
            return response.data[token.toLowerCase()]?.usd || null;
        } catch (error) {
            console.error('Error fetching token price:', error);
            return null;
        }
    }

    async getTokenVolume(token) {
        // Implement volume fetching logic
        // You might want to aggregate volume from multiple DEXes
        try {
            const response = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token}&vs_currencies=usd&include_24hr_vol=true`);
            return response.data[token.toLowerCase()]?.usd_24h_vol || null;
        } catch (error) {
            console.error('Error fetching token volume:', error);
            return null;
        }
    }

    async getTokenLiquidity(token) {
        try {
            // Fetch liquidity data from major Solana DEXes
            const liquidityPools = await this.fetchLiquidityPools(token);
            return this.aggregateLiquidity(liquidityPools);
        } catch (error) {
            console.error('Error fetching token liquidity:', error);
            return null;
        }
    }

    async fetchLiquidityPools(token) {
        // Implementation would depend on which DEXes you want to support
        // This is a placeholder implementation
        return [];
    }

    aggregateLiquidity(pools) {
        if (!pools || pools.length === 0) return 0;
        return pools.reduce((total, pool) => total + pool.liquidity, 0);
    }

    async calculateVolatility(token) {
        try {
            // Fetch historical price data
            const historicalPrices = await this.getHistoricalPrices(token);
            if (!historicalPrices || historicalPrices.length < 2) return null;

            // Calculate standard deviation of price changes
            const returns = [];
            for (let i = 1; i < historicalPrices.length; i++) {
                const return_ = Math.log(historicalPrices[i] / historicalPrices[i - 1]);
                returns.push(return_);
            }

            const mean = returns.reduce((a, b) => a + b) / returns.length;
            const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance) * Math.sqrt(365); // Annualized volatility

            return volatility;
        } catch (error) {
            console.error('Error calculating volatility:', error);
            return null;
        }
    }

    async getHistoricalPrices(token) {
        try {
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/solana/contract/${token}/market_chart/?vs_currency=usd&days=30`
            );
            return response.data.prices.map(price => price[1]);
        } catch (error) {
            console.error('Error fetching historical prices:', error);
            return null;
        }
    }

    analyzeTrend(price, volume) {
        if (!price || !volume) return 'unknown';

        const priceChange = this.cache.get(`${price}_change`);
        const volumeChange = this.cache.get(`${volume}_change`);

        if (!priceChange || !volumeChange) return 'unknown';

        // Simple trend analysis
        if (priceChange > 0 && volumeChange > 0) return 'bullish';
        if (priceChange < 0 && volumeChange > 0) return 'bearish';
        if (Math.abs(priceChange) < 0.02) return 'sideways';
        return priceChange > 0 ? 'weakly_bullish' : 'weakly_bearish';
    }

    async getTokenMetadata(token) {
        try {
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/solana/contract/${token}`
            );
            return {
                name: response.data.name,
                symbol: response.data.symbol,
                description: response.data.description.en,
                marketCap: response.data.market_data.market_cap.usd,
                totalSupply: response.data.market_data.total_supply,
                circulatingSupply: response.data.market_data.circulating_supply
            };
        } catch (error) {
            console.error('Error fetching token metadata:', error);
            return null;
        }
    }

    shouldUpdate(key) {
        const lastUpdate = this.lastUpdate.get(key);
        if (!lastUpdate) return true;
        
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        
        // Update if more than 5 minutes have passed
        return timeSinceLastUpdate > 5 * 60 * 1000;
    }

    updateCache(key, value) {
        this.cache.set(key, value);
        this.lastUpdate.set(key, Date.now());
    }
}

module.exports = MarketDataService; 
const { PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

class WalletUtils {
    constructor(connection) {
        this.connection = connection;
    }

    async isValidWallet(address) {
        try {
            const publicKey = new PublicKey(address);
            const accountInfo = await this.connection.getAccountInfo(publicKey);
            
            if (!accountInfo) return false;

            // Check if it's a normal wallet (not a PDA or program)
            if (accountInfo.owner.equals(SystemProgram.programId)) {
                const balance = await this.connection.getBalance(publicKey);
                // Ensure wallet has some minimum balance (0.01 SOL)
                return balance > 0.01 * LAMPORTS_PER_SOL;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    async getWalletTokenAccounts(address) {
        try {
            const publicKey = new PublicKey(address);
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID }
            );

            return tokenAccounts.value.map(account => ({
                mint: account.account.data.parsed.info.mint,
                amount: account.account.data.parsed.info.tokenAmount.uiAmount,
                decimals: account.account.data.parsed.info.tokenAmount.decimals
            }));
        } catch (error) {
            console.error(`Error fetching token accounts for ${address}:`, error);
            return [];
        }
    }

    async isActiveTrader(address, minTransactions = 5) {
        try {
            const publicKey = new PublicKey(address);
            const signatures = await this.connection.getSignaturesForAddress(
                publicKey,
                { limit: minTransactions }
            );

            // Check if wallet has minimum number of transactions
            if (signatures.length < minTransactions) return false;

            // Get the timestamp of the oldest transaction
            const oldestTx = signatures[signatures.length - 1];
            const now = Date.now() / 1000;
            const txAge = now - oldestTx.blockTime;

            // Check if transactions are within last 30 days
            return txAge <= 30 * 24 * 60 * 60;
        } catch (error) {
            return false;
        }
    }

    async filterWallets(wallets, options = {}) {
        const {
            minBalance = 0.01,
            minTransactions = 5,
            activeOnly = true
        } = options;

        const validWallets = [];

        for (const wallet of wallets) {
            try {
                const publicKey = new PublicKey(wallet);
                const [balance, isActive] = await Promise.all([
                    this.connection.getBalance(publicKey),
                    activeOnly ? this.isActiveTrader(wallet, minTransactions) : true
                ]);

                if (balance >= minBalance * LAMPORTS_PER_SOL && isActive) {
                    validWallets.push(wallet);
                }
            } catch (error) {
                console.error(`Error filtering wallet ${wallet}:`, error);
            }
        }

        return validWallets;
    }

    async getTransactionType(transaction) {
        if (!transaction?.meta || !transaction.transaction) return 'unknown';

        const { message } = transaction.transaction;
        const instructions = message.instructions;

        // Check for common transaction types
        for (const ix of instructions) {
            if (ix.programId.equals(TOKEN_PROGRAM_ID)) {
                if (ix.data[0] === 3) return 'transfer'; // Transfer instruction
                if (ix.data[0] === 7) return 'mint';     // Mint instruction
                if (ix.data[0] === 8) return 'burn';     // Burn instruction
            }
        }

        return 'other';
    }

    calculateTransactionValue(transaction) {
        if (!transaction?.meta) return 0;

        let value = 0;
        const preBalances = transaction.meta.preBalances;
        const postBalances = transaction.meta.postBalances;

        // Calculate the net balance change
        for (let i = 0; i < preBalances.length; i++) {
            const balanceChange = (postBalances[i] - preBalances[i]) / LAMPORTS_PER_SOL;
            value += Math.abs(balanceChange);
        }

        return value;
    }
}

module.exports = WalletUtils; 
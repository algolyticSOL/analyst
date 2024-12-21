const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const WalletUtils = require('../../utils/wallet-utils');
const TransactionMonitor = require('../../services/transaction-monitor');
const EventEmitter = require('events');

class Listen extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.connection = new Connection(
            config.network === 'devnet' ? 
                'https://api.devnet.solana.com' : 
                'https://api.mainnet-beta.solana.com',
            'confirmed'
        );
        this.wallets = new Set();
        this.walletUtils = new WalletUtils(this.connection);
        this.transactionMonitor = new TransactionMonitor(config);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.transactionMonitor.on('walletActivity', (event) => {
            this.handleWalletActivity(event);
        });
    }

    async __init() {
        console.log('Initializing wallet monitoring system...');
        
        // Start monitoring existing wallets
        for (const wallet of this.wallets) {
            await this.transactionMonitor.startMonitoring(wallet);
        }

        // Set up periodic cleanup
        setInterval(() => this.cleanup(), 60 * 60 * 1000); // Run cleanup every hour

        console.log('Wallet monitoring system initialized');
    }

    async handleWalletActivity(event) {
        try {
            if (event.type === 'transaction') {
                // Process new transaction
                const isSignificant = await this.isSignificantTransaction(event);
                if (isSignificant) {
                    this.emit('significantActivity', event);
                }
            } else if (event.type === 'account_change') {
                // Process account changes
                const isSignificant = await this.isSignificantAccountChange(event);
                if (isSignificant) {
                    this.emit('significantActivity', event);
                }
            }
        } catch (error) {
            console.error('Error handling wallet activity:', error);
        }
    }

    async isSignificantTransaction(event) {
        try {
            const tx = await this.connection.getParsedTransaction(
                event.signature,
                { maxSupportedTransactionVersion: 0 }
            );

            if (!tx) return false;

            // Check if transaction involves token transfers
            const isTokenTransfer = tx.transaction.message.instructions.some(ix => 
                ix.programId.equals(TOKEN_PROGRAM_ID)
            );

            if (!isTokenTransfer) return false;

            // Calculate transaction value
            const value = this.walletUtils.calculateTransactionValue(tx);
            
            // Consider significant if value is above threshold (e.g., 1 SOL)
            return value > 1.0;
        } catch (error) {
            console.error('Error checking transaction significance:', error);
            return false;
        }
    }

    async isSignificantAccountChange(event) {
        try {
            const balanceChange = event.accountInfo.lamports / 1e9; // Convert to SOL
            return Math.abs(balanceChange) > 1.0; // Significant if change is more than 1 SOL
        } catch (error) {
            console.error('Error checking account change significance:', error);
            return false;
        }
    }

    async addWallet(wallet) {
        try {
            const isValid = await this.walletUtils.isValidWallet(wallet);
            if (!isValid) {
                console.log(`Invalid wallet address: ${wallet}`);
                return false;
            }

            this.wallets.add(wallet);
            await this.transactionMonitor.startMonitoring(wallet);
            return true;
        } catch (error) {
            console.error(`Error adding wallet ${wallet}:`, error);
            return false;
        }
    }

    async removeWallet(wallet) {
        try {
            this.wallets.delete(wallet);
            await this.transactionMonitor.stopMonitoring(wallet);
            return true;
        } catch (error) {
            console.error(`Error removing wallet ${wallet}:`, error);
            return false;
        }
    }

    async __get_last_100(tokenAddress) {
        try {
            const tokenAccounts = await this.connection.getParsedProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {
                            dataSize: 165, // Size of token account
                        },
                        {
                            memcmp: {
                                offset: 0,
                                bytes: tokenAddress,
                            },
                        },
                    ],
                }
            );

            const holders = [];
            for (const account of tokenAccounts.slice(0, 100)) {
                const parsedData = account.account.data.parsed.info;
                const walletAddress = parsedData.owner;
                
                // Validate wallet before adding
                const isValid = await this.walletUtils.isValidWallet(walletAddress);
                if (isValid) {
                    holders.push(walletAddress);
                    // Start monitoring this wallet
                    await this.addWallet(walletAddress);
                }
            }

            return holders;
        } catch (error) {
            console.error('Error fetching token holders:', error);
            return [];
        }
    }

    getActiveWallets() {
        return this.transactionMonitor.getActiveWallets();
    }

    async cleanup() {
        try {
            // Clean up transaction monitor
            await this.transactionMonitor.cleanup();

            // Remove inactive wallets from our set
            const activeWallets = this.getActiveWallets();
            this.wallets = new Set(activeWallets);

            console.log(`Cleanup completed. Monitoring ${this.wallets.size} active wallets`);
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = Listen;
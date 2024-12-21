const { Connection, PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');

class TransactionMonitor extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.connection = new Connection(
            config.network === 'devnet' ? 
                'https://api.devnet.solana.com' : 
                'https://api.mainnet-beta.solana.com',
            'confirmed'
        );
        this.monitoredWallets = new Set();
        this.subscriptions = new Map();
        this.lastActivity = new Map();
    }

    async startMonitoring(wallet) {
        try {
            const publicKey = new PublicKey(wallet);
            
            if (this.monitoredWallets.has(wallet)) {
                console.log(`Already monitoring wallet: ${wallet}`);
                return;
            }

            // Subscribe to account changes
            const accountSubscriptionId = this.connection.onAccountChange(
                publicKey,
                (accountInfo, context) => {
                    this.handleAccountChange(wallet, accountInfo, context);
                },
                'confirmed'
            );

            // Subscribe to signature notifications (transactions)
            const signatureSubscriptionId = this.connection.onLogs(
                publicKey,
                (logs, context) => {
                    this.handleNewTransaction(wallet, logs, context);
                },
                'confirmed'
            );

            this.subscriptions.set(wallet, {
                account: accountSubscriptionId,
                signature: signatureSubscriptionId
            });

            this.monitoredWallets.add(wallet);
            this.lastActivity.set(wallet, Date.now());

            console.log(`Started monitoring wallet: ${wallet}`);
        } catch (error) {
            console.error(`Error starting monitoring for wallet ${wallet}:`, error);
        }
    }

    async stopMonitoring(wallet) {
        try {
            const subscriptionIds = this.subscriptions.get(wallet);
            if (subscriptionIds) {
                await this.connection.removeAccountChangeListener(subscriptionIds.account);
                await this.connection.removeOnLogsListener(subscriptionIds.signature);
                this.subscriptions.delete(wallet);
                this.monitoredWallets.delete(wallet);
                this.lastActivity.delete(wallet);
                console.log(`Stopped monitoring wallet: ${wallet}`);
            }
        } catch (error) {
            console.error(`Error stopping monitoring for wallet ${wallet}:`, error);
        }
    }

    handleAccountChange(wallet, accountInfo, context) {
        const event = {
            type: 'account_change',
            wallet,
            timestamp: Date.now(),
            slot: context.slot,
            accountInfo: {
                lamports: accountInfo.lamports,
                owner: accountInfo.owner.toBase58(),
                executable: accountInfo.executable,
                rentEpoch: accountInfo.rentEpoch
            }
        };

        this.lastActivity.set(wallet, Date.now());
        this.emit('walletActivity', event);
    }

    async handleNewTransaction(wallet, logs, context) {
        try {
            const signatures = await this.connection.getSignaturesForAddress(
                new PublicKey(wallet),
                { limit: 1 }
            );

            if (signatures.length === 0) return;

            const transaction = await this.connection.getParsedTransaction(
                signatures[0].signature,
                { maxSupportedTransactionVersion: 0 }
            );

            if (!transaction) return;

            const event = {
                type: 'transaction',
                wallet,
                timestamp: Date.now(),
                slot: context.slot,
                signature: signatures[0].signature,
                transaction: {
                    type: this.getTransactionType(transaction),
                    successful: transaction.meta ? transaction.meta.err === null : false,
                    fee: transaction.meta ? transaction.meta.fee : 0,
                    logs: logs.logs
                }
            };

            this.lastActivity.set(wallet, Date.now());
            this.emit('walletActivity', event);
        } catch (error) {
            console.error(`Error handling transaction for wallet ${wallet}:`, error);
        }
    }

    getTransactionType(transaction) {
        if (!transaction?.meta || !transaction.transaction) return 'unknown';

        const instructions = transaction.transaction.message.instructions;
        if (!instructions.length) return 'unknown';

        // Check program IDs and instruction data to determine transaction type
        const programId = instructions[0].programId.toString();
        
        // Add more program ID checks based on your needs
        switch (programId) {
            case 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': // Token Program
                return 'token_transaction';
            case '11111111111111111111111111111111': // System Program
                return 'system_transaction';
            default:
                return 'other';
        }
    }

    isWalletActive(wallet) {
        const lastActivityTime = this.lastActivity.get(wallet);
        if (!lastActivityTime) return false;

        // Consider wallet inactive if no activity in last 24 hours
        const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        return Date.now() - lastActivityTime < inactiveThreshold;
    }

    getMonitoredWallets() {
        return Array.from(this.monitoredWallets);
    }

    getActiveWallets() {
        return this.getMonitoredWallets().filter(wallet => this.isWalletActive(wallet));
    }

    async cleanup() {
        // Remove monitoring for inactive wallets
        for (const wallet of this.monitoredWallets) {
            if (!this.isWalletActive(wallet)) {
                await this.stopMonitoring(wallet);
            }
        }
    }
}

module.exports = TransactionMonitor; 
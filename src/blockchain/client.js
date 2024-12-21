const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const web3_js_1 = require("@solana/web3.js");

class blockchain {
    constructor(TOKEN, BUY_AMOUNT) {
        this.listner = new (require('./sub/listen'))(TOKEN);
        this.decisions = new (require('./sub/decisions'))(this.listner.wallets);
    }

    __init() {
        console.log('Starting...')
    }

    __awaiter (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    sendTx(connection, payer, tx, options) {
        return this.__awaiter(this, void 0, void 0, function* () {
            const txids = [];
            for (const iTx of txs) {
                if (iTx instanceof web3_js_1.VersionedTransaction) {
                    iTx.sign([payer]);
                    txids.push(yield connection.sendTransaction(iTx, options));
                }
                else {
                    txids.push(yield connection.sendTransaction(iTx, [payer], options));
                }
            }
            return txids;
        });
    }

    buildAndSendTx(innerSimpleV0Transaction, options) {
        return this.__awaiter(this, void 0, void 0, function* () {
            const willSendTx = yield (0, raydium_sdk_1.buildSimpleTransaction)({
                connection: config_1.connection,
                makeTxVersion: config_1.makeTxVersion,
                payer: config_1.wallet.publicKey,
                innerTransactions: innerSimpleV0Transaction,
                addLookupTableInfo: config_1.addLookupTableInfo,
            });
            return yield sendTx(config_1.connection, config_1.wallet, willSendTx, options);
        });
    }
}

module.exports = blockchain;
const { TOKEN, BUY_AMOUNT } = require('../config.json');

const blockchain = new (require('./blockchain'))(TOKEN, BUY_AMOUNT);
const listner = blockchain.listner;
const decisions = blockchain.decisions;

blockchain.__init();
listner.__init();
decisions.__init();
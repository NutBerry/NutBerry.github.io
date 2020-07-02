const ERC20_ABI = [
  'symbol() view returns (string)',
  'decimals() view returns (uint8)',
  'allowance(address,address) view returns (uint256)',
  'balanceOf(address) view returns (uint256)',
  'approve(address spender,uint256 value) returns (bool)',
  'transfer(address,uint256) returns (bool)',
];

const BRIDGE_ABI = [
  'function finalizedHeight() view returns (uint256)',
  'function getERC20Exit(address target, address owner) view returns (uint256)',
  'deposit(address,uint256)',
  'withdraw(address,uint256)',
];

// TODO: throwaway, should be dynamically source from bridge events
const TOKENS = {
  // mainnet
  '0': {
  },
  // ropsten
  '3': {
    '0x722dd3f80bac40c951b51bdd28dd19d435762180': 'TST',
  },
};

const UINT_MAX = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

const TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
    ],
    Transaction: [
      { name: 'to', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
  primaryType: 'Transaction',
  domain: {
    name: 'NutBerry',
    version: '2',
  },
};

function encodeTx (tx) {
  function arrayify (val) {
    let v = val;

    if (typeof v === 'number' || typeof v === 'bigint') {
      v = v.toString(16);
      if (v.length % 2) {
        v = `0x0${v}`;
      } else {
        v = `0x${v}`;
      }
    }

    return Array.from(ethers.utils.arrayify(v));
  }

  const nonceBytes = arrayify(tx.nonce);
  const calldataBytes = arrayify(tx.data);
  let enc = arrayify(tx.v)
    .concat(arrayify(tx.r))
    .concat(arrayify(tx.s));

  if (nonceBytes.length > 1 || nonceBytes[0] > 0xde) {
    enc.push(0xff - nonceBytes.length);
    enc = enc.concat(nonceBytes);
  } else {
    enc = enc.concat(nonceBytes);
  }

  enc = enc.concat(arrayify(tx.to));

  if (calldataBytes.length >= 0xff) {
    enc.push(0xff);
    enc.push(calldataBytes.length >> 8);
    enc.push(calldataBytes.length & 0xff);
  } else {
    enc.push(calldataBytes.length);
  }

  return ethers.utils.hexlify(enc.concat(calldataBytes));
}

async function signEncodeTypedDataTransaction (tx, signer) {
  const obj = Object.assign({ message: tx }, TYPED_DATA);
  const sig = await signer.provider.send('eth_signTypedData_v3', [await signer.getAddress(), JSON.stringify(obj)]);
  const { r, s, v } = ethers.utils.splitSignature(sig);
  const raw = encodeTx(Object.assign(tx, { r, s, v: v + 101 }));

  return raw;
}

class BaseFlow {
  constructor (root) {
    this.container = document.createElement('div');
    this.container.className = 'flow';

    this.errorBox = document.createElement('p');
    this.errorBox.className = 'error';
    this.container.appendChild(this.errorBox);

    this.notifyBox = document.createElement('p');
    this.container.appendChild(this.notifyBox);

    this.input = document.createElement('input');
    this.input.disabled = true;
    this.input.addEventListener('keyup', this.onInput.bind(this), false);
    this.input.setAttribute('list', 'tokenlist');
    this.container.appendChild(this.input);

    this.cancelButton = document.createElement('button');
    this.cancelButton.innerText = 'Cancel';
    this.cancelButton.addEventListener('click', this.onDone.bind(this), false);
    this.container.appendChild(this.cancelButton);

    this.confirmButton = document.createElement('button');
    this.confirmButton.style.visibility = 'hidden';
    this.confirmButton.addEventListener('click', this.onConfirm.bind(this), false);
    this.container.appendChild(this.confirmButton);

    this.container.addEventListener('click', this._trap, false);

    const self = this;
    function animate () {
      self.container.style.animation = 'none';
      root.style.animation = 'none';
      root.removeEventListener('animationend', animate, false);
    }
    root.addEventListener('animationend', animate, false);
    root.style.animation = 'blink 1s';
    root.appendChild(this.container);
  }

  _trap (evt) {
    evt.preventDefault();
    evt.stopImmediatePropagation();
  }

  ask (str, placeholder, callback) {
    this._inputCallback = callback;
    this.input.placeholder = placeholder;
    this.input.disabled = false;
    this.input.focus();

    stringDance(this.notifyBox, str);
  }

  onInput (evt) {
    evt.preventDefault();
    evt.stopImmediatePropagation();

    // enter
    if (evt.which === 13) {
      const str = evt.target.value.split(' - ')[0];

      evt.target.blur();
      evt.target.value = '';
      evt.target.placeholder = '';
      evt.target.disabled = true;

      this.handleCallback(this._inputCallback, str);
    }
  }

  confirm (label, str, callback) {
    this._buttonCallback = callback;
    this.confirmButton.innerText = label;
    this.confirmButton.style.visibility = 'visible';
    this.confirmButton.style.animation = 'jumpIn 1s';

    if (str) {
      stringDance(this.notifyBox, str);
    }
  }

  onConfirm (evt) {
    evt.preventDefault();
    evt.stopImmediatePropagation();

    this.confirmButton.style.animation = 'none';
    this.confirmButton.style.visibility = 'hidden';

    this.handleCallback(this._buttonCallback);
  }

  async handleCallback (callback, arg, error) {
    if (this._destroyed) {
      return;
    }

    if (!error) {
      this.errorBox.innerText = '';
    }

    const oldCallback = this.prev;
    const oldArg = this.prevArg;

    try {
      this.prev = callback;
      this.prevArg = arg;
      await callback.call(this, arg);
    } catch (e) {
      console.log(e);
      this.prev = oldCallback;
      this.prevArg = oldArg;
      this.writeError(e.message);

      this.handleCallback(this.prev, this.prevArg, e);
    }
  }

  async runNext (callback, arg) {
    this.prev = callback;
    this.prevArg = arg;

    await this.handleCallback(callback, arg);
  }

  writeError (str) {
    stringDance(this.errorBox, str);
  }

  write (str) {
    stringDance(this.notifyBox, str);
  }

  onDone () {
    this._destroyed = true;

    const root = this.container.parentElement;
    const container = this.container;

    function animate () {
      root.style.animation = 'none';
      container.removeEventListener('animationend', animate, false);
      container.remove();
      root.style.animation = 'jumpIn 1s';
    }

    container.addEventListener('animationend', animate, false);
    container.style.animation = 'jumpIn 1s reverse';
    root.style.animation = 'blink 1s reverse';
  }

  async setupWallet () {
    this.confirm('Connect', 'Please Connect your Wallet.', this.onSetupWallet);
  }

  async onSetupWallet () {
    if (!window.ethereum) {
      throw new Error('No Ethereum Provider found.');
    }

    await window.ethereum.enable();

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();

    if (network.chainId !== ROOT_CHAIN_ID) {
      throw new Error(`Wrong Network. Please switch to ${ROOT_NETWORK}.`);
    }

    this.signer = await provider.getSigner();

    this.runNext(this.setupToken);
  }
}

class DepositFlow extends BaseFlow {
  constructor (root) {
    super(root);

    this.runNext(this.setupWallet);
  }

  setupToken () {
    this.ask(
      'Which token do you want to deposit?',
      'Token Address',
      this.onSetupToken
    );
  }

  async onSetupToken (addr) {
    this._erc20 = new ethers.Contract(addr, ERC20_ABI, rootProvider);
    this._tokenSymbol = await this._erc20.symbol();

    this.ask(
      `How much ${this._tokenSymbol} do you want to deposit?`,
      'Deposit amount',
      this.confirmDeposit
    );
  }

  confirmDeposit (str) {
    const number = parseFloat(str);
    if (!number || number <= 0) {
      throw new Error('Invalid Amount.');
    }

    this._amount = str;
    this.confirm(
      'Confirm',
      `Tap 'Confirm' to deposit ${this._amount} ${this._tokenSymbol}.`,
      this.onConfirmDeposit
    );
  }

  async onConfirmDeposit () {
    const decimals = await this._erc20.decimals();
    const amount = ethers.utils.parseUnits(this._amount, decimals);

    this.runNext(this.deposit, amount);
  }

  async deposit (val) {
    const allowance = await this._erc20.allowance(await this.signer.getAddress(), bridgeContract.address);
    const erc20 = this._erc20.connect(this.signer);

    if (allowance.lt(val)) {
      this.write('Allowance too low.\nPlease sign the transaction to increase the token allowance first.');
      let tx = await erc20.approve(bridgeContract.address, UINT_MAX);
      this.write(`Transaction: ${tx.hash}`);
      await tx.wait();
    }

    this.write('Waiting for wallet...');

    let tx = await bridgeContract.connect(this.signer).deposit(erc20.address, val);
    this.confirm(
      'Done',
      `Deposit transaction hash: ${tx.hash}`,
      this.onDone
    );
  }
}

class WithdrawFlow extends BaseFlow {
  constructor (root) {
    super(root);

    this.runNext(this.setupWallet);
  }

  setupToken () {
    this.ask(
      'Which token do you want to withdraw?',
      'Token Address',
      this.onSetupToken
    );
  }

  async onSetupToken (addr) {
    const erc20 = new ethers.Contract(addr, ERC20_ABI, rootProvider);
    const tokenSymbol = await erc20.symbol();
    const decimals = await erc20.decimals();
    const availableForExit = await bridgeContract.getERC20Exit(addr, await this.signer.getAddress());
    const units = ethers.utils.formatUnits(availableForExit, decimals);

    this.write(`${units} ${tokenSymbol} available for Exit.`);

    if (availableForExit.gt(0)) {
      this.erc20 = erc20;
      this.availableForExit = availableForExit;
      this.confirm(
        'Withdraw',
        '',
        this.withdraw,
      );
    }
  }

  async withdraw () {
    this.write('Waiting for Wallet...');
    const tx = await bridgeContract.connect(this.signer).withdraw(this.erc20.address, 0);
    this.confirm(
      'Done',
      `Transaction hash: ${tx.hash}`,
      this.onDone
    );
  }
}

class MintERC20Flow extends BaseFlow {
  constructor (root) {
    super(root);

    this.runNext(this.setupWallet);
  }

  setupToken () {
    this.confirm('Continue', 'Tap \'Continue\' to mint 100 TST - ERC-20 Test Standard Token.', this.mint);
  }

  async mint () {
    const addr = [
      // mainnet
      '0x3efd578b271d034a69499e4a2d933c631d44b9ad',
      '',
      '',
      // ropsten
      '0x722dd3f80bac40c951b51bdd28dd19d435762180'
    ][ROOT_CHAIN_ID];
    const erc20 = new ethers.Contract(addr, ['showMeTheMoney(address, uint256)'], rootProvider);

    this.write('Waiting for Wallet...');
    const tx = await erc20.connect(this.signer).showMeTheMoney(
      await this.signer.getAddress(),
      '100000000000000000000',
    );
    this.confirm(
      'Done',
      `Transaction hash: ${tx.hash}\nERC-20 address: ${addr}`,
      this.onDone
    );
  }
}

class ExitTransferFlow extends BaseFlow {
  constructor (root) {
    super(root);

    this.runNext(this.setupWallet);
  }

  setupToken () {
    this.ask(
      'Which token do you want to withdraw?',
      'Token Address',
      this.onSetupToken
    );
  }

  async onSetupToken (addr) {
    const erc20 = new ethers.Contract(addr, ERC20_ABI, window.childProvider);
    const balance = await erc20.balanceOf(await this.signer.getAddress());
    const erc20Root = new ethers.Contract(addr, ERC20_ABI, window.rootProvider);

    this.tokenSymbol = await erc20Root.symbol();
    this.decimals = await erc20Root.decimals();

    if (balance.gt(0)) {
      this.erc20 = erc20;
      this.balance = balance;

      const units = ethers.utils.formatUnits(balance, this.decimals);
      this.ask(
        `How much do you want to exit?\nYou have ${units} ${this.tokenSymbol} available.`,
        'Amount',
        this.setupAmount
      );
    }
  }

  async setupAmount (amt) {
    this.exitAmount = ethers.utils.parseUnits(amt, this.decimals);

    this.write(`Exit ${amt} ${this.tokenSymbol}?`);
    this.confirm(
      'Yes, exit',
      '',
      this.exit,
    );
  }

  async exit () {
    this.write('Waiting for Wallet...');

    // a transfer to 0x00... exits/burns the token(s).
    // They become available to withdraw once the transaction is finalised.
    const tx = {
      to: this.erc20.address,
      data: this.erc20.interface.functions.transfer.encode(['0x0000000000000000000000000000000000000000', this.exitAmount]),
      nonce: await window.childProvider.getTransactionCount(await this.signer.getAddress(), 'pending'),
    };
    const rawTx = await signEncodeTypedDataTransaction(tx, this.signer);
    const txHash = await childProvider.send('eth_sendRawTransaction', [rawTx]);

    this.confirm(
      'Done',
      `Transaction hash: ${txHash}`,
      this.onDone
    );
  }
}

function runFlow (flow, evt) {
  if (evt.target.querySelector('.flow')) {
    return;
  }

  new flow(evt.target);
}

window.addEventListener('DOMContentLoaded',
  async function () {
    window.rootProvider = ethers.getDefaultProvider(ROOT_NETWORK);
    window.bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, rootProvider);
    if (window.RPC_URL) {
      window.childProvider = new ethers.providers.JsonRpcProvider(window.RPC_URL);
    }

    const datalist = document.createElement('datalist');
    // TODO: dynamically source tokens from bridge events
    const tokens = TOKENS[ROOT_CHAIN_ID] || [];
    for (const addr in tokens) {
      const opt = document.createElement('option');
      const sym = tokens[addr];
      opt.value = `${addr} - ${sym}`;
      datalist.appendChild(opt);
    }

    datalist.id = 'tokenlist';
    document.body.appendChild(datalist);

    const finalizedHeight = await bridgeContract.finalizedHeight();
    stringDance(
      document.querySelector('.status'),
      `Bridge: ${bridgeContract.address}\nFinalized Height: ${finalizedHeight}`
    );
  },
  false
);

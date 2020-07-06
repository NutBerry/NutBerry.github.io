const ERC20_ABI = [
  'symbol() view returns (string)',
  'decimals() view returns (uint8)',
  'allowance(address,address) view returns (uint256)',
  'balanceOf(address) view returns (uint256)',
  'approve(address spender,uint256 value) returns (bool)',
  'transfer(address,uint256) returns (bool)',
];

const BRIDGE_ABI = [
  'finalizedHeight() view returns (uint256)',
  'getERC20Exit(address target, address owner) view returns (uint256)',
  'getERC721Exit(address target, uint256 tokenId) view returns (address owner)',
  'deposit(address token, uint256 amountOrId)',
  'withdraw(address token, uint256 amountOrIdd)',
];

// EIP-712 structured data and signing.
// Though, RLP encoded transactions are also supported
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
  const sig = await signer.provider.send('eth_signTypedData_v3', [await ctx.signer.getAddress(), JSON.stringify(obj)]);
  const { r, s, v } = ethers.utils.splitSignature(sig);
  // We add 101 to `v` for EIP-712 transactions.
  const raw = encodeTx(Object.assign(tx, { r, s, v: v + 101 }));

  return raw;
}

// NutBerry @ ropsten
const BRIDGE_ADDRESS = '0xa9f96d8761aa05430d3ee2e7dff6b04978f13369';
// The L2 node
const RPC_URL = `https://${BRIDGE_ADDRESS}.fly.dev`;
// TST @ ropsten
const TOKEN_ADDRESS = '0x722dd3f80bac40c951b51bdd28dd19d435762180';
const ctx = Object.create(null);

async function setup() {
  await window.ethereum.enable();

  ctx.rootProvider = new ethers.providers.Web3Provider(window.ethereum);
  ctx.signer = await ctx.rootProvider.getSigner();
  ctx.bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, ctx.signer);
  ctx.childProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
  ctx.erc20 = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, ctx.signer);
  ctx.erc20Child = ctx.erc20.connect(ctx.childProvider);

  log({ signer: await ctx.signer.getAddress() });
}

async function deposit () {
  const amount = '0xff';
  const allowance = await ctx.erc20.allowance(await ctx.signer.getAddress(), ctx.bridgeContract.address);
  log({ allowance });

  let tx, receipt;

  if (allowance.lt(amount)) {
    tx = await ctx.erc20.approve(BRIDGE_ADDRESS, amount);
    log({ tx });
    receipt = await tx.wait();
    log({ receipt });
  }

  tx = await ctx.bridgeContract.deposit(ctx.erc20.address, amount);
  log({ tx });
  receipt = await tx.wait();
  log({ receipt });
}

async function withdraw () {
  const decimals = await ctx.erc20.decimals();
  const availableForExit = await ctx.bridgeContract.getERC20Exit(ctx.erc20.address, await ctx.signer.getAddress());
  const units = ethers.utils.formatUnits(availableForExit, decimals);
  log({ availableForExit });

  // unused for ERC-20
  const nftId = 0;
  const tx = await ctx.bridgeContract.withdraw(ctx.erc20.address, nftId);
  log({ tx });
  const receipt = await tx.wait();
  log({ receipt });
}

async function exit () {
  // a transfer to 0x00... exits/burns the token(s).
  // They become available to withdraw once the block of the transaction is finalised.
  const myself = await ctx.signer.getAddress();
  const exitAmount = await ctx.erc20Child.balanceOf(myself);
  log({ exitAmount });

  const tx = {
    to: ctx.erc20.address,
    data: ctx.erc20.interface.functions.transfer.encode(['0x0000000000000000000000000000000000000000', exitAmount]),
    nonce: await ctx.childProvider.getTransactionCount(myself, 'pending'),
  };

  const rawTx = await signEncodeTypedDataTransaction(tx, ctx.signer);
  const txHash = await ctx.childProvider.send('eth_sendRawTransaction', [rawTx]);
  log({ txHash });
  const receipt = await ctx.childProvider.getTransactionReceipt(txHash);
  log({ receipt });

  const myBalance = await ctx.erc20Child.balanceOf(myself);
  log({ myBalance });
}

async function faucet () {
  const faucet = new ethers.Contract(
    // Faucet contract on ropsten
    '0x0ab5ca008a524fa5160ddb0323f8632ec357a0db',
    [
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      // get some tokens
      'function drain()',
      // register a token
      'function sink(address)',
    ],
    ctx.childProvider
  );
  const myself = await ctx.signer.getAddress();

  // this gets us one (10 ** 18) token for every registered ERC20 (if the faucet has enough balance)
  const tx = {
    to: faucet.address,
    data: faucet.interface.functions.drain.encode([]),
    nonce: await ctx.childProvider.getTransactionCount(myself, 'pending'),
  };
  const rawTx = await signEncodeTypedDataTransaction(tx, ctx.signer);
  const txHash = await ctx.childProvider.send('eth_sendRawTransaction', [rawTx]);
  const receipt = await ctx.childProvider.getTransactionReceipt(txHash);
  log({ receipt });

  for (const obj of receipt.logs) {
    log({ evt: faucet.interface.parseLog(obj) });
  }

  const myBalance = await ctx.erc20Child.balanceOf(myself);
  log({ myBalance });
}

const container = document.querySelector('.container');

for (const v of [setup, deposit, exit, withdraw, faucet]) {
  const btn = document.createElement('button');
  btn.innerText = v.toString().split('{')[0];
  btn.onclick = v;
  container.appendChild(btn);
}

const pre = document.createElement('pre');
container.appendChild(pre);
async function log (...args) {
  pre.innerText += (new Date()).toLocaleString() + JSON.stringify(...args, null, 2) + '\n';
}

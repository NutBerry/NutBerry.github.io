const BRIDGE_ABI = [
  'function finalizedHeight() view returns (uint256)',
  'function getERC20Exit(address target, address owner) view returns (uint256)',
  'deposit(address,uint256)',
  'withdraw(address,uint256)',
];

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

function formatString (val) {
  const str = val === undefined ? 'undefined' : val.toString();
  const child = document.createElement('span');
  child.innerText = str;

  if (str.length > 512) {
    child.className = 'collapsed';
    child.addEventListener(
      'click',
      function () {
        if (this.className === 'collapsed') {
          this.className = 'expanded';
        } else {
          this.className = 'collapsed';
        }
      },
      false
    );
  }

  return child;
}

class BlockExplorer {
  constructor (root) {
    this.root = root;
    this.high = 0;
    this.low = 0;

    this.pendingContainer = root.querySelector('.pending');
    this.proposedContainer = root.querySelector('.proposed');
  }

  renderBlock (block) {
    const blockNode = document.createElement('a');
    blockNode.className = 'block';
    const ts = (new Date(block.timestamp * 1000)).toLocaleString();
    blockNode.appendChild(
      formatObject(
        {
          Number: block.number,
          Hash: block.hash,
          Timestamp: ts,
          Transactions: block.transactions.length
        }
      )
    );
    blockNode.href = `transaction.html#${block.hash}`;

    if (block.hash === ZERO_HASH) {
      if (this.pendingContainer.firstElementChild) {
        this.pendingContainer.firstElementChild.remove();
      }
      this.pendingContainer.appendChild(blockNode);
    } else {
      if (block.number === this.low) {
        this.proposedContainer.appendChild(blockNode);
      } else {
        this.proposedContainer.insertBefore(blockNode, this.proposedContainer.firstElementChild);
      }
    }
  }

  async _eventLoop () {
    {
      const latestBlock = await window.childProvider.getBlock();
      if (latestBlock.number !== this.high || latestBlock.hash === ZERO_HASH) {
        this.renderBlock(latestBlock);

        if (this.high !== 0) {
          for (let i = latestBlock.number - 1; i >= this.high; i--) {
            const block = await window.childProvider.getBlock(i);
            this.renderBlock(block);
          }
        }
        this.high = latestBlock.number;
      }
      if (this.low === 0) {
        this.low = this.high;
      }
    }

    setTimeout(this._eventLoop.bind(this), 1000);
  }

  async _animationLoop () {
    const fetchMore = (document.body.scrollHeight - window.scrollY) < (window.screen.height * 2);

    if (fetchMore && this.low > 1) {
      const block = await window.childProvider.getBlock(this.low - 1);
      this.low = block.number;
      this.renderBlock(block);
    }

    window.requestAnimationFrame(this._animationLoop.bind(this));
  }

  async watch () {
    this._eventLoop();
    this._animationLoop();
  }
}

function formatObject (obj) {
  const child = document.createElement('div');

  for (const key in obj) {
    const value = obj[key];

    const heading = document.createElement('p');
    heading.className = 'sub';
    heading.appendChild(formatString(key));

    const p = document.createElement('p');
    p.appendChild(formatString(typeof value === 'string' ? value : JSON.stringify(value, null, 2)));

    child.appendChild(heading);
    child.appendChild(p);
  }

  return child;
}

function renderTransaction (container, tx, receipt, details) {
  const child = document.createElement('div');
  const p = document.createElement('p');

  p.appendChild(
    formatObject(
      {
        Index: tx.transactionIndex,
        From: tx.from,
        To: tx.to,
        Nonce: tx.nonce,
        Status: `${receipt.status} (${receipt.status === 1 ? 'ok' : 'revert/invalid'})`,
        Data: tx.data,
        Errno: details.errno,
        ReturnData: details.returnData,
      }
    )
  );

  const heading = document.createElement('p');
  heading.className = 'heading';
  heading.appendChild(formatString(`${tx.hash}`));
  child.appendChild(heading);
  child.appendChild(p);

  const logs = document.createElement('div');
  logs.className = 'logs';
  let i = 0;
  for (const log of receipt.logs) {
    const logElement = document.createElement('p');
    const { address, topics, data } = log;

    logElement.appendChild(formatObject({ address, topics, data }));

    const heading = document.createElement('p');
    heading.className = 'heading mt1';
    heading.appendChild(formatString(`Log(${i})`));

    logs.appendChild(heading);
    logs.appendChild(logElement);
    i++;
  }

  child.appendChild(logs);
  child.className = 'transaction';
  container.appendChild(child);
}

async function aniframe (callback) {
  const fetchMore = (document.body.scrollHeight - window.scrollY) < (window.screen.height * 2);

  if (fetchMore) {
    if (!(await callback())) {
      return;
    }
  }

  window.requestAnimationFrame(aniframe.bind(this, callback));
}

window.addEventListener('DOMContentLoaded',
  async function () {
    window.rootProvider = ethers.getDefaultProvider(window.ROOT_NETWORK);
    window.childProvider = new ethers.providers.JsonRpcProvider(window.RPC_URL);
    window.bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, rootProvider);

    const config = document.createElement('p');
    config.innerText = `root: ${window.ROOT_NETWORK} | rpc: ${window.RPC_URL}`;
    document.querySelector('footer')
      .appendChild(config);

    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('0x')) {
      const status = document.querySelector('.status');
      const container = document.querySelector('.transactions');
      const block = await window.childProvider.getBlock(hash);

      status.appendChild(formatString(`Transactions(${block.transactions.length}) in Block(${block.number})`));

      async function callback () {
        const txHash = block.transactions.shift();

        if (!txHash) {
          return false;
        }

        const tx = await window.childProvider.getTransaction(txHash);
        const receipt = await window.childProvider.getTransactionReceipt(txHash);
        const details = await window.childProvider.send('eth_getTransactionDetails', [txHash])
        renderTransaction(container, tx, receipt, details);

        return true;
      }

      const btn = document.createElement('button');
      btn.addEventListener('click', async function () {
        this.disabled = true;
        while (await callback()) {
          // loop until everything is loaded
        }
      }, false);
      btn.innerText = 'Load All';
      container.appendChild(btn);

      aniframe(callback);

      return;
    }

    {
      const blockExplorer = new BlockExplorer(document.querySelector('.explorer'));
      await blockExplorer.watch();

      const finalizedHeight = await bridgeContract.finalizedHeight();
      stringDance(
        document.querySelector('.status'),
        `Bridge: ${bridgeContract.address}\nFinalized Height: ${finalizedHeight}`
      );
    }
  },
  false
);

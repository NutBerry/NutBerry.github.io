const BRIDGE_ABI = [
  'function finalizedHeight() view returns (uint256)',
  'function getERC20Exit(address target, address owner) view returns (uint256)',
  'deposit(address,uint256)',
  'withdraw(address,uint256)',
];

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

function formatString (val, expandable) {
  const str = val === undefined ? 'undefined' : val.toString();
  const child = document.createElement('p');
  child.innerText = str;

  if (expandable) {
    child.className = 'collapsed';
    child.addEventListener(
      'click',
      function (evt) {
        if (evt.target !== child) {
          return;
        }

        if (this.className.indexOf('collapsed') !== -1) {
          this.className = this.className.replace('collapsed', 'expanded');
        } else {
          this.className = this.className.replace('expanded', 'collapsed');
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
        },
        `block.html#${block.hash}`
      )
    );

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

function formatObject (obj, href) {
  const child = document.createElement('div');

  for (const key in obj) {
    const value = obj[key];
    const heading = document.createElement('kv');

    heading.className = 'sub';
    heading.appendChild(formatString(key + ': ', false));
    const v = formatString(typeof value === 'string' ? value : JSON.stringify(value, null, 2), false);

    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.appendChild(v);
      heading.appendChild(link);
    } else {
      heading.appendChild(v);
    }

    child.appendChild(heading);
  }

  return child;
}

async function explorerSearch (evt) {
  evt.stopImmediatePropagation();

  // enter
  if (evt.which === 13) {
    const hashOrNumber = evt.target.value;
    const isHash = hashOrNumber.startsWith('0x') && hashOrNumber.length === 66;

    if (isHash) {
      try {
        const tx = await window.childProvider.getTransaction(hashOrNumber);
        const receipt = await window.childProvider.getTransactionReceipt(hashOrNumber);
        const details = await window.childProvider.send('eth_getTransactionDetails', [hashOrNumber])
        const results = evt.target.parentElement.querySelector('.results');

        results.innerHTML = '';
        renderTransaction(results, tx, receipt, details);
        return;
      } catch (e) {
        console.log(e);
      }
    }

    try {
      const block = await window.childProvider.getBlock(isHash ? hashOrNumber : Number(hashOrNumber));
      window.location.href = `block.html#${block.hash}`;
      return;
    } catch (e) {
      console.log(e);
    }

    // no match - shake
    evt.target.style.animation = 'shake .5s ease-in';
    evt.target.onanimationend = () => { evt.target.style.animation = 'none'; }
  }
}

function renderTransaction (container, tx, receipt, details) {
  const child = document.createElement('a');

  child.appendChild(
    formatObject(
      {
        Index: tx.transactionIndex,
        Status: `${receipt.status} (${receipt.status === 1 ? 'ok' : 'revert/invalid'})`,
        Hash: tx.hash,
        From: tx.from,
        To: tx.to,
      }
    )
  );

  const more = document.createElement('kv');
  const expandable = formatString('...', true);
  more.appendChild(expandable);
  expandable.appendChild(
    formatObject(
      {
        Nonce: tx.nonce,
        Errno: details.errno,
        ReturnData: details.returnData,
        Data: tx.data,
      }
    )
  );
  child.appendChild(expandable);

  if (receipt.logs.length > 0) {
    const logsHeading = document.createElement('p');
    logsHeading.className = 'heading';
    logsHeading.appendChild(formatString('Transaction Logs'));
    expandable.appendChild(logsHeading);

    let i = 0;
    for (const log of receipt.logs) {
      const { address, topics, data } = log;
      const logElement = formatObject({ logIndex: i, address, topics, data });

      expandable.appendChild(logElement);
      i++;
    }
  }

  child.className = 'block';
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
      document.querySelector('.explorer').insertBefore(btn, container);

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

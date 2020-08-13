/*
# resources
https://github.com/ethereum/go-ethereum/blob/master/params/protocol_params.go
https://github.com/ethereum/go-ethereum/blob/master/core/vm/gas_table.go
*/

function calc ({ gwei, blockGasLimit, blockTime, txSize, ethUsd, additionalGasPerBlock }) {
  const gasPrice = gwei * (10 ** 9);
  const gasPerByte = 16;

  function calculateGas (bytes) {
    const words = Math.ceil(bytes / 32);
    return (
      additionalGasPerBlock +
      // safety pad
      42_000 +
      // calldata costs
      (gasPerByte * bytes)
      // calldatacopy costs
      + (words * 3)
      // hashing per byte
      + (words * 6)
      // memory expansion costs
      + ((words * 3) + (words * words) / 512)
    );
  }

  let blockSizeLimit = blockGasLimit / gasPerByte;

  while (calculateGas(blockSizeLimit) > blockGasLimit) {
    blockSizeLimit--;
  }

  let ret = [
    `L2 block size`,
    `L1 gas per L2 block`,
    `cost per L2 block`,
    `cost transaction per L2-block`,
    `L2 blocks per L1 block each ${blockTime} seconds`,
    `Effective L1 data availability per L1-block`,
    `Effective L1 data availability per second`,
    `cumulative tps (tx size: ${txSize} bytes)`,
    `cumulative gas`,
    `cumulative costs`,
    `cumulative costs per tx`,
  ];

  for (let bytes = 2 << 10; bytes <= blockSizeLimit; bytes += 2 << 10) {
    const kbytes = bytes / (1 << 10);
    const gas = calculateGas(bytes);
    const cost = ((gas * gasPrice)  / (10 ** 18)).toFixed(5);
    const blocks = (blockGasLimit / gas);
    const fullBlocks = ~~blocks;
    const leftOver = blocks - fullBlocks;
    const txsPerBlock = ~~(bytes / txSize);
    let usedBytes = bytes * fullBlocks;
    let tps = ((txsPerBlock * fullBlocks) / blockTime);
    let cumulativeGas = gas * fullBlocks;

    if (leftOver) {
      const remainingGas = blockGasLimit - (gas * fullBlocks);
      let remainingBytes = bytes;
      let leftOverGas = calculateGas(remainingBytes);
      while (leftOverGas > remainingGas) {
        remainingBytes--;
        leftOverGas = calculateGas(remainingBytes);
      }

      if (remainingBytes >= txSize) {
        tps += (remainingBytes / txSize) / blockTime;
        usedBytes += remainingBytes;
        cumulativeGas += leftOverGas;
      }
    }

    const dataAvailabilityL1 = usedBytes / (1 << 10);
    const kBytesPerSecond = dataAvailabilityL1 / blockTime;
    const cumulativeEther = ((cumulativeGas * gasPrice) / (10 ** 18));
    const cumulativeUsd = ethUsd * cumulativeEther;

    ret = ret.concat(
      [
      `${kbytes} KiB<br>(${txsPerBlock} txs/L2-block)`,
      `${gas.toLocaleString()}`,
      `${cost} \u039e<br>$ ${(ethUsd * cost).toFixed(2)}`,
      `$ ${((ethUsd * cost) / txsPerBlock).toFixed(4)}`,
      `${blocks.toFixed(2)}`,
      `${dataAvailabilityL1.toFixed(4)} KiB`,
      `${kBytesPerSecond.toFixed(4)} KiB`,
      `${tps.toFixed(0)} tps`,
      `${cumulativeGas.toLocaleString()}`,
      `${cumulativeEther.toFixed(5)} \u039e<br>$ ${cumulativeUsd.toFixed(2)}`,
      `${(cumulativeUsd / usedBytes).toFixed(6)} $`,
      ]
    );
  }

  return ret;
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded',
    function () {
      const rows = 11;
      const grid = document.createElement('div');
      grid.style['display'] = 'grid';
      grid.style['grid-template-columns'] = `repeat(${rows}, 1fr)`;

      function render (res) {
        grid.innerHTML = '';
        let str = '';
        let colors = ['#fefefe', '#f0d0c0'];
        for (let i = 0; i < res.length; i++) {
          if (i % rows === 0) {
            colors.reverse();
          }
          const v = res[i];
          str += `<div style='background: ${colors[0]}; border: 1px solid; padding: 3px;'>${v}</div>`
        }
        grid.innerHTML = str;
      }

      const config = {
        gwei: 10,
        txSize: 130,
        blockGasLimit: 11_500_000,
        blockTime: 15,
        ethUsd: 200,
        additionalGasPerBlock: 0,
      };

      for (const key in config) {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = config[key];
        input.onkeyup = function () {
          config[key] = parseInt(input.value);
          render(calc(config));
        };
        const label = document.createElement('span');
        label.innerText = key;
        label.appendChild(input);
        document.body.appendChild(label);
      }

      document.body.appendChild(grid);
      render(calc(config));
    },
    false
  );
}

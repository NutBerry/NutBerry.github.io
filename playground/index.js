window.addEventListener('DOMContentLoaded',
  async function () {
    const config = document.createElement('p');
    config.innerText = `root: ${window.ROOT_NETWORK}\nrpc: ${window.RPC_URL}`;
    document.querySelector('.status').parentElement.appendChild(config);
  },
  false
);

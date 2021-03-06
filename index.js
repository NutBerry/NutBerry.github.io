function stringDance (ele, str, _childs, idx, _skip) {
  if (_skip) {
    window.requestAnimationFrame(
      function ()  {
        stringDance(ele, str, _childs, idx, !_skip);
      }
    );
    return;
  }

  const len = str.length;

  if (!_childs) {
    ele.innerText = '';
    for (let i = 0; i < len; i++) {
      let c = document.createElement('span');
      let val = str[i];
      let x = '#';
      if (val === '.' || val === ' ' || val === '\n') {
        x = val;
      }
      c.innerText = x;
      ele.appendChild(c);
    }
    _childs = ele.children;
    idx = 0;
  }

  if (idx < len) {
    _childs[idx].innerText = str[idx];
    idx++;
  }

  const done = idx === len;
  if (!done) {
      window.requestAnimationFrame(
      function ()  {
        stringDance(ele, str, _childs, idx, !_skip);
      }
    );
  }
}

window.addEventListener('DOMContentLoaded',
  function () {
    const canvas = document.querySelector('canvas.dynamicBerry');

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');

    function draw () {
      canvas.width = document.body.offsetWidth;
      canvas.height = document.body.offsetHeight;
      canvas.style.animation = 'opacity 1s ease-out';

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fafafa';

      const elements = document.querySelectorAll('.berry');
      const len = elements.length;

      if (!len) {
        return;
      }

      let lastX = elements[0].offsetLeft + 43;

      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#7e4d70';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(lastX, elements[0].offsetTop + 43);
      for (let i = 1; i < len; i++) {
        const e = elements[i];
        const x = e.offsetLeft + 43;
        const y = e.offsetTop + 43;

        if (x < lastX) {
          ctx.quadraticCurveTo(x, y - 60, x, y);
        } else {
          ctx.quadraticCurveTo(x, y + 60, x, y);
        }

        lastX = x;
      }
      ctx.stroke();
      ctx.closePath();

      ctx.lineWidth = 2;
      for (let i = 0; i < len; i++) {
        const e = elements[i];
        const x = e.offsetLeft + 43;
        const y = e.offsetTop + 43;

        ctx.beginPath();
        ctx.arc(x, y, 43, 0, Math.PI * 2);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }
    }

    canvas.style['z-index'] = '-1';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.right = '0';

    document.body.style['background-color'] = 'transparent';

    window.addEventListener('resize', draw, false);
    window.addEventListener('animationend', draw, false);
  },
  false
);

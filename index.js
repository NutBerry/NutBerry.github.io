window.addEventListener('DOMContentLoaded',
  function () {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    function draw() {
      canvas.width = document.body.offsetWidth;
      canvas.height = document.body.offsetHeight;
      canvas.style.animation = 'opacity 1s ease-out';

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fafafa';

      var elements = document.querySelectorAll('.berry');
      var len = elements.length;
      var lastX = elements[0].offsetLeft + 43;

      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#7e4d70';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(lastX, elements[0].offsetTop + 43);
      for (var i = 1; i < len; i++) {
        var e = elements[i];
        var x = e.offsetLeft + 43;
        var y = e.offsetTop + 43;

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
      for (var i = 0; i < len; i++) {
        var e = elements[i];
        var x = e.offsetLeft + 43;
        var y = e.offsetTop + 43;

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
    document.body.appendChild(canvas);

    window.addEventListener('resize', draw, false);
    window.addEventListener('animationend', draw, false);
  },
  false
);

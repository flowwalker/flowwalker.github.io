(function() {
  const canvasId = 'falling-petals-canvas';
  
  function init() {
    if (document.getElementById(canvasId)) return;

    const canvas = document.createElement('canvas');
    canvas.id = canvasId;
    Object.assign(canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1', 
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width, height;
    
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // 粒子数量
    const particleCount = 150;
    const particles = [];
    // 春日清新嫩绿色系
    const colors = [
      '#98FB98', '#90EE90', '#00FF7F', 
      '#ADFF2F', '#7CCD7C', '#9ACD32',
      '#D2F8E0', '#8FBC8F'
    ];

    // 创建春日粒子
    function createParticle() {
      return {
        x: Math.random() * width,
        y: Math.random() * height + height, 
        speedX: Math.random() * 0.5 - 0.1,
        // 轻柔上升速度
        speedY: -(Math.random() * 0.6 + 0.9), 
        // 适中大小，清晰不突兀
        size: Math.random() * 2.5 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        // 修复：透明度调高，清晰可见但不刺眼
        opacity: Math.random() * 0.3 + 0.7,
        angle: Math.random() * Math.PI * 2,
      };
    }

    for (let i = 0; i < particleCount; i++) {
        const p = createParticle();
        p.y = Math.random() * height; 
        particles.push(p);
    }

    function animate() {
      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
      
      ctx.clearRect(0, 0, width, height);

      // ✅ 核心新增：全屏朦胧嫩绿色柔光笼罩（超柔和，不遮挡界面）
      if (!isDarkMode) {
        ctx.fillStyle = 'rgba(144, 238, 144, 0.02)';
        ctx.fillRect(0, 0, width, height);
      }

      if (!isDarkMode) {
        particles.forEach((p, index) => {
          // 自然上升
          p.y += p.speedY;
          // 温柔左右摇摆 + 微微向右飘（自然不生硬）
          p.x += Math.sin(p.angle) * 0.4 + 0.05;
          p.angle += 0.02;

          // 边界重置
          if (p.y < -15) {
            particles[index] = createParticle();
            particles[index].y = height + 10;
          }
          if (p.x > width + 15) p.x = -15;
          if (p.x < -15) p.x = width + 15;

          // 绘制粒子
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 1.3, p.angle, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      requestAnimationFrame(animate);
    }
    
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
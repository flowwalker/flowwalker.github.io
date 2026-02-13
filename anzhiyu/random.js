var posts=["2026/02/12/Amazons/","2026/02/07/Changanke/","2026/02/10/GitHub/","2026/02/12/once_ideal/","2026/02/12/shortcuts/","2026/02/13/Lag/","2026/02/11/hello-world/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };
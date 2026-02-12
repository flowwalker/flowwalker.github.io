var posts=["2026/02/12/Amazons/","2026/02/10/GitHub/","2026/02/11/hello-world/","2026/02/12/shortcuts/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };
module.exports = {
  apps : [{
    name   : "lidar-visualization",
    script : "npm",
    args   : "run dev",
    interpreter: "none",
    watch  : true,
    ignore_watch : ["node_modules", "dist", ".git", "public"],
    env: {
      NODE_ENV: "development"
    }
  }]
}

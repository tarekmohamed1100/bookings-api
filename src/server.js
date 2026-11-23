const config = require("./config");
const { createApp } = require("./app");
const { createMemoryStore } = require("./store/memory");
const { createPgStore } = require("./store/postgres");

async function main() {
  const store = config.databaseUrl ? createPgStore(config.databaseUrl) : createMemoryStore();
  if (store.init) await store.init();

  const app = createApp({ store, config });
  const server = app.listen(config.port, () => {
    console.log(JSON.stringify({
      level: "info",
      message: `listening on ${config.port}`,
      store: config.databaseUrl ? "postgres" : "memory",
    }));
  });

  const shutdown = () => {
    server.close(async () => {
      if (store.close) await store.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

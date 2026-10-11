import { App } from "./ui/App.js";
import { loadDosFont } from "./game/DosFont.js";

const app = new App();
void loadDosFont().then(() => app.start()).catch((error: unknown) => {
  console.error(error);
  const status = document.getElementById("status");
  if (status) status.textContent = error instanceof Error ? error.message : String(error);
});

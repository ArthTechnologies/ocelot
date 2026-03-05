import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { PageServerLoad } from "./$types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const load: PageServerLoad = async () => {
  try {
    const credPath = resolve(__dirname, "../../../dev-credentials.json");
    const creds = JSON.parse(readFileSync(credPath, "utf-8"));
    return { creds };
  } catch (err) {
    console.error("Failed to load dev-credentials:", err);
    return { creds: null };
  }
};

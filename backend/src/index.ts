import "dotenv/config";
import "./httpServer.js";
import "./socketServer.js";
import "./kcAdminClient.js";

import { connect } from "mongoose";

import { cleanUpData, importInitialData } from "./importDb.js";

cleanUpData();
importInitialData().then((res) => console.log(res));

try {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  await connect(`${uri}/chats`);
  console.log("Chat database started");
} catch (err) {
  console.error(err);
}

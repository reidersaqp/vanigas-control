import { Client, Databases, Permission, Role } from "appwrite";

const client = new Client()
  .setEndpoint("https://nyc.cloud.appwrite.io/v1")
  .setProject("6a61770b001945ec364c");

client.setKey("standard_515cf10e1c889511a335af62d0df8f613e8d9c25b566dd17e566316472f9f21ea5afd5cb1e2d77ea6505ec08b30e86103b58784d933918a5e2c4be63dde76939b7ce74c9d812abf58c1774263c16a57068cf7218cf804307b35335a97c193dc6cf997543fc8e0d7a267c236008dc3eb055f46f1bfd64ed0a4aa380b4223d8d05");

const db = new Databases(client);

async function run() {
  try {
    const col = await db.getCollection("6a6177dd0032115b3906", "movimientos");
    console.log("OLD MOVIMIENTOS PERMISSIONS:", col.$permissions);

    const updated = await db.updateCollection(
      "6a6177dd0032115b3906",
      "movimientos",
      col.name,
      [
        Permission.read(Role.any()),
        Permission.create(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any())
      ],
      col.documentSecurity
    );
    console.log("SUCCESS UPDATING MOVIMIENTOS PERMISSIONS:", updated.$permissions);
  } catch (err) {
    console.error("ERROR:", err);
  }
}

run();

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
const invite = JSON.parse(
  await readFile(new URL("../.data/playtest.json", import.meta.url), "utf8"),
);
const base = invite.origin;
const report = {
  date: new Date().toISOString(),
  origin: base,
  physicalDevice: false,
};
const request = async (method, url, payload, cookie) =>
  fetch(base + url, {
    method,
    headers: {
      Origin: base,
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(15000),
  });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
report.separateAccessCodeRequired = false;
const clients = [];
let room;
try {
  for (let i = 0; i < 2; i++) {
    const guest = await request("POST", "/api/v1/guests", {
      name: `Tunnel probe ${i + 1}`,
    });
    check(
      guest.ok,
      "Guest handshake failed without a separate access password",
    );
    const setCookie = guest.headers.get("set-cookie");
    check(
      setCookie && /httponly/i.test(setCookie) && /secure/i.test(setCookie),
      "Expected secure HttpOnly identity cookie",
    );
    const cookie = setCookie.split(";")[0];
    if (!room) {
      const created = await request(
        "POST",
        "/api/v1/rooms",
        {
          name: "Tunnel probe",
          gameMode: "spotlight",
          seatCount: 2,
          packId: "goa-trip",
          mode: "remote",
          spice: "mild",
          adult: false,
        },
        cookie,
      );
      check(created.status === 201, "Room creation failed");
      room = await created.json();
      check(/^[A-Z0-9]{6}$/.test(room.code), "Room code was not generated");
    } else
      check(
        (await request("POST", `/api/v1/rooms/${room.code}/join`, {}, cookie))
          .ok,
        "Join failed",
      );
    const socket = new WebSocket(
      base.replace("https:", "wss:") + "/api/v1/realtime",
      { headers: { Origin: base, Cookie: cookie }, handshakeTimeout: 15000 },
    );
    const client = { socket, cookie, messages: [], state: null };
    clients.push(client);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Snapshot timeout")),
        15000,
      );
      socket.on("message", (raw) => {
        const m = JSON.parse(raw);
        client.messages.push(m);
        if (m.type === "state") {
          client.state = m.snapshot;
          clearTimeout(timeout);
          resolve();
        }
        if (m.type === "error") {
          clearTimeout(timeout);
          reject(new Error(m.code));
        }
      });
      socket.once("error", reject);
      socket.once("open", () =>
        socket.send(
          JSON.stringify({
            type: "connect",
            protocol_version: 3,
            roomId: room.roomId,
          }),
        ),
      );
    });
  }
  for (const client of clients) {
    const cid = randomUUID();
    const accepted = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("ACK timeout")), 10000);
      const onMessage = (raw) => {
        const m = JSON.parse(raw);
        if (m.type === "ack" && m.cid === cid) {
          clearTimeout(timeout);
          client.socket.off("message", onMessage);
          m.accepted ? resolve() : reject(new Error("Ready rejected"));
        }
      };
      client.socket.on("message", onMessage);
    });
    client.socket.send(
      JSON.stringify({
        type: "intent",
        protocol_version: 3,
        runId: room.runId,
        intent: {
          type: "ready",
          ready: true,
          cid,
          stepId: client.state.step.id,
          phaseEpoch: client.state.phaseEpoch,
        },
      }),
    );
    await accepted;
  }
  report.secureCookies = true;
  report.authorizedSocketClients = 2;
  report.acceptedReadyIntents = 2;
  report.generatedRoomCode = true;
  report.developerRoutesExcluded =
    (await request("GET", "/dev")).status === 404 &&
    (await request("GET", "/preview")).status === 404;
  check(report.developerRoutesExcluded, "Developer routes exposed");
  report.health = await (await request("GET", "/api/v1/health")).json();
} finally {
  if (room && clients[0])
    await request(
      "POST",
      `/api/v1/rooms/${room.roomId}/end`,
      {},
      clients[0].cookie,
    );
  for (const c of clients) c.socket.close();
}
await mkdir(new URL("../work-log/verification/", import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL(
    "../work-log/verification/2026-10-31-room-invites-tunnel.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
